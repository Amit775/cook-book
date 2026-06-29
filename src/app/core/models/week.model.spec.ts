import { describe, expect, it } from 'vitest';

import { addWeeks, dayOfWeekIndex, formatWeekStartDate, startOfWeek, weekDates } from './week.model';

describe('formatWeekStartDate', () => {
  it('formats a mid-month date correctly', () => {
    expect(formatWeekStartDate(new Date(2024, 5, 15))).toBe('2024-06-15');
  });

  it('pads single-digit month and day with zeros', () => {
    expect(formatWeekStartDate(new Date(2024, 0, 5))).toBe('2024-01-05');
  });

  it('handles December 31', () => {
    expect(formatWeekStartDate(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('handles January 1', () => {
    expect(formatWeekStartDate(new Date(2025, 0, 1))).toBe('2025-01-01');
  });
});

describe('startOfWeek', () => {
  it('returns the same day when given a Sunday', () => {
    // 2024-06-16 is a Sunday
    const sunday = new Date(2024, 5, 16);
    const result = startOfWeek(sunday);
    expect(formatWeekStartDate(result)).toBe('2024-06-16');
  });

  it('returns the previous Sunday for a Wednesday', () => {
    // 2024-06-19 is a Wednesday
    const wednesday = new Date(2024, 5, 19);
    const result = startOfWeek(wednesday);
    expect(formatWeekStartDate(result)).toBe('2024-06-16');
  });

  it('returns the previous Sunday for a Saturday', () => {
    // 2024-06-22 is a Saturday
    const saturday = new Date(2024, 5, 22);
    const result = startOfWeek(saturday);
    expect(formatWeekStartDate(result)).toBe('2024-06-16');
  });

  it('crosses month boundary correctly — Saturday in July to June Sunday', () => {
    // 2024-07-06 is a Saturday; the Sunday that starts its week is 2024-06-30
    const saturday = new Date(2024, 6, 6);
    const result = startOfWeek(saturday);
    expect(formatWeekStartDate(result)).toBe('2024-06-30');
  });

  it('crosses year boundary correctly — Tuesday Jan 2 to Dec 31 Sunday', () => {
    // 2024-12-31 is a Tuesday; the Sunday that starts its week is 2024-12-29
    const tuesday = new Date(2024, 11, 31);
    const result = startOfWeek(tuesday);
    expect(formatWeekStartDate(result)).toBe('2024-12-29');
  });

  it('handles January 1 crossing into the previous year', () => {
    // 2025-01-01 is a Wednesday; the Sunday that starts its week is 2024-12-29
    const jan1 = new Date(2025, 0, 1);
    const result = startOfWeek(jan1);
    expect(formatWeekStartDate(result)).toBe('2024-12-29');
  });
});

describe('addWeeks', () => {
  it('adds one week', () => {
    expect(addWeeks('2024-06-16', 1)).toBe('2024-06-23');
  });

  it('subtracts one week', () => {
    expect(addWeeks('2024-06-16', -1)).toBe('2024-06-09');
  });

  it('adds zero weeks returns same date', () => {
    expect(addWeeks('2024-06-16', 0)).toBe('2024-06-16');
  });

  it('crosses month boundary forward', () => {
    expect(addWeeks('2024-06-30', 1)).toBe('2024-07-07');
  });

  it('crosses month boundary backward', () => {
    expect(addWeeks('2024-07-07', -1)).toBe('2024-06-30');
  });

  it('crosses year boundary forward', () => {
    expect(addWeeks('2024-12-29', 1)).toBe('2025-01-05');
  });

  it('crosses year boundary backward', () => {
    expect(addWeeks('2025-01-05', -1)).toBe('2024-12-29');
  });
});

describe('weekDates', () => {
  it('returns 7 dates starting from the given Sunday', () => {
    const dates = weekDates('2024-06-16');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2024-06-16');
    expect(dates[6]).toBe('2024-06-22');
  });

  it('crosses month boundary correctly', () => {
    const dates = weekDates('2024-06-30');
    expect(dates[0]).toBe('2024-06-30');
    expect(dates[1]).toBe('2024-07-01');
    expect(dates[6]).toBe('2024-07-06');
  });

  it('crosses year boundary correctly', () => {
    const dates = weekDates('2024-12-29');
    expect(dates[0]).toBe('2024-12-29');
    expect(dates[3]).toBe('2025-01-01');
    expect(dates[6]).toBe('2025-01-04');
  });
});

describe('dayOfWeekIndex', () => {
  it('returns 0 for a Sunday', () => {
    expect(dayOfWeekIndex('2024-06-16')).toBe(0);
  });

  it('returns 1 for a Monday', () => {
    expect(dayOfWeekIndex('2024-06-17')).toBe(1);
  });

  it('returns 6 for a Saturday', () => {
    expect(dayOfWeekIndex('2024-06-22')).toBe(6);
  });

  it('returns 3 for a Wednesday', () => {
    expect(dayOfWeekIndex('2024-06-19')).toBe(3);
  });
});
