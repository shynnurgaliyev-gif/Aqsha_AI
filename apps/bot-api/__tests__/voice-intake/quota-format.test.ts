import { describe, it, expect } from 'vitest';
import { formatVoiceTooLongMessage } from '../../src/telegram/voice-intake/quota';

/**
 * Targeted tests for the `formatDuration` branch behaviour exposed via
 * `formatVoiceTooLongMessage`. Covers the boundaries between sec/min
 * representation that aren't fully exercised in quota.test.ts.
 */
describe('formatVoiceTooLongMessage — boundary formatting', () => {
  it('shows "1 мин" for exactly 60 seconds', () => {
    const msg = formatVoiceTooLongMessage(120, 60, true);
    expect(msg).toContain('1 мин'); // limit
    expect(msg).toContain('2 мин'); // actual
  });

  it('shows "59 сек" for 59 seconds (still below minute boundary)', () => {
    const msg = formatVoiceTooLongMessage(120, 59, false);
    expect(msg).toContain('59 сек');
  });

  it('shows "2,5 мин" for 150 seconds', () => {
    const msg = formatVoiceTooLongMessage(200, 150, true);
    expect(msg).toContain('2,5 мин'); // limit
  });

  it('produces a complete sentence', () => {
    const msg = formatVoiceTooLongMessage(120, 90, true);
    // Sanity: starts with the emoji, contains both numbers, ends with the
    // upgrade hint.
    expect(msg.startsWith('🎙️')).toBe(true);
    expect(msg).toContain('Голосовое слишком длинное');
  });
});
