import { describe, it, expect } from 'vitest';
import { parseBulkInput } from '../../src/telegram/text-intake/bulk-parser';

describe('parseBulkInput', () => {
  describe('comma-separated', () => {
    it('parses "Еда 300, транспорт 400"', () => {
      const result = parseBulkInput('Еда 300, транспорт 400');
      expect(result).toHaveLength(2);
      expect(result?.[0]).toMatchObject({ kind: 'expense', amount: 300, categoryCandidate: 'еда' });
      expect(result?.[1]).toMatchObject({ kind: 'expense', amount: 400, categoryCandidate: 'транспорт' });
    });

    it('parses three items', () => {
      const result = parseBulkInput('кофе 500, такси 1500, обед 2000');
      expect(result).toHaveLength(3);
      expect(result?.map(r => r.amount)).toEqual([500, 1500, 2000]);
    });
  });

  describe('newline-separated', () => {
    it('parses items split by \\n', () => {
      const result = parseBulkInput('Еда 300\nтранспорт 400');
      expect(result).toHaveLength(2);
    });
  });

  describe('Whisper-style sentence period', () => {
    it('parses items split by ". "', () => {
      const result = parseBulkInput('Еда 300. Транспорт 400. Кофе 500');
      expect(result).toHaveLength(3);
    });

    it('strips trailing punctuation per item', () => {
      const result = parseBulkInput('еда 300, транспорт 400.');
      expect(result?.[1]?.amount).toBe(400);
    });
  });

  describe('space-separated cat-amount pairs (Strategy 2)', () => {
    it('extracts pairs from "Еда 300 машина 400"', () => {
      const result = parseBulkInput('Еда 300 машина 400');
      expect(result).toHaveLength(2);
      expect(result?.[0]).toMatchObject({ amount: 300, categoryCandidate: 'еда' });
      expect(result?.[1]).toMatchObject({ amount: 400, categoryCandidate: 'машина' });
    });

    it('handles three pairs in a row', () => {
      const result = parseBulkInput('Еда 300 машина 400 кофе 500');
      expect(result?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('mixed explicit + implicit format', () => {
    it('mixes "расход X cat" and "cat X" lines', () => {
      const result = parseBulkInput('расход 200 еда, транспорт 400');
      expect(result).toHaveLength(2);
      expect(result?.[0]?.kind).toBe('expense');
      expect(result?.[1]?.categoryCandidate).toBe('транспорт');
    });
  });

  describe('rejects non-bulk inputs', () => {
    it('returns null for single item', () => {
      expect(parseBulkInput('еда 500')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseBulkInput('')).toBeNull();
    });

    it('returns null when fewer than 2 items parse successfully', () => {
      // Only one valid item
      expect(parseBulkInput('еда 500, абракадабра')).toBeNull();
    });

    it('returns null for free-form text without amounts', () => {
      expect(parseBulkInput('привет как дела сегодня')).toBeNull();
    });
  });

  describe('implicit defaults to expense', () => {
    it('always sets kind=expense for "Cat Amount"', () => {
      const result = parseBulkInput('зарплата 50000, премия 10000');
      // Even though "зарплата" is income-like, implicit format defaults to expense.
      // Resolution to actual kind happens at the category-resolver layer.
      expect(result?.[0]?.kind).toBe('expense');
      expect(result?.[1]?.kind).toBe('expense');
    });
  });
});
