import { describe, it, expect } from 'vitest';
import {
  planHasVoiceQuota,
  getVoiceDurationLimit,
  formatVoiceQuotaExceededMessage,
  formatVoiceTooLongMessage,
} from '../../src/telegram/voice-intake/quota';

describe('planHasVoiceQuota', () => {
  it('only "trial" is subject to the daily count quota', () => {
    expect(planHasVoiceQuota('trial')).toBe(true);
    expect(planHasVoiceQuota('active')).toBe(false);
    expect(planHasVoiceQuota('grace')).toBe(false);
    expect(planHasVoiceQuota('pending')).toBe(false);
    expect(planHasVoiceQuota('expired')).toBe(false);
    expect(planHasVoiceQuota('canceled')).toBe(false);
  });
});

describe('getVoiceDurationLimit', () => {
  it('returns trial limit for trial status', () => {
    const result = getVoiceDurationLimit('trial', 90, 900);
    expect(result).toEqual({ maxSeconds: 90, isTrial: true });
  });

  it('returns paid limit for active/grace/pending', () => {
    expect(getVoiceDurationLimit('active', 90, 900)).toEqual({ maxSeconds: 900, isTrial: false });
    expect(getVoiceDurationLimit('grace', 90, 900)).toEqual({ maxSeconds: 900, isTrial: false });
    expect(getVoiceDurationLimit('pending', 90, 900)).toEqual({ maxSeconds: 900, isTrial: false });
  });

  it('uses configurable limits', () => {
    expect(getVoiceDurationLimit('trial', 60, 1200)).toEqual({ maxSeconds: 60, isTrial: true });
    expect(getVoiceDurationLimit('active', 60, 1200)).toEqual({ maxSeconds: 1200, isTrial: false });
  });
});

describe('formatVoiceQuotaExceededMessage', () => {
  it('mentions the limit and the billing command', () => {
    const msg = formatVoiceQuotaExceededMessage(10);
    expect(msg).toContain('10');
    expect(msg).toContain('оплатить');
  });
});

describe('formatVoiceTooLongMessage', () => {
  it('formats whole minutes without decimals', () => {
    const msg = formatVoiceTooLongMessage(180, 90, true);
    expect(msg).toContain('1,5 мин'); // limit (90s = 1.5 min)
    expect(msg).toContain('3 мин');   // actual (180s = 3 min)
  });

  it('uses comma decimal separator for non-integer minutes', () => {
    const msg = formatVoiceTooLongMessage(120, 90, true);
    expect(msg).toContain('1,5 мин'); // limit
    expect(msg).toContain('2 мин');   // actual
  });

  it('shows seconds when value is below 60', () => {
    const msg = formatVoiceTooLongMessage(45, 30, false);
    expect(msg).toContain('30 сек'); // limit
  });

  it('mentions trial-specific upgrade hint when isTrial=true', () => {
    const msg = formatVoiceTooLongMessage(200, 90, true);
    expect(msg).toContain('trial');
    expect(msg).toContain('оплатить');
  });

  it('omits trial hint for paid users', () => {
    const msg = formatVoiceTooLongMessage(1000, 900, false);
    expect(msg).not.toContain('trial');
    expect(msg).not.toContain('оплатить');
    expect(msg).toContain('Максимум');
  });
});
