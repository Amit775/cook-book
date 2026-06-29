/**
 * Pure week-math helpers.
 *
 * All functions work with LOCAL date parts (year/month/day) — never
 * `toISOString()` — to avoid UTC off-by-one errors for users in UTC+ zones.
 *
 * A "week start date" is represented as a `YYYY-MM-DD` string using the LOCAL
 * calendar, with Sunday as day 0 (ISO weekday index: 0 = Sunday … 6 = Saturday).
 *
 * No Firebase, no Angular, no globals (`new Date()` is never called at module
 * scope — pass `today` as a parameter instead).
 */

/** Number of days in one week. */
const DAYS_IN_WEEK = 7;

/**
 * Format a `Date` as `YYYY-MM-DD` using LOCAL date parts.
 * Avoids `toISOString()` which returns UTC and can shift the date by ±1 day.
 */
export function formatWeekStartDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Return the Sunday that starts the week containing `date`.
 * `weekStartsOn` defaults to `0` (Sunday).
 */
export function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 0): Date {
  const dayOfWeek = date.getDay(); // 0 = Sunday … 6 = Saturday
  const daysBack = (dayOfWeek - weekStartsOn + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBack);
  return result;
}

/**
 * Return a new `YYYY-MM-DD` string that is `delta` weeks after (positive) or
 * before (negative) the given week-start date string.
 */
export function addWeeks(weekStartDate: string, delta: number): string {
  const [year, month, day] = weekStartDate.split('-').map(Number);
  const date = new Date(year, month - 1, day + delta * DAYS_IN_WEEK);
  return formatWeekStartDate(date);
}

/**
 * Return an array of 7 `YYYY-MM-DD` strings for the week starting on
 * `weekStartDate` (Sunday … Saturday).
 */
export function weekDates(weekStartDate: string): string[] {
  const [year, month, day] = weekStartDate.split('-').map(Number);
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
    const date = new Date(year, month - 1, day + index);
    return formatWeekStartDate(date);
  });
}

/**
 * Return the day-of-week index (0 = Sunday … 6 = Saturday) for a
 * `YYYY-MM-DD` date string.
 */
export function dayOfWeekIndex(dateString: string): number {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}
