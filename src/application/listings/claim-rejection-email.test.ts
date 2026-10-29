/**
 * The FR-29 claim-rejection email suite.
 *
 * **The withdrawal suite injects a fake builder,** so the real one is
 * exercised only here. That matters because the real builder does two things
 * the fake cannot: it decides the copy, and it **escapes the reason**.
 *
 * **The reason is administrator- or system-supplied free text, and it goes
 * into an HTML body.** Without escaping, a reason containing `<` could inject
 * markup into the recipient's client. This suite asserts the escaping
 * directly, because the injection path is invisible in the copy and would
 * not be caught by an assertion about the message's wording.
 *
 * **No Sensitive Field is carried.** The email names the claim's reference
 * and the reason; it does not carry the item's description, the exact place,
 * or the identifying details. Those are FR-37 Sensitive Fields, and an
 * email is a channel outside the application's access control.
 */

import { describe, expect, it } from 'vitest';

import {
  CLAIM_REJECTION_SUBJECT,
  claimRejectionHtmlBody,
  claimRejectionTextBody,
  DefaultClaimRejectionEmailBuilder,
} from './claim-rejection-email';

describe('the claim-rejection subject', () => {
  it('is the same for every rejection trigger', () => {
    // **The PRD treats these as one event with a varying reason.** A subject
    // that changed with the reason would make the trigger visible to the
    // recipient in a way the UX does not intend.
    expect(CLAIM_REJECTION_SUBJECT).toBe('Your claim was not accepted');
  });
});

describe('the claim-rejection text body', () => {
  it('carries the reason', () => {
    const body = claimRejectionTextBody('report withdrawn by reporter');

    expect(body).toContain('report withdrawn by reporter');
  });

  it('says the report is no longer active', () => {
    const body = claimRejectionTextBody('report withdrawn by reporter');

    expect(body).toContain('no longer active');
  });

  it('carries no Sensitive Field', () => {
    // **The email does not name the item.** The description, the exact
    // place, and the identifying details are FR-37 Sensitive Fields, and an
    // email is outside the application's access control.
    const body = claimRejectionTextBody('report withdrawn by reporter');

    expect(body).not.toContain('Monogram');
    expect(body).not.toContain('east stacks');
    expect(body).not.toContain('leather wallet');
  });
});

describe('the claim-rejection HTML body', () => {
  it('carries the same facts as the text body', () => {
    // **A recipient whose client does not render HTML must read the same
    // facts.** An HTML body that carries more than the text body is a
    // divergence waiting to happen.
    const reason = 'report withdrawn by reporter';
    const text = claimRejectionTextBody(reason);
    const html = claimRejectionHtmlBody(reason);

    expect(html).toContain('Your claim was not accepted.');
    expect(html).toContain(reason);
    expect(html).toContain('no longer active');
    expect(text).toContain(reason);
  });

  it('escapes the markup characters in the reason', () => {
    // **The injection path.** The reason is free text that reaches an HTML
    // body, so the five characters that carry meaning in HTML must be
    // escaped — otherwise a reason containing markup would inject it.
    const html = claimRejectionHtmlBody('<script>alert("x")</script> & \'quoted\'');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&#39;');
    expect(html).toContain('&quot;');
  });

  it('escapes the ampersand before the other replacements', () => {
    // **The order matters.** If `<` were replaced first, the `&` in `&lt;`
    // would then be escaped again, and the recipient would read `&amp;lt;`.
    const html = claimRejectionHtmlBody('a < b & c > d');

    expect(html).toContain('a &lt; b &amp; c &gt; d');
    expect(html).not.toContain('&amp;lt;');
    expect(html).not.toContain('&amp;amp;');
  });
});

describe('the claim-rejection email builder', () => {
  it('addresses the email to the claimant', () => {
    const builder = new DefaultClaimRejectionEmailBuilder();

    const email = builder.build('claimant@example.org', 'claim-1', 'report withdrawn by reporter');

    expect(email.to).toBe('claimant@example.org');
  });

  it('carries the subject and both bodies', () => {
    const builder = new DefaultClaimRejectionEmailBuilder();

    const email = builder.build('claimant@example.org', 'claim-1', 'report withdrawn by reporter');

    expect(email.subject).toBe(CLAIM_REJECTION_SUBJECT);
    expect(email.textBody).toContain('report withdrawn by reporter');
    expect(email.htmlBody).toContain('report withdrawn by reporter');
  });

  it('does not carry the claim id into the body', () => {
    // **The claim's reference is not a Sensitive Field,** but it is also not
    // needed: the claimant knows which claim they made. The body names the
    // reason, and the reason is what the recipient needs.
    const builder = new DefaultClaimRejectionEmailBuilder();

    const email = builder.build('claimant@example.org', 'claim-1', 'report withdrawn by reporter');

    expect(email.textBody).not.toContain('claim-1');
    expect(email.htmlBody).not.toContain('claim-1');
  });
});
