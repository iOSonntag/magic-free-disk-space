const DAY_MS = 86_400_000;

/** The words of the counts a sentence spells out; a larger count keeps its digits. */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/**
 * A span of whole days as a probe's text names its limit, `a day` or `30 days`, so the text
 * reads from the constant that decides it. A part of a day rounds to the nearest day.
 */
export function formatDaySpan(durationMs: number): string {
  const dayCount = Math.round(durationMs / DAY_MS);

  return dayCount === 1 ? 'a day' : `${dayCount} days`;
}

/** A count as a sentence writes it: its word below ten, such as `two`, its digits from ten on. */
export function formatCountWord(count: number): string {
  return COUNT_WORDS[count] ?? count.toLocaleString('en-US');
}
