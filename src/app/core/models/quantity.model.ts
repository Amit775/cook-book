const COMMON_FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [7 / 8, '⅞'],
];

/**
 * Format a (possibly scaled) quantity for display as a cook would write it:
 * a whole number plus the nearest common fraction (`1.5` → `1½`, `0.33` → `⅓`),
 * falling back to one decimal when no fraction is close. `null` → `''`.
 */
export function formatQuantity(value: number | null): string {
  if (value === null) {
    return '';
  }
  if (value === 0) {
    return '0';
  }
  const whole = Math.floor(value);
  const remainder = value - whole;
  if (remainder < 0.02) {
    return String(whole);
  }

  let bestGlyph = '';
  let bestDifference = Number.POSITIVE_INFINITY;
  for (const [fractionValue, glyph] of COMMON_FRACTIONS) {
    const difference = Math.abs(remainder - fractionValue);
    if (difference < bestDifference) {
      bestDifference = difference;
      bestGlyph = glyph;
    }
  }

  if (bestDifference > 0.06) {
    return String(Math.round(value * 10) / 10);
  }
  return whole > 0 ? `${whole}${bestGlyph}` : bestGlyph;
}

/** Scale a quantity by a factor, or pass through `null` ("to taste"). */
export function scaleQuantity(value: number | null, factor: number): number | null {
  return value === null ? null : value * factor;
}
