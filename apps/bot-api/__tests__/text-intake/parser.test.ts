import { describe, it, expect } from 'vitest';
import { parseIntakeText } from '../../src/telegram/text-intake/parser';

describe('parseIntakeText', () => {
  describe('valid Russian inputs', () => {
    it('parses "Расход 2500 Еда"', () => {
      expect(parseIntakeText('Расход 2500 Еда')).toEqual({
        kind: 'expense',
        amount: 2500,
        categoryCandidate: 'еда',
        rawText: 'Расход 2500 Еда',
      });
    });

    it('parses "Доход 50000 Зарплата"', () => {
      expect(parseIntakeText('Доход 50000 Зарплата')).toEqual({
        kind: 'income',
        amount: 50000,
        categoryCandidate: 'зарплата',
        rawText: 'Доход 50000 Зарплата',
      });
    });

    it('accepts "трата" / "траты" alias', () => {
      expect(parseIntakeText('трата 100 кофе')?.kind).toBe('expense');
      expect(parseIntakeText('траты 100 кофе')?.kind).toBe('expense');
    });

    it('accepts plural "расходы" / "доходы"', () => {
      expect(parseIntakeText('расходы 100 кофе')?.kind).toBe('expense');
      expect(parseIntakeText('доходы 100 зарплата')?.kind).toBe('income');
    });

    it('joins multi-word category', () => {
      expect(parseIntakeText('расход 1000 общественный транспорт')?.categoryCandidate).toBe(
        'общественный транспорт',
      );
    });
  });

  describe('valid English inputs', () => {
    it('parses "expense 100 food"', () => {
      expect(parseIntakeText('expense 100 food')).toMatchObject({
        kind: 'expense',
        amount: 100,
        categoryCandidate: 'food',
      });
    });

    it('parses short forms "exp" and "inc"', () => {
      expect(parseIntakeText('exp 50 coffee')?.kind).toBe('expense');
      expect(parseIntakeText('inc 1000 salary')?.kind).toBe('income');
    });
  });

  describe('rejects invalid inputs', () => {
    it('returns null for empty string', () => {
      expect(parseIntakeText('')).toBeNull();
    });

    it('returns null for fewer than 3 tokens', () => {
      expect(parseIntakeText('расход 100')).toBeNull();
      expect(parseIntakeText('расход')).toBeNull();
    });

    it('returns null for unknown kind token', () => {
      expect(parseIntakeText('купил 100 еда')).toBeNull();
      expect(parseIntakeText('payment 100 food')).toBeNull();
    });

    it('rejects non-integer amounts', () => {
      expect(parseIntakeText('расход 100.50 еда')).toBeNull();
      expect(parseIntakeText('расход 100,50 еда')).toBeNull();
      expect(parseIntakeText('расход 1k еда')).toBeNull();
      expect(parseIntakeText('расход abc еда')).toBeNull();
    });

    it('rejects zero or negative amounts', () => {
      expect(parseIntakeText('расход 0 еда')).toBeNull();
      // negative is not a valid integer pattern
      expect(parseIntakeText('расход -100 еда')).toBeNull();
    });

    it('rejects empty category', () => {
      // "расход 100   " with trailing whitespace → split gives just 2 tokens
      expect(parseIntakeText('расход 100  ')).toBeNull();
    });
  });

  describe('case insensitivity', () => {
    it('accepts uppercase kind', () => {
      expect(parseIntakeText('РАСХОД 100 еда')?.kind).toBe('expense');
      expect(parseIntakeText('EXPENSE 100 food')?.kind).toBe('expense');
    });

    it('lowercases category candidate', () => {
      expect(parseIntakeText('расход 100 ЕДА')?.categoryCandidate).toBe('еда');
    });
  });

  describe('whitespace tolerance', () => {
    it('tolerates extra spaces between tokens', () => {
      expect(parseIntakeText('расход   100   еда')?.amount).toBe(100);
    });

    it('trims leading/trailing whitespace', () => {
      expect(parseIntakeText('  расход 100 еда  ')?.kind).toBe('expense');
    });
  });
});
