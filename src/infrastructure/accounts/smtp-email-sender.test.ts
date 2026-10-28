/**
 * The SMTP email sender's tests.
 *
 * The property that matters is the **failure path**: a send failure is
 * never swallowed, because PRD §10 requires the failure to be *recorded* and
 * a swallowed error is an unrecorded failure. The caller catches it, logs
 * it, and lets the triggering action stand.
 *
 * The second property is the **STARTTLS upgrade**. The test server speaks
 * STARTTLS with a real certificate, so the test proves the client's socket
 * is genuinely replaced by an encrypted one — a `STARTTLS` that was issued
 * but not honoured would send the password and the message in plaintext.
 *
 * **The test server records the conversation in two places**: `plaintext`
 * holds the lines it received before the upgrade, and `secure` holds the
 * lines it received after it. A test can then assert *where* each line
 * arrived, which is the only way to prove the message body never crossed
 * the wire in the clear.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TLSSocket } from 'node:tls';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readSmtpConfig, SmtpEmailSender } from './smtp-email-sender';
import type { OutboundEmail } from '@/application/ports/email-sender';

const MESSAGE: OutboundEmail = {
  to: 'jane@example.org',
  subject: 'Your FindBack account is approved',
  textBody: 'Hi Jane, your account is approved.',
  htmlBody: '<p>Hi Jane, your account is approved.</p>',
};

/** The generated certificate and key, for the test server. */
let certificateDirectory = '';
let certificatePem = '';
let keyPem = '';

/**
 * A minimal SMTP server that speaks STARTTLS.
 *
 * The greeting advertises the capability, the `STARTTLS` command upgrades
 * the socket, and the conversation continues over TLS.
 */
class FakeSmtpServer {
  private server: Server | null = null;

  /** The lines received **before** the upgrade. */
  readonly plaintext: string[] = [];

  /** The lines received **after** the upgrade. */
  readonly secure: string[] = [];

  /** When set, the server refuses the message at this stage. */
  failAt: 'mail-from' | 'data' | null = null;

  /** Whether the connection was upgraded to TLS. */
  upgraded = false;

  async start(): Promise<number> {
    this.server = createServer((socket: Socket) => {
      this.handleConnection(socket);
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(0, '127.0.0.1', resolve);
    });

    const address = this.server.address();

    if (address === null || typeof address === 'string') {
      throw new Error('The fake SMTP server did not bind a port.');
    }

    return address.port;
  }

  /**
   * One connection.
   *
   * `current` is the socket the conversation is read from: the plain one,
   * until the STARTTLS upgrade replaces it.
   */
  private handleConnection(socket: Socket): void {
    socket.write('220 fake-smtp ready ESMTP\r\n');

    let current: Socket = socket;
    let buffer = '';

    // True between the `DATA` command and the terminating dot. In that mode
    // the server reads the message body and answers **only** the
    // terminator — answering each body line would put a response in the
    // client's stream that it is not waiting for.
    let inData = false;

    // The `AUTH LOGIN` exchange is three commands: the mechanism, the
    // user name, and the password. The first two are answered with `334`
    // ("continue"), the third with `235` ("authenticated").
    let authStep = 0;

    const handle = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');

      let newlineIndex = buffer.indexOf('\r\n');

      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);

        buffer = buffer.slice(newlineIndex + 2);

        this.record(current, line);

        if (line === 'STARTTLS') {
          socket.write('220 ready to start TLS\r\n');

          // Stop reading plaintext **before** the upgrade, or the
          // ClientHello is parsed as an SMTP command and the handshake
          // fails with "bad record type".
          current.removeListener('data', handle);
          buffer = '';

          this.upgrade(socket, (secure) => {
            current = secure;
            this.upgraded = true;
            current.on('data', handle);
            socket.resume();
          });

          newlineIndex = buffer.indexOf('\r\n');
          continue;
        }

        if (inData) {
          // The body is read but not answered. The terminator is.
          if (line === '.') {
            inData = false;
            current.write('250 queued\r\n');
          }

          newlineIndex = buffer.indexOf('\r\n');
          continue;
        }

        // **Every** response is written to `current`, which is the secure
        // socket after the upgrade. Writing to the raw socket would send
        // plaintext inside the TLS stream, and the client would reject it
        // with "bad record type".
        if (line === 'AUTH LOGIN') {
          authStep = 1;
          current.write('334 continue\r\n');
        } else if (authStep === 1) {
          authStep = 2;
          current.write('334 continue\r\n');
        } else if (authStep === 2) {
          authStep = 0;
          current.write('235 authenticated\r\n');
        } else if (line.startsWith('MAIL FROM') && this.failAt === 'mail-from') {
          current.write('550 rejected\r\n');
        } else if (line.startsWith('MAIL FROM')) {
          current.write('250 ok\r\n');
        } else if (line.startsWith('RCPT TO')) {
          current.write('250 ok\r\n');
        } else if (line === 'DATA') {
          if (this.failAt === 'data') {
            current.write('554 rejected\r\n');
          } else {
            inData = true;
            current.write('354 send it\r\n');
          }
        } else if (line === 'QUIT') {
          current.write('221 bye\r\n');
          current.end();
        } else if (line.startsWith('EHLO')) {
          // The capabilities. This is where `STARTTLS` is advertised — the
          // greeting is not.
          current.write('250-fake-smtp\r\n');
          current.write('250-STARTTLS\r\n');
          current.write('250 AUTH LOGIN\r\n');
        } else {
          current.write('250 ok\r\n');
        }

        newlineIndex = buffer.indexOf('\r\n');
      }
    };

    socket.on('data', handle);
  }

  /** Record a line against the channel it arrived on. */
  private record(channel: Socket, line: string): void {
    if (channel instanceof TLSSocket) {
      this.secure.push(line);
    } else {
      this.plaintext.push(line);
    }
  }

  /**
   * Upgrade the socket to TLS.
   *
   * The server side of the upgrade: a TLS socket over the existing
   * connection. The socket is paused first, so the handshake — and not an
   * SMTP line — is the next thing read from the wire, and resumed once the
   * handshake has completed.
   */
  private upgrade(socket: Socket, onDone: (secure: Socket) => void): void {
    socket.pause();

    const secure = new TLSSocket(socket, {
      isServer: true,
      key: keyPem,
      cert: certificatePem,
    });

    secure.once('secure', () => {
      onDone(secure);
    });

    secure.once('error', () => {
      // The connection is closed by the client anyway.
    });
  }

  async stop(): Promise<void> {
    // A server that was never started has nothing to close, and `close`
    // would never call back.
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });

    this.server = null;
  }
}

/** The sender's configuration, pointed at the fake server. */
function aSender(port: number, overrides: Record<string, unknown> = {}) {
  return new SmtpEmailSender({
    host: '127.0.0.1',
    port,
    user: null,
    password: null,
    from: 'FindBack <no-reply@example.org>',
    secure: false,
    ca: certificatePem,
    ...overrides,
  });
}

describe('the SMTP sender', () => {
  let server: FakeSmtpServer;

  beforeAll(() => {
    certificateDirectory = mkdtempSync(join(tmpdir(), 'findback-smtp-'));

    const keyPath = join(certificateDirectory, 'key.pem');
    const certPath = join(certificateDirectory, 'cert.pem');

    // A self-signed certificate for 127.0.0.1. It is a test fixture, not a
    // credential, and it lives in a temporary directory.
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
      ],
      { stdio: 'ignore' },
    );

    keyPem = readFileSync(keyPath, 'utf8');
    certificatePem = readFileSync(certPath, 'utf8');
  });

  afterAll(() => {
    rmSync(certificateDirectory, { recursive: true, force: true });
  });

  beforeEach(() => {
    server = new FakeSmtpServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('sends the message over an upgraded TLS connection', async () => {
    const port = await server.start();

    await aSender(port).send(MESSAGE);

    // The connection really was upgraded.
    expect(server.upgraded).toBe(true);

    // The message body arrived **over TLS**, never in the clear.
    expect(server.plaintext).not.toContain('MAIL FROM:<no-reply@example.org>');
    expect(server.secure).toContain('MAIL FROM:<no-reply@example.org>');
    expect(server.secure).toContain('RCPT TO:<jane@example.org>');
    expect(server.secure).toContain('DATA');
    expect(server.secure).toContain('QUIT');

    // The body is on the secure channel, and the plaintext channel never
    // saw a line of it.
    expect(server.secure.join('\n')).toContain('Hi Jane, your account is approved.');
    expect(server.plaintext.join('\n')).not.toContain('Hi Jane, your account is approved.');

    // The `STARTTLS` command itself is plaintext — that is how the upgrade
    // is negotiated — and the message is not.
    expect(server.plaintext).toContain('STARTTLS');
    expect(server.plaintext).toContain('EHLO findback');
  });

  it('authenticates over the encrypted connection', async () => {
    const port = await server.start();

    await aSender(port, {
      user: 'postmaster',
      password: 'secret',
    }).send(MESSAGE);

    // The base64 credentials are on the **secure** channel only.
    const encodedUser = Buffer.from('postmaster').toString('base64');
    const encodedPassword = Buffer.from('secret').toString('base64');

    expect(server.secure).toContain(encodedUser);
    expect(server.secure).toContain(encodedPassword);
    expect(server.plaintext).not.toContain(encodedUser);
    expect(server.plaintext).not.toContain(encodedPassword);
  });

  it('throws when the server refuses the message', async () => {
    // The failure must **propagate**, so the caller can record it.
    const port = await server.start();
    server.failAt = 'mail-from';

    await expect(aSender(port).send(MESSAGE)).rejects.toThrow();
  });

  it('throws when the server refuses the data', async () => {
    const port = await server.start();
    server.failAt = 'data';

    await expect(aSender(port).send(MESSAGE)).rejects.toThrow();
  });

  it('refuses a server that does not offer STARTTLS', async () => {
    // Without the upgrade, the password and the message would go out in
    // plaintext. The sender refuses rather than sending them.
    const plainServer = createServer((socket: Socket) => {
      socket.write('220 no-tls here\r\n');
      socket.on('data', () => {
        socket.write('250 ok\r\n');
      });
    });

    await new Promise<void>((resolve) => {
      plainServer.listen(0, '127.0.0.1', resolve);
    });

    const address = plainServer.address();

    if (address === null || typeof address === 'string') {
      throw new Error('The plain server did not bind a port.');
    }

    // The fake server answers `EHLO` without the STARTTLS capability.
    await expect(aSender(address.port).send(MESSAGE)).rejects.toThrow(/STARTTLS/);

    await new Promise<void>((resolve) => {
      plainServer.close(() => resolve());
    });
  });

  it('refuses a relay whose certificate does not match the host', async () => {
    // The upgrade is encrypted **to the host that was asked for**. A relay
    // presenting a certificate for a different name is refused rather than
    // trusted — otherwise the connection would be encrypted to whoever
    // answered, not to the configured relay.
    const port = await server.start();

    // The certificate is for 127.0.0.1, but the sender is pointed at
    // `localhost` — a name the certificate does not carry.
    await expect(
      aSender(port, { host: 'localhost', ca: undefined }).send(MESSAGE),
    ).rejects.toThrow();
  });
});

describe('the SMTP configuration', () => {
  it('is null when SMTP is not configured', () => {
    // The local-development case (CP-4): the provider is not available, and
    // the email is verified by automated test only.
    expect(readSmtpConfig({})).toBeNull();
  });

  it('reads the host, port, and credentials', () => {
    const config = readSmtpConfig({
      SMTP_HOST: 'smtp.example.org',
      SMTP_PORT: '2525',
      SMTP_USER: 'user',
      SMTP_PASSWORD: 'secret',
      EMAIL_FROM: 'FindBack <no-reply@example.org>',
    });

    expect(config).toEqual({
      host: 'smtp.example.org',
      port: 2525,
      user: 'user',
      password: 'secret',
      from: 'FindBack <no-reply@example.org>',
      secure: false,
      ca: undefined,
    });
  });

  it('uses implicit TLS on port 465', () => {
    const config = readSmtpConfig({ SMTP_HOST: 'smtp.example.org', SMTP_PORT: '465' });

    expect(config?.secure).toBe(true);
  });

  it('defaults to port 587', () => {
    const config = readSmtpConfig({ SMTP_HOST: 'smtp.example.org' });

    expect(config?.port).toBe(587);
  });

  it('defaults the from address', () => {
    const config = readSmtpConfig({ SMTP_HOST: 'smtp.example.org' });

    expect(config?.from).toContain('no-reply');
  });

  it('reads a custom certificate authority', () => {
    // A relay with a private certificate authority needs its root.
    const config = readSmtpConfig({
      SMTP_HOST: 'smtp.example.org',
      SMTP_TLS_CA: '/etc/ssl/relay-root.pem',
    });

    expect(config?.ca).toBe('/etc/ssl/relay-root.pem');
  });
});
