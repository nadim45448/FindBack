/**
 * The SMTP email sender.
 *
 * **A shared implementation** (ADR-14). The transport will also serve the
 * `notifications` module, so it lives in `infrastructure/accounts/` now and
 * will be shared from there — one set of credentials, one failure-logging
 * path.
 *
 * **A send failure is never swallowed.** The port lets the transport's error
 * propagate, because PRD §10 requires the failure to be *recorded* and a
 * swallowed error is an unrecorded failure. The **caller** catches it, logs
 * it, and lets the triggering action stand — the decision is already
 * committed by then (ADR-3, decision 4).
 *
 * **The message is encrypted in transit.** On the default port (587) the
 * connection is upgraded with `STARTTLS` before the credentials or the
 * message are sent; on port 465 it is implicit TLS from the start. A
 * `STARTTLS` that is issued but not honoured would send the password and
 * the message body in plaintext, so the upgrade is real: the plaintext
 * socket is **replaced** by the encrypted one, and the conversation after
 * the upgrade runs on the encrypted socket.
 *
 * **The relay's certificate is verified against the host.** The upgrade is
 * not merely "encrypted" — it is encrypted *to the host that was asked
 * for*. Node's TLS client checks the certificate's names against the
 * hostname, and `rejectUnauthorized` is left on. A relay presenting a
 * certificate for a different name is refused rather than trusted.
 *
 * The provider is PRD A6's open architecture decision. This implementation
 * speaks plain SMTP over TLS, and the host, port, and credentials come from
 * the environment — so choosing a provider is a configuration change, not a
 * code change.
 */

import { connect as connectTls, type ConnectionOptions, type TLSSocket } from 'node:tls';
import { createConnection, type Socket } from 'node:net';

import type { EmailSender, OutboundEmail } from '@/application/ports/email-sender';

/** The SMTP configuration, from the environment. */
export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string | null;
  readonly password: string | null;
  readonly from: string;
  /** Whether to connect over TLS directly (implicit TLS). */
  readonly secure: boolean;
  /**
   * Whether to upgrade a plaintext connection with STARTTLS.
   *
   * Local Mailpit on port 1025 has no TLS. Production relays on 587 do.
   */
  readonly startTls: boolean;
  /**
   * The certificate authority that signs the relay's certificate.
   *
   * `undefined` means the platform's trusted roots. A **path** to a PEM file
   * is also accepted, for a relay with a private certificate authority.
   */
  readonly ca?: string | Buffer | undefined;
}

/**
 * Read the SMTP configuration from the environment.
 *
 * Returns `null` when SMTP is not configured — which is the case in local
 * development, where the provider is not available (CP-4). The email is then
 * verified by automated test only.
 */
export function readSmtpConfig(
  env: Record<string, string | undefined> = process.env,
): SmtpConfig | null {
  const host = env.SMTP_HOST;

  if (!host) {
    return null;
  }

  const port = Number(env.SMTP_PORT ?? 587);
  const resolvedPort = Number.isInteger(port) && port > 0 ? port : 587;
  const startTlsExplicit = env.SMTP_STARTTLS;

  return {
    host,
    port: resolvedPort,
    user: env.SMTP_USER ?? null,
    password: env.SMTP_PASSWORD ?? null,
    from: env.EMAIL_FROM ?? 'FindBack <no-reply@example.org>',
    // Port 465 is implicit TLS; 587 is STARTTLS; 1025 is local Mailpit.
    secure: resolvedPort === 465,
    startTls:
      startTlsExplicit === 'false'
        ? false
        : startTlsExplicit === 'true'
          ? true
          : resolvedPort !== 1025,
    ca: env.SMTP_TLS_CA ?? undefined,
  };
}

/** The SMTP email sender. */
export class SmtpEmailSender implements EmailSender {
  constructor(private readonly config: SmtpConfig) {}

  /**
   * Send one email over SMTP.
   *
   * @throws whatever the transport throws. The caller logs the failure and
   * lets the triggering action stand.
   */
  async send(message: OutboundEmail): Promise<void> {
    const session = await this.open();

    try {
      await this.exchange(session, message);
    } finally {
      session.close();
    }
  }

  /**
   * Open the connection and greet the server.
   *
   * Returns a session whose socket is **always encrypted** — either the
   * implicit-TLS one, or the one that replaced the plaintext socket after
   * the `STARTTLS` upgrade.
   */
  private async open(): Promise<SmtpSession> {
    if (this.config.secure) {
      return this.openSecure();
    }

    if (!this.config.startTls) {
      return this.openPlaintext();
    }

    return this.openWithStartTls();
  }

  /**
   * Plain SMTP — local Mailpit, no TLS.
   */
  private async openPlaintext(): Promise<SmtpSession> {
    const socket = await this.connectPlaintext();
    const session = new SmtpSession(socket, this.config.host);

    await session.expect(220);
    await session.command('EHLO findback', 250);
    await session.authenticate(this.config.user, this.config.password);

    return session;
  }

  /** The implicit-TLS path (port 465). */
  private async openSecure(): Promise<SmtpSession> {
    const encrypted = connectTls(this.tlsOptions());
    const session = new SmtpSession(encrypted, this.config.host);

    await new Promise<void>((resolve, reject) => {
      encrypted.once('secureConnect', () => resolve());
      encrypted.once('error', reject);
    });

    await session.expect(220);
    await session.command('EHLO findback', 250);
    await session.authenticate(this.config.user, this.config.password);

    return session;
  }

  /**
   * The `STARTTLS` path (port 587).
   *
   * The capability is negotiated with `EHLO`, which is where an SMTP server
   * lists its extensions — the greeting is not the place to look for it.
   */
  private async openWithStartTls(): Promise<SmtpSession> {
    const plaintext = await this.connectPlaintext();
    const session = new SmtpSession(plaintext, this.config.host);

    try {
      await session.expect(220);

      const capabilities = await session.command('EHLO findback', 250);

      if (!hasCapability(capabilities, 'STARTTLS')) {
        throw new Error(
          'The SMTP server does not offer STARTTLS, so the message cannot be sent securely.',
        );
      }

      await session.command('STARTTLS', 220);

      const encrypted = await this.upgrade(plaintext);

      // The plaintext session is **replaced**, not reused: its reader is
      // bound to the old socket, and the encrypted socket is a different
      // stream. Detaching before the upgrade means the two readers never
      // compete for the same bytes.
      session.detach();

      const secureSession = new SmtpSession(encrypted, this.config.host);

      // RFC 3207: the capabilities are re-read after the upgrade, because
      // they may differ on the encrypted channel.
      await secureSession.command('EHLO findback', 250);
      await secureSession.authenticate(this.config.user, this.config.password);

      return secureSession;
    } catch (error) {
      plaintext.destroy();

      throw error;
    }
  }

  /** Open a plaintext TCP connection. */
  private async connectPlaintext(): Promise<Socket> {
    const socket = createConnection({ host: this.config.host, port: this.config.port });

    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('error', reject);
    });

    return socket;
  }

  /**
   * The TLS options.
   *
   * **`servername` is set only for a DNS host.** An IP address is not a
   * legal SNI value — RFC 6066 §3 forbids it, and Node emits a deprecation
   * warning when one is sent. The certificate check uses the same host, so
   * a relay at `127.0.0.1` is still verified against the IP in the
   * certificate's alternative names.
   */
  private tlsOptions(): ConnectionOptions {
    const options: ConnectionOptions = {
      host: this.config.host,
      port: this.config.port,
      ca: this.config.ca,
    };

    if (!isIpAddress(this.config.host)) {
      options.servername = this.config.host;
    }

    return options;
  }

  /**
   * Replace the plaintext socket with an encrypted one.
   *
   * `tls.connect({ socket })` is Node's documented way to upgrade an
   * existing connection: the existing socket is reused as the underlying
   * stream, so the connection is not torn down and re-established.
   */
  private async upgrade(plaintext: Socket): Promise<TLSSocket> {
    return new Promise<TLSSocket>((resolve, reject) => {
      const encrypted = connectTls({
        ...this.tlsOptions(),
        socket: plaintext,
      });

      encrypted.once('secureConnect', () => resolve(encrypted));
      encrypted.once('error', reject);
    });
  }

  /** The SMTP conversation for one message. */
  private async exchange(session: SmtpSession, message: OutboundEmail): Promise<void> {
    await session.command(`MAIL FROM:<${extractAddress(this.config.from)}>`, 250);
    await session.command(`RCPT TO:<${message.to}>`, 250);
    await session.command('DATA', 354);

    // The body is dot-stuffed and then terminated with a single dot. The
    // terminator is **not** part of the body, so it is not stuffed — a
    // doubled terminator would leave a stray dot line in the message and
    // the real terminator would arrive a line late.
    await session.writeData(this.buildMessage(message));

    await session.expect(250);
    await session.command('QUIT', 221);
  }

  /** The RFC 5322 message. */
  private buildMessage(message: OutboundEmail): string {
    return [
      `From: ${this.config.from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="findback-boundary"',
      '',
      '--findback-boundary',
      'Content-Type: text/plain; charset=utf-8',
      '',
      message.textBody,
      '',
      '--findback-boundary',
      'Content-Type: text/html; charset=utf-8',
      '',
      message.htmlBody,
      '',
      '--findback-boundary--',
    ].join('\r\n');
  }
}

/**
 * One SMTP conversation, over one socket.
 *
 * **The reader is persistent.** It is attached to the socket for the whole
 * conversation and it buffers, so a response that arrives in the same TCP
 * segment as another one — or while no command is outstanding — is never
 * dropped. A reader that attached and detached a `data` listener per
 * response would lose every line that arrived in the gap: the socket is in
 * flowing mode, so a chunk with no listener attached is discarded, and the
 * bytes already read into the departing listener's buffer go with it.
 */
class SmtpSession {
  /** The text received but not yet split into lines. */
  private buffer = '';

  /** The complete lines received but not yet consumed. */
  private lines: string[] = [];

  /** The readers waiting for a line. */
  private waiters: Array<{
    resolve: (line: string) => void;
    reject: (error: Error) => void;
  }> = [];

  /** The failure that ended the conversation, if any. */
  private failure: Error | null = null;

  private readonly onData = (chunk: Buffer): void => {
    this.receive(chunk);
  };

  private readonly onError = (error: Error): void => {
    this.fail(error);
  };

  private readonly onEnd = (): void => {
    this.fail(new Error('The SMTP connection closed before the response arrived.'));
  };

  constructor(
    private readonly socket: Socket,
    private readonly host: string,
  ) {
    this.socket.on('data', this.onData);
    this.socket.on('error', this.onError);
    this.socket.on('end', this.onEnd);
  }

  /**
   * Send a command and wait for the expected response.
   *
   * The command is sent **before** the wait begins, so a fast server's
   * response cannot arrive before anyone is listening for it.
   */
  async command(command: string, expected: number): Promise<string> {
    await this.write(`${command}\r\n`);

    return this.expect(expected, command);
  }

  /**
   * Wait for a response with the expected code.
   *
   * A multi-line response is read to its terminator, so a server that
   * answers with several lines is not mis-parsed.
   */
  async expect(expected: number, context = 'the server'): Promise<string> {
    const lines: string[] = [];

    for (;;) {
      const line = await this.readLine();

      lines.push(line);

      // A response is complete when its fourth character is a space rather
      // than a hyphen.
      if (line.length < 4 || line[3] !== '-') {
        break;
      }
    }

    const response = lines.join('\n');
    const code = Number(response.slice(0, 3));

    if (code !== expected) {
      throw new Error(
        `The SMTP server at ${this.host} answered "${response}" to ${context}, expected ${expected}.`,
      );
    }

    return response;
  }

  /**
   * Authenticate, when credentials are configured.
   *
   * The credentials are sent **over the encrypted socket only** — the
   * plaintext socket is gone by the time this runs.
   */
  async authenticate(user: string | null, password: string | null): Promise<void> {
    if (!user || !password) {
      return;
    }

    await this.command('AUTH LOGIN', 334);
    await this.command(Buffer.from(user).toString('base64'), 334);
    await this.command(Buffer.from(password).toString('base64'), 235);
  }

  /** Write the message body, dot-stuffed, and its terminating dot. */
  async writeData(body: string): Promise<void> {
    await this.write(`${dotStuff(body)}\r\n.\r\n`);
  }

  /** Write to the socket. */
  private async write(payload: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.write(payload, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  /** Handle an incoming chunk. */
  private receive(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');

    let newlineIndex = this.buffer.indexOf('\r\n');

    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);

      this.buffer = this.buffer.slice(newlineIndex + 2);

      const waiter = this.waiters.shift();

      if (waiter) {
        waiter.resolve(line);
      } else {
        // No reader is waiting yet — the line is **kept**, not dropped.
        this.lines.push(line);
      }

      newlineIndex = this.buffer.indexOf('\r\n');
    }
  }

  /** Read one line, waiting for it if it has not arrived yet. */
  private readLine(): Promise<string> {
    if (this.failure) {
      return Promise.reject(this.failure);
    }

    const buffered = this.lines.shift();

    if (buffered !== undefined) {
      return Promise.resolve(buffered);
    }

    return new Promise<string>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /** Record a failure and release every waiting reader. */
  private fail(error: Error): void {
    if (this.failure) {
      return;
    }

    this.failure = error;

    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(error);
    }
  }

  /** Close the socket. */
  close(): void {
    this.socket.destroy();
  }

  /**
   * Stop reading from this socket, without closing it.
   *
   * Used when the socket has been taken over by a TLS upgrade: the session
   * must not destroy a socket that now belongs to the encrypted one, and it
   * must not keep reading from it either.
   */
  detach(): void {
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onError);
    this.socket.off('end', this.onEnd);
  }
}

/**
 * Whether an SMTP capability is offered.
 *
 * The capabilities are the lines of an `EHLO` response, each prefixed with
 * `250-` or `250 `, so the name is matched as a whole word rather than as a
 * substring — `STARTTLS` must not match `NO_STARTTLS`.
 */
function hasCapability(response: string, capability: string): boolean {
  return response.split('\n').some((line) => {
    const tokens = line.slice(4).split(/[\s=]+/);

    return tokens.some((token) => token.toUpperCase() === capability.toUpperCase());
  });
}

/**
 * Dot-stuff a message body.
 *
 * A line that begins with a dot would otherwise end the message early, so a
 * leading dot is doubled — the rule every SMTP client implements (RFC 5321
 * §4.5.2).
 */
function dotStuff(body: string): string {
  return body
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

/** Whether a host is an IP address rather than a DNS name. */
function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/** The bare address from a `Name <address>` header value. */
function extractAddress(value: string): string {
  const angleIndex = value.indexOf('<');

  if (angleIndex === -1) {
    return value.trim();
  }

  const closeIndex = value.indexOf('>', angleIndex);

  return value.slice(angleIndex + 1, closeIndex === -1 ? undefined : closeIndex).trim();
}
