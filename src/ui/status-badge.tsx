'use client';

/**
 * The status badge.
 *
 * ## The one badge
 *
 * **Every status badge on every surface is this component.** Before it
 * existed, each surface spelled its own `<span className="badge">`, and the
 * accessibility contract — *"the badge pairs a colour with a text label and
 * an icon, so colour is never the sole carrier of meaning"* (§5.8) — was
 * enforced by nine separate pieces of markup that could each drift. One
 * component is one place to get it right, and one place to test it.
 *
 * ## The three cues, always all three
 *
 * | Cue | Where it lives |
 * |---|---|
 * | The **colour** | the `badge--*` class |
 * | The **text** | the visible label |
 * | The **icon** | the `aria-hidden` glyph beside the text |
 *
 * **The icon is `aria-hidden`.** The text beside it already carries the
 * status, so the icon is decoration. Announcing it would make a screen
 * reader say the status twice.
 *
 * ## The `aria-label` names the *kind* of thing
 *
 * Story 011's criterion: *"it has an `aria-label` containing the status
 * name."* The label is `"Status: Open"` — not just `"Open"` — because a
 * screen reader user hearing "Open" in a list of rows has no way to know
 * that bare word refers to the item's status rather than to the item's
 * name or its category. **The kind comes first, so the status is the last
 * thing announced** — the thing the user is looking for.
 *
 * The `aria-label` **replaces** the visible text for assistive technology
 * (an element with an `aria-label` is named by it), so the visible text is
 * still there for sighted users and the label is what is announced. The
 * visible text remains the accessible name's content for anything that
 * reads the DOM's text.
 *
 * ## The tone is derived, never passed
 *
 * The colour class is **derived from the status**, not chosen by the
 * caller. A caller that could pass the tone would be a caller that could
 * paint `Open` red — and the colour would then contradict the text, which
 * is exactly the failure the criterion exists to prevent.
 */

/**
 * The badge's tone.
 *
 * **The tone is what the colour means, not what the status is.** A status
 * maps to a tone; a tone maps to a colour pair. The mapping is one table,
 * so a new status is added in one place.
 */
export type BadgeTone = 'neutral' | 'pending' | 'active' | 'rejected';

/**
 * The statuses a badge can carry, and the tone each one paints.
 *
 * **The keys are the domain's own status literals,** verbatim, so a status
 * that is renamed in the domain breaks this table loudly rather than
 * silently losing its colour.
 *
 * **A status that is not in the table falls back to `neutral`.** The
 * fallback is deliberately the *quiet* tone: an unrecognised status is
 * shown as-is rather than guessed at, because guessing wrong paints a
 * wrong meaning onto the text.
 */
const STATUS_TONES: Readonly<Record<string, BadgeTone>> = Object.freeze({
  // The report lifecycle — §4.5.
  Open: 'active',
  'Claim Requested': 'pending',
  'Claim Approved': 'active',
  'Verification Pending': 'pending',
  Returned: 'neutral',
  Closed: 'neutral',

  // The claim lifecycle — §4.6.
  Pending: 'pending',
  Approved: 'active',
  Rejected: 'rejected',

  // The account lifecycle — §4.3.
  Active: 'active',
  Deactivated: 'rejected',

  // The recovery response lifecycle — §4.5.
  Submitted: 'pending',
  'Selected for Verification': 'pending',
  'Match Confirmed': 'active',
  'Not a Match': 'neutral',
  'Completed — Report Returned': 'neutral',
  'Resolved — Report Returned': 'neutral',
  'Resolved — Report Closed': 'neutral',
  Withdrawn: 'neutral',
});

/**
 * The tone a status paints.
 *
 * **An unknown status is `neutral`,** and the caller still renders the
 * status text — so the user sees the truth and the colour says nothing.
 */
export function toneForStatus(status: string): BadgeTone {
  return STATUS_TONES[status] ?? 'neutral';
}

/**
 * The icon a status carries.
 *
 * **The icon is a distinct glyph per tone,** so the shape — not only the
 * colour — distinguishes the states. A red circle and a green circle are
 * told apart by hue; a cross and a tick are told apart in a greyscale
 * print, in a screen reader's silence, and by anyone who cannot separate
 * the hues at all.
 */
function BadgeIcon({ tone }: { readonly tone: BadgeTone }): React.JSX.Element {
  const shared = {
    'aria-hidden': true,
    className: 'badge__icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;

  if (tone === 'active') {
    // A tick.
    return (
      <svg {...shared}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }

  if (tone === 'pending') {
    // A clock — a thing that is waiting, not yet decided.
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  if (tone === 'rejected') {
    // A cross.
    return (
      <svg {...shared}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    );
  }

  // Neutral — a dot. It says "this is a state" without claiming anything
  // about which one.
  return (
    <svg {...shared}>
      <circle cx="12" cy="12" r="4.5" />
    </svg>
  );
}

/** The status badge's props. */
export interface StatusBadgeProps {
  /** The status the badge carries. */
  readonly status: string;
  /**
   * What the status is a status *of*.
   *
   * **The default is `Status`.** The badge's accessible name is
   * `"<kind>: <status>"`, and the kind is what tells a screen reader user
   * which column of a row they have landed on.
   */
  readonly kind?: string | undefined;
  /**
   * Override the tone.
   *
   * **Only for the cases the table cannot know** — the audit trail's
   * `Member` / `Administrator` role tag, and the report *type*, which is
   * not a status at all. A status badge never uses it.
   */
  readonly tone?: BadgeTone | undefined;
  /** Extra class names for the element. */
  readonly className?: string | undefined;
}

/**
 * The status badge.
 */
export function StatusBadge({
  status,
  kind = 'Status',
  tone,
  className,
}: StatusBadgeProps): React.JSX.Element {
  const resolved = tone ?? toneForStatus(status);

  return (
    <span
      className={className ? `badge badge--${resolved} ${className}` : `badge badge--${resolved}`}
      // **The label names the kind, then the status.** The status is last,
      // because it is what the user came to read.
      aria-label={`${kind}: ${status}`}
    >
      <BadgeIcon tone={resolved} />
      {status}
    </span>
  );
}
