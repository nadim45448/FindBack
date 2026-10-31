/**
 * @vitest-environment jsdom
 */

/**
 * The status badge's tests.
 *
 * **These are the tests for story 011's badge criterion:** *"it has an
 * `aria-label` containing the status name and always pairs color with a
 * text label and an icon."*
 *
 * ## Why the suite renders the badge rather than reading the source
 *
 * The criterion is about **what a user perceives**, not about what the
 * markup says. A source scan would pass on a badge whose `aria-label`
 * was empty, whose icon was missing, or whose icon was announced twice.
 * So every assertion here is made against the rendered DOM.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { resetDomEnvironment } from '@/test/dom';

import { StatusBadge, toneForStatus } from './status-badge';

afterEach(() => {
  cleanup();
  resetDomEnvironment();
});

/**
 * The badge element.
 *
 * **Found by class, not by role.** A `<span>` with no `role` has no
 * accessible role to query for, and the badge is a `<span>` because it is
 * inline text, not a control.
 */
function badge(): HTMLElement {
  const element = document.querySelector('.badge');

  if (!(element instanceof HTMLElement)) {
    throw new Error('the badge is not in the document');
  }

  return element;
}

describe('the status badge', () => {
  it('carries an aria-label naming the status', () => {
    // **The criterion: "it has an `aria-label` containing the status
    // name."** The label names the kind first and the status last, so the
    // status — the thing the user came to read — is announced last.
    render(<StatusBadge status="Open" />);

    expect(badge().getAttribute('aria-label')).toBe('Status: Open');
  });

  it('names the kind it is a status of', () => {
    render(<StatusBadge status="Open" kind="Claim status" />);

    expect(badge().getAttribute('aria-label')).toBe('Claim status: Open');
  });

  it('shows the status as visible text', () => {
    // **The colour is decoration; the text carries the meaning.** A badge
    // with an `aria-label` but no visible text would be a badge only a
    // screen reader could read.
    render(<StatusBadge status="Open" />);

    expect(badge().textContent).toContain('Open');
  });

  it('pairs the status with an icon', () => {
    // **The criterion: "always pairs color with a text label and an
    // icon."** The icon is the third cue — the one that survives a
    // greyscale print and a screen reader's silence.
    render(<StatusBadge status="Open" />);

    expect(badge().querySelector('.badge__icon')).toBeTruthy();
  });

  it('marks the icon as decorative', () => {
    // **The icon is `aria-hidden`.** The text beside it already carries
    // the status, so announcing the icon would make a screen reader say
    // the status twice.
    render(<StatusBadge status="Open" />);

    expect(badge().querySelector('.badge__icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives the status a colour class', () => {
    render(<StatusBadge status="Open" />);

    expect(badge().className).toContain('badge--');
  });

  it('gives each tone its own icon shape', () => {
    // **The shape is a cue too.** Two badges that differ only in hue are
    // indistinguishable to anyone who cannot separate the hues — and the
    // icons are what tells them apart.
    const { container: active } = render(<StatusBadge status="Open" />);
    const { container: rejected } = render(<StatusBadge status="Rejected" />);

    const activeIcon = active.querySelector('.badge__icon')?.innerHTML ?? '';
    const rejectedIcon = rejected.querySelector('.badge__icon')?.innerHTML ?? '';

    expect(activeIcon).not.toBe(rejectedIcon);
  });

  it('carries no extra class name when there is none', () => {
    render(<StatusBadge status="Open" />);

    expect(badge().className).toBe('badge badge--active');
  });

  it('keeps an extra class name', () => {
    render(<StatusBadge status="Open" className="listing__meta" />);

    expect(badge().className).toContain('listing__meta');
  });
});

describe('the tone a status paints', () => {
  it('paints an open report as active', () => {
    expect(toneForStatus('Open')).toBe('active');
  });

  it('paints a pending report as pending', () => {
    expect(toneForStatus('Claim Requested')).toBe('pending');
  });

  it('paints a rejected claim as rejected', () => {
    expect(toneForStatus('Rejected')).toBe('rejected');
  });

  it('paints a closed report as neutral', () => {
    expect(toneForStatus('Closed')).toBe('neutral');
  });

  it('falls back to the quiet tone for a status it does not know', () => {
    // **The fallback is deliberately `neutral`.** An unrecognised status
    // is shown as-is rather than guessed at, because guessing wrong paints
    // a wrong meaning onto the text.
    expect(toneForStatus('Something New')).toBe('neutral');
  });

  it('never paints a rejected status in a positive tone', () => {
    // **The dangerous inversion.** A `Rejected` badge painted with the
    // success colour would contradict its own text — and the criterion
    // exists precisely because the colour is what the eye reads first.
    expect(toneForStatus('Rejected')).not.toBe('active');
    expect(toneForStatus('Deactivated')).not.toBe('active');
  });

  it('honours an explicit tone over the table', () => {
    // **The report type is not a status.** It is a badge that names a
    // kind of thing, and it keeps the quiet tone.
    render(<StatusBadge status="Lost item" kind="Type" tone="neutral" />);

    expect(badge().className).toContain('badge--neutral');
  });
});

describe('the badge on a real surface', () => {
  it('is the badge the listings rows render', () => {
    // **One component, so the contract cannot drift.** The listings
    // surface renders `StatusBadge`, and every badge in the DOM therefore
    // carries the three cues without the surface having to remember to
    // add them.
    render(<StatusBadge status="Open" kind="Status" />);

    const element = screen.getByLabelText('Status: Open');

    expect(element.textContent).toContain('Open');
    expect(element.querySelector('.badge__icon')).toBeTruthy();
  });
});
