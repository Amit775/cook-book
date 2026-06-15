import { formatQuantity, scaleQuantity } from './quantity.model';

describe('formatQuantity', () => {
  it('returns an empty string for null ("to taste")', () => {
    expect(formatQuantity(null)).toBe('');
  });

  it('formats whole numbers without a fraction', () => {
    expect(formatQuantity(0)).toBe('0');
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(3)).toBe('3');
  });

  it('formats common fractions', () => {
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(0.25)).toBe('¼');
    expect(formatQuantity(1 / 3)).toBe('⅓');
    expect(formatQuantity(0.75)).toBe('¾');
  });

  it('combines a whole number with a fraction', () => {
    expect(formatQuantity(1.5)).toBe('1½');
    expect(formatQuantity(2.25)).toBe('2¼');
  });
});

describe('scaleQuantity', () => {
  it('passes null through unchanged', () => {
    expect(scaleQuantity(null, 2)).toBeNull();
  });

  it('multiplies a quantity by the factor', () => {
    expect(scaleQuantity(2, 1.5)).toBe(3);
    expect(scaleQuantity(4, 0.5)).toBe(2);
  });
});
