/**
 * The reset token's redaction from a URL.
 *
 * **The reset link carries the token in its URL fragment**, after the `#`.
 * The fragment is not sent to the server, so the token never reaches the
 * request line — which is what a platform's access log records — and
 * therefore never reaches an access log.
 *
 * The PRD's FR-37 says the reset token must never be logged, and the
 * technical design makes that concrete: *"the request log for this route
 * therefore redacts the `token` query parameter."*
 *
 * **That mechanism does not work, and it was found by measurement rather
 * than by reading.** A live request to `/reset-password?token=…` was
 * observed in the server's request log carrying the **full token**. A
 * proxy that rewrote the request's URL to strip the token did **not**
 * remove it from the log, because the logged URL is the **original**
 * request URL — the one on the wire — and not the rewritten one. The
 * access log is written before any application code runs, so no proxy and
 * no route handler can redact it.
 *
 * **Moving the token to the fragment fixes the problem at its root.** The
 * fragment is not part of the request line, so there is nothing for an
 * access log to record. The redaction below remains as a **defence in
 * depth**: if a URL carrying a token ever reaches something that *would*
 * log it — a browser's history, a referrer header, a client-side error
 * report — the token is replaced before it can be written.
 *
 * Pure — no I/O, no framework imports.
 */

/** The parameter that carries the reset token. */
export const RESET_TOKEN_QUERY_PARAM = 'token';

/**
 * The header the token is moved into, once the URL has been redacted.
 *
 * The token is moved, not destroyed. A header is not part of the request
 * line, and so it is not in an access log.
 *
 * The name is namespaced to this application, so it cannot collide with a
 * platform header or with another application's convention.
 */
export const RESET_TOKEN_HEADER = 'x-findback-reset-token';

/**
 * The value that replaces a redacted parameter's value.
 *
 * **No characters that a URL would percent-encode.** A bracketed marker
 * would reach the log as `%5Bredacted%5D`, which is legible to nobody
 * reading an access log at three in the morning. The marker is therefore
 * made only of characters that survive encoding unchanged.
 */
export const REDACTED_VALUE = 'redacted';

/**
 * Redact the reset token from a URL.
 *
 * **Both the query string and the fragment are covered.** The token lives
 * in the fragment by design, but a URL assembled by hand, by an older
 * client, or by a redirect might still carry it in the query string, and
 * the query string is the part that *is* logged. Redacting only one of the
 * two would leave a gap that only shows up in production.
 *
 * The **whole** parameter is replaced, not just the part of it that looks
 * like a token. A partial redaction is a redaction that can be got wrong:
 * a token's characters are base64url, which is the same alphabet as an
 * ordinary query value, so there is no way to tell where a token ends
 * without knowing the token — and the point of the redaction is that the
 * logger does not know it.
 *
 * The URL's **shape** survives — the path, the other parameters, and the
 * fact that a token was present. A log line that says
 * `/reset-password#token=redacted` tells a reader that a reset was
 * attempted, which is the fact worth logging. A log line that said
 * `/reset-password#token=abc123…` would hand over the credential.
 *
 * A URL with no token parameter is returned unchanged. So is one whose
 * token parameter is empty — there is nothing to leak, and replacing it
 * would misreport an empty parameter as a present one.
 *
 * The parameter name is matched **exactly and case-sensitively**, because
 * the reset link's parameter is `token` and a case-insensitive match would
 * redact unrelated parameters whose names merely resemble it.
 */
export function redactResetToken(url: string): string {
  const fragmentAt = url.indexOf('#');
  const queryAt = url.indexOf('?');

  // The fragment wins when both are present: it is the later section, and
  // the query string then ends where the fragment begins.
  const sections: Array<{ readonly start: number; readonly end: number }> = [];

  if (queryAt !== -1) {
    sections.push({
      start: queryAt + 1,
      end: fragmentAt === -1 ? url.length : fragmentAt,
    });
  }

  if (fragmentAt !== -1) {
    sections.push({ start: fragmentAt + 1, end: url.length });
  }

  if (sections.length === 0) {
    return url;
  }

  // The sections are rebuilt from the **last** one backwards, so an earlier
  // section's offsets stay valid as later ones change length.
  let result = url;

  for (const section of sections.reverse()) {
    const body = url.slice(section.start, section.end);
    const redacted = redactParameters(body);

    if (redacted === body) {
      continue;
    }

    result = result.slice(0, section.start) + redacted + result.slice(section.end);
  }

  return result;
}

/**
 * Redact the token in one section's parameters.
 *
 * The section's parameters are separated by `&` — the separator a URL uses
 * for both a query string and a fragment.
 */
function redactParameters(section: string): string {
  const parameters = section.split('&');
  let redacted = false;

  const redactedParameters = parameters.map((parameter) => {
    const equals = parameter.indexOf('=');

    if (equals === -1) {
      return parameter;
    }

    const name = parameter.slice(0, equals);
    const value = parameter.slice(equals + 1);

    if (name !== RESET_TOKEN_QUERY_PARAM || value.length === 0) {
      return parameter;
    }

    redacted = true;

    return `${name}=${REDACTED_VALUE}`;
  });

  return redacted ? redactedParameters.join('&') : section;
}
