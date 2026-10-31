/**
 * Shared greeting helpers for signed-in dashboards and chrome.
 *
 * The generated member dashboard greets with a time-of-day salutation and
 * the first name; the Account trigger shows the same first name beside an
 * initials circle. Seed names such as "A Member" / "The Administrator"
 * start with an article, so the first *significant* word is used.
 */

const ARTICLES = new Set(['a', 'an', 'the']);

/**
 * The first name the greeting and Account trigger use.
 *
 * Leading articles are skipped so a seed name like "A Member" greets as
 * "Member", not "A".
 */
export function greetingName(displayName: string | null | undefined): string {
  const words = displayName?.trim().split(/\s+/) ?? [];
  const first = words.find((word) => !ARTICLES.has(word.toLowerCase()));

  return first && first.length > 0 ? first : 'there';
}

/**
 * The time-of-day salutation.
 */
export function salutation(now: Date): string {
  const hour = now.getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 18) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

/**
 * A long date for the welcome meta line.
 */
export function longDate(now: Date): string {
  return now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Two-letter initials for the Account avatar chrome.
 *
 * **This is not a profile photo.** EXPERIENCE.md §9.4a forbids an avatar
 * upload; the circle is header chrome only.
 */
export function initials(displayName: string | null | undefined): string {
  const words = (displayName?.trim().split(/\s+/) ?? []).filter((word) => word.length > 0);

  if (words.length === 0) {
    return '?';
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase();
}
