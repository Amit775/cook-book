/**
 * A cooking duration detected inside a step's text, used to offer a tap-to-start
 * countdown in cooking mode. Hebrew-first, with English support.
 */
export interface StepDuration {
  /** The matched text as written, for example "30 minutes" or "חצי שעה". */
  label: string;
  /** Total duration in seconds. */
  seconds: number;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;

const HOUR_UNITS = new Set(['hour', 'hours', 'hr', 'hrs', 'שעה', 'שעות']);
const MINUTE_UNITS = new Set(['minute', 'minutes', 'min', 'mins', 'דקה', 'דקות']);

/** Number + unit, e.g. "30 minutes", "1.5 hours", "90 sec", "30 דקות", "2 שעות". */
const NUMBER_UNIT =
  /(\d+(?:[.,]\d+)?)[\s-]*(seconds?|secs?|minutes?|mins?|hours?|hrs?|שניות|שנייה|שניה|דקות|דקה|שעות|שעה)/gi;

/** Fixed Hebrew phrases without a digit. Order: most specific first. */
const HEBREW_PHRASES: readonly { readonly pattern: RegExp; readonly seconds: number }[] = [
  { pattern: /חצי\s+שעה/g, seconds: 30 * MINUTE },
  { pattern: /רבע\s+שעה/g, seconds: 15 * MINUTE },
  { pattern: /שעתיים/g, seconds: 2 * HOUR },
];

/** A bare Hebrew time word (= one unit), not glued to other Hebrew letters or a digit. */
const BARE_HEBREW = /(?<![\d֐-׿])(שעה|דקה)(?![֐-׿])/g;

interface Match {
  start: number;
  end: number;
  duration: StepDuration;
}

function unitSeconds(unit: string): number {
  const normalized = unit.toLowerCase();
  if (HOUR_UNITS.has(normalized)) {
    return HOUR;
  }
  if (MINUTE_UNITS.has(normalized)) {
    return MINUTE;
  }
  return 1;
}

/**
 * Extract cooking durations from a step's text, left to right. Overlapping
 * matches are resolved in favour of the one found first (number+unit beats a
 * bare word, a fixed phrase beats its bare parts).
 */
export function parseStepDurations(text: string): StepDuration[] {
  const matches: Match[] = [];

  for (const match of text.matchAll(NUMBER_UNIT)) {
    const amount = Number.parseFloat(match[1].replace(',', '.'));
    if (Number.isFinite(amount) && amount > 0) {
      const seconds = Math.round(amount * unitSeconds(match[2]));
      matches.push({ start: match.index, end: match.index + match[0].length, duration: { label: match[0].trim(), seconds } });
    }
  }

  for (const { pattern, seconds } of HEBREW_PHRASES) {
    for (const match of text.matchAll(pattern)) {
      matches.push({ start: match.index, end: match.index + match[0].length, duration: { label: match[0].trim(), seconds } });
    }
  }

  for (const match of text.matchAll(BARE_HEBREW)) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      duration: { label: match[0].trim(), seconds: unitSeconds(match[1]) },
    });
  }

  // Sort by position, then drop any match that overlaps an already-accepted one.
  matches.sort((first, second) => first.start - second.start || second.end - second.start - (first.end - first.start));
  const accepted: Match[] = [];
  for (const candidate of matches) {
    if (!accepted.some((kept) => candidate.start < kept.end && kept.start < candidate.end)) {
      accepted.push(candidate);
    }
  }
  return accepted.sort((first, second) => first.start - second.start).map((match) => match.duration);
}
