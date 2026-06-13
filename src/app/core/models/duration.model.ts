/**
 * An ISO 8601 duration string, for example `PT30M` (30 minutes) or `PT1H30M`
 * (1 hour 30 minutes). Stored as a string in Firestore and parsed/formatted in the UI.
 */
export type IsoDuration = string;

const ISO_DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * Convert an ISO 8601 duration into a whole number of minutes.
 * Returns `null` when the input is missing or not a valid duration.
 */
export function parseDurationToMinutes(duration: IsoDuration | null | undefined): number | null {
  if (!duration) {
    return null;
  }
  const match = ISO_DURATION_PATTERN.exec(duration);
  if (!match) {
    return null;
  }
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60);
}

/**
 * Convert a whole number of minutes into an ISO 8601 duration string.
 * Returns `null` for non-positive or missing input.
 */
export function minutesToDuration(totalMinutes: number | null | undefined): IsoDuration | null {
  if (totalMinutes == null || totalMinutes <= 0) {
    return null;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let result = 'PT';
  if (hours > 0) {
    result += `${hours}H`;
  }
  if (minutes > 0) {
    result += `${minutes}M`;
  }
  return result === 'PT' ? 'PT0M' : result;
}
