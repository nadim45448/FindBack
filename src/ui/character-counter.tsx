'use client';

/**
 * The live character counter.
 *
 * ## The rule this component exists to satisfy
 *
 * Story 005's criterion: *"when usage reaches 90 percent of the maximum,
 * the counter changes to the warning foreground and the counter element
 * carries `aria-live="polite"`."*
 *
 * **The counter is a live region so the count is announced as it
 * changes** — without interrupting. `polite` rather than `assertive`
 * because a character count is not urgent: a screen reader user who is
 * typing should not have the count read over the character they just
 * typed.
 *
 * **The warning threshold is 90 %, and it is derived rather than
 * written.** The threshold is `Math.floor(max * 0.9)` — so a 2000-
 * character field warns at 1800. Writing the number out would be a second
 * place for the limit to live, and the limit is the domain's.
 *
 * ## The counter is one component for every field that has one
 *
 * The report form's description, the claim form's reason, and the
 * thread's composer all have the same counter with the same behaviour.
 * Three copies would be three places for the threshold to drift.
 */

/**
 * The character's props.
 */
export interface CharacterCounterProps {
  /** The characters used so far. */
  readonly current: number;
  /** The field's maximum length. */
  readonly max: number;
}

/**
 * The live character counter.
 */
export function CharacterCounter({
  current,
  max,
}: CharacterCounterProps): React.JSX.Element {
  const isWarning = current >= Math.floor(max * 0.9);

  return (
    <span
      className={isWarning ? 'char-counter char-counter--warning' : 'char-counter'}
      aria-live="polite"
    >
      {`${current} / ${max}`}
    </span>
  );
}
