import { describe, it, expect } from 'vitest';
import { checkSubscriptionAccess } from '../../src/telegram/access-control';

describe('checkSubscriptionAccess', () => {
  describe('allowed statuses', () => {
    it.each(['trial', 'active', 'grace', 'pending'])(
      'allows %s',
      (status) => {
        expect(checkSubscriptionAccess(status)).toBe('allowed');
      },
    );
  });

  describe('blocked statuses', () => {
    it.each(['expired', 'blocked', 'canceled'])(
      'blocks %s',
      (status) => {
        expect(checkSubscriptionAccess(status)).toBe('blocked');
      },
    );
  });

  describe('safety: unknown status', () => {
    it('blocks unrecognised status (conservative default)', () => {
      expect(checkSubscriptionAccess('something_new')).toBe('blocked');
      expect(checkSubscriptionAccess('')).toBe('blocked');
    });
  });
});
