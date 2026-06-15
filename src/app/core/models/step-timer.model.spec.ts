import { describe, expect, it } from 'vitest';

import { parseStepDurations } from './step-timer.model';

describe('parseStepDurations', () => {
  it('returns nothing for steps without a duration', () => {
    expect(parseStepDurations('Shake everything with ice')).toEqual([]);
    expect(parseStepDurations('לשקשק הכול בשייקר עם קרח')).toEqual([]);
  });

  it('parses English minutes, hours and seconds', () => {
    expect(parseStepDurations('Bake for 30 minutes')).toEqual([{ label: '30 minutes', seconds: 1800 }]);
    expect(parseStepDurations('Rest 90 seconds')).toEqual([{ label: '90 seconds', seconds: 90 }]);
    expect(parseStepDurations('Simmer 5 min')).toEqual([{ label: '5 min', seconds: 300 }]);
  });

  it('parses fractional and hyphenated amounts', () => {
    expect(parseStepDurations('Cook for 1.5 hours')).toEqual([{ label: '1.5 hours', seconds: 5400 }]);
    expect(parseStepDurations('a 30-minute bake')).toEqual([{ label: '30-minute', seconds: 1800 }]);
  });

  it('parses Hebrew number + unit', () => {
    expect(parseStepDurations('לאפות 30 דקות')).toEqual([{ label: '30 דקות', seconds: 1800 }]);
    expect(parseStepDurations('לבשל 2 שעות')).toEqual([{ label: '2 שעות', seconds: 7200 }]);
  });

  it('parses fixed Hebrew phrases', () => {
    expect(parseStepDurations('להשאיר חצי שעה')).toEqual([{ label: 'חצי שעה', seconds: 1800 }]);
    expect(parseStepDurations('לחכות רבע שעה')).toEqual([{ label: 'רבע שעה', seconds: 900 }]);
    expect(parseStepDurations('לבשל שעתיים')).toEqual([{ label: 'שעתיים', seconds: 7200 }]);
  });

  it('parses a bare Hebrew time word as one unit', () => {
    expect(parseStepDurations('להשאיר במקרר שעה')).toEqual([{ label: 'שעה', seconds: 3600 }]);
    expect(parseStepDurations('לערבב דקה')).toEqual([{ label: 'דקה', seconds: 60 }]);
  });

  it('does not match a Hebrew time word glued to other letters', () => {
    expect(parseStepDurations('כשהשעה מגיעה')).toEqual([]);
  });

  it('does not double-count a number paired with a Hebrew unit', () => {
    expect(parseStepDurations('להשאיר 1 שעה')).toEqual([{ label: '1 שעה', seconds: 3600 }]);
  });

  it('returns multiple durations in order', () => {
    expect(parseStepDurations('Simmer 5 minutes then bake 30 minutes')).toEqual([
      { label: '5 minutes', seconds: 300 },
      { label: '30 minutes', seconds: 1800 },
    ]);
  });
});
