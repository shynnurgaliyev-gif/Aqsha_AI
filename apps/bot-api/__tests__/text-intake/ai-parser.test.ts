import { describe, it, expect } from 'vitest';
import { validateAiResult } from '../../src/telegram/text-intake/ai-parser';

describe('validateAiResult', () => {
  describe('valid transaction shapes', () => {
    it('accepts a well-formed expense', () => {
      const raw = { result: { kind: 'expense', amount: 250, category: 'Кофе', note: null } };
      const result = validateAiResult(raw, 'кофе 250');
      expect(result).toEqual({
        kind: 'expense',
        amount: 250,
        categoryCandidate: 'кофе',
        rawText: 'кофе 250',
      });
    });

    it('accepts a well-formed income', () => {
      const raw = { result: { kind: 'income', amount: 100000, category: 'Зарплата', note: 'Май' } };
      const result = validateAiResult(raw, 'зарплата 100000');
      expect(result?.kind).toBe('income');
      expect(result?.amount).toBe(100000);
    });

    it('floors fractional amounts', () => {
      const raw = { result: { kind: 'expense', amount: 250.99, category: 'Еда' } };
      expect(validateAiResult(raw, 'x')?.amount).toBe(250);
    });

    it('lowercases the category candidate', () => {
      const raw = { result: { kind: 'expense', amount: 1, category: 'ПРОДУКТЫ' } };
      expect(validateAiResult(raw, 'x')?.categoryCandidate).toBe('продукты');
    });

    it('trims category whitespace', () => {
      const raw = { result: { kind: 'expense', amount: 1, category: '  Кофе  ' } };
      expect(validateAiResult(raw, 'x')?.categoryCandidate).toBe('кофе');
    });
  });

  describe('explicit "no transaction" responses', () => {
    it('returns null for {result: null}', () => {
      expect(validateAiResult({ result: null }, 'hi')).toBeNull();
    });

    it('returns null for {result: undefined}', () => {
      expect(validateAiResult({ result: undefined }, 'hi')).toBeNull();
    });

    it('returns null for missing result key', () => {
      expect(validateAiResult({}, 'hi')).toBeNull();
    });
  });

  describe('rejects malformed kind', () => {
    it('rejects unknown kind', () => {
      const raw = { result: { kind: 'transfer', amount: 100, category: 'X' } };
      expect(validateAiResult(raw, 'x')).toBeNull();
    });

    it('rejects missing kind', () => {
      const raw = { result: { amount: 100, category: 'X' } };
      expect(validateAiResult(raw, 'x')).toBeNull();
    });
  });

  describe('rejects malformed amount', () => {
    it('rejects non-number amount', () => {
      const raw = { result: { kind: 'expense', amount: '100', category: 'X' } };
      expect(validateAiResult(raw, 'x')).toBeNull();
    });

    it('rejects zero', () => {
      const raw = { result: { kind: 'expense', amount: 0, category: 'X' } };
      expect(validateAiResult(raw, 'x')).toBeNull();
    });

    it('rejects negative amounts', () => {
      const raw = { result: { kind: 'expense', amount: -100, category: 'X' } };
      expect(validateAiResult(raw, 'x')).toBeNull();
    });

    it('rejects NaN and Infinity', () => {
      expect(validateAiResult({ result: { kind: 'expense', amount: NaN, category: 'X' } }, 'x')).toBeNull();
      expect(validateAiResult({ result: { kind: 'expense', amount: Infinity, category: 'X' } }, 'x')).toBeNull();
    });
  });

  describe('rejects malformed category', () => {
    it('rejects empty string', () => {
      const raw = { result: { kind: 'expense', amount: 100, category: '' } };
      expect(validateAiResult(raw, 'x')).toBeNull();
    });

    it('rejects whitespace-only', () => {
      const raw = { result: { kind: 'expense', amount: 100, category: '   ' } };
      expect(validateAiResult(raw, 'x')).toBeNull();
    });

    it('rejects non-string category', () => {
      const raw = { result: { kind: 'expense', amount: 100, category: 42 } };
      expect(validateAiResult(raw, 'x')).toBeNull();
    });
  });

  describe('rejects entirely malformed payloads', () => {
    it('rejects null/undefined input', () => {
      expect(validateAiResult(null, 'x')).toBeNull();
      expect(validateAiResult(undefined, 'x')).toBeNull();
    });

    it('rejects array input', () => {
      expect(validateAiResult([], 'x')).toBeNull();
    });

    it('rejects when result is an array', () => {
      expect(validateAiResult({ result: [] }, 'x')).toBeNull();
    });

    it('rejects when result is a string', () => {
      expect(validateAiResult({ result: 'expense 100 еда' }, 'x')).toBeNull();
    });
  });
});
