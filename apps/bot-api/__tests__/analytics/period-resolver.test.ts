import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getLocalDate,
  resolvePeriodRange,
  FALLBACK_TIMEZONE,
} from '../../src/telegram/analytics/period-resolver';

describe('getLocalDate', () => {
  beforeEach(() => {
    // Pin "now" so timezone arithmetic is deterministic.
    // 2026-05-08 06:00:00 UTC → in Asia/Almaty (UTC+5) it's 11:00 same day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T06:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns YYYY-MM-DD format', () => {
    expect(getLocalDate('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the same calendar day in UTC at 06:00 UTC', () => {
    expect(getLocalDate('UTC')).toBe('2026-05-08');
  });

  it('returns the next day in Asia/Almaty when UTC date is the previous evening', () => {
    // 2026-05-07 22:00 UTC → 03:00 the next day in Asia/Almaty
    vi.setSystemTime(new Date('2026-05-07T22:00:00Z'));
    expect(getLocalDate('Asia/Almaty')).toBe('2026-05-08');
  });

  it('returns the previous day in America/New_York at 02:00 UTC', () => {
    // 2026-05-08 02:00 UTC → 22:00 the previous day in America/New_York (UTC-4 DST)
    vi.setSystemTime(new Date('2026-05-08T02:00:00Z'));
    expect(getLocalDate('America/New_York')).toBe('2026-05-07');
  });

  it('falls back to FALLBACK_TIMEZONE on invalid timezone', () => {
    expect(getLocalDate('Not/Real_Zone')).toBe(getLocalDate(FALLBACK_TIMEZONE));
  });
});

describe('resolvePeriodRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Friday 2026-05-08 in Asia/Almaty (server time 06:00 UTC same day)
    vi.setSystemTime(new Date('2026-05-08T06:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('today', () => {
    it('returns single-day range', () => {
      expect(resolvePeriodRange('today', 'Asia/Almaty')).toEqual({
        gte: '2026-05-08',
        lt: '2026-05-09',
      });
    });
  });

  describe('yesterday', () => {
    it('returns the day before today', () => {
      expect(resolvePeriodRange('yesterday', 'Asia/Almaty')).toEqual({
        gte: '2026-05-07',
        lt: '2026-05-08',
      });
    });
  });

  describe('current_week', () => {
    it('returns ISO week (Monday start) for a Friday', () => {
      // 2026-05-08 is Friday; ISO week starts Monday 2026-05-04
      expect(resolvePeriodRange('current_week', 'Asia/Almaty')).toEqual({
        gte: '2026-05-04',
        lt: '2026-05-11',
      });
    });

    it('handles Sunday correctly (Sunday is end of ISO week)', () => {
      vi.setSystemTime(new Date('2026-05-10T06:00:00Z')); // Sunday
      expect(resolvePeriodRange('current_week', 'Asia/Almaty')).toEqual({
        gte: '2026-05-04', // previous Monday
        lt: '2026-05-11',
      });
    });

    it('handles Monday (week start) correctly', () => {
      vi.setSystemTime(new Date('2026-05-04T06:00:00Z')); // Monday
      expect(resolvePeriodRange('current_week', 'Asia/Almaty')).toEqual({
        gte: '2026-05-04',
        lt: '2026-05-11',
      });
    });
  });

  describe('current_month', () => {
    it('returns first day of month → first day of next month', () => {
      expect(resolvePeriodRange('current_month', 'Asia/Almaty')).toEqual({
        gte: '2026-05-01',
        lt: '2026-06-01',
      });
    });

    it('handles December correctly (rolls to next year)', () => {
      vi.setSystemTime(new Date('2026-12-15T06:00:00Z'));
      expect(resolvePeriodRange('current_month', 'Asia/Almaty')).toEqual({
        gte: '2026-12-01',
        lt: '2027-01-01',
      });
    });
  });

  describe('previous_month', () => {
    it('returns the previous calendar month', () => {
      expect(resolvePeriodRange('previous_month', 'Asia/Almaty')).toEqual({
        gte: '2026-04-01',
        lt: '2026-05-01',
      });
    });

    it('handles January correctly (rolls to previous year)', () => {
      vi.setSystemTime(new Date('2026-01-15T06:00:00Z'));
      expect(resolvePeriodRange('previous_month', 'Asia/Almaty')).toEqual({
        gte: '2025-12-01',
        lt: '2026-01-01',
      });
    });
  });
});
