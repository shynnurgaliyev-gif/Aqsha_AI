'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MiniData, AnalyticsData } from '../hooks/useMiniApp';

function fmt(n: number) { return n.toLocaleString('ru-RU'); }
function pct(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

const MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const MONTHS_FULL  = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function nowYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split('-').map(Number);
  return `${MONTHS_FULL[m - 1]} ${y}`;
}

function addMonths(yyyymm: string, delta: number) {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface Props {
  data: MiniData;
  loadAnalytics: (month: string) => Promise<AnalyticsData | null>;
}

export function AnalyticsScreen({ data, loadAnalytics }: Props) {
  const currentMonth = nowYYYYMM();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  // Load analytics whenever selectedMonth changes
  const fetchAnalytics = useCallback(async (month: string) => {
    setLoading(true);
    const result = await loadAnalytics(month);
    setAnalyticsData(result);
    setLoading(false);
  }, [loadAnalytics]);

  useEffect(() => {
    fetchAnalytics(selectedMonth);
  }, [fetchAnalytics, selectedMonth]);

  // Derive display data: current month uses pre-loaded data for instant render
  const displayMonth = analyticsData?.month ?? {
    expense: data.month.expense,
    income: data.month.income,
    prevExpense: data.month.prevExpense,
    range: data.month.range,
    label: currentMonth,
  };
  const displayCategories = analyticsData?.categories ?? data.categories;

  const { expense: totalExpense, income: totalIncome, prevExpense } = displayMonth;
  const savings = totalIncome - totalExpense;
  const isCurrentMonth = selectedMonth === currentMonth;
  const now = new Date();

  return (
    <div className="mini-scroll mini-fadein">
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 16px' }}>
        <button
          onClick={() => setSelectedMonth(m => addMonths(m, -1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 22, padding: '0 8px', lineHeight: 1 }}
        >
          ‹
        </button>

        <button
          onClick={() => { setPickerOpen(true); setPickerYear(Number(selectedMonth.split('-')[0])); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 17, fontWeight: 700, color: 'var(--text)', padding: '4px 12px',
            borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {monthLabel(selectedMonth)}
          {loading && <span style={{ fontSize: 12, color: 'var(--hint)', fontWeight: 400 }}>…</span>}
        </button>

        <button
          onClick={() => !isCurrentMonth && setSelectedMonth(m => addMonths(m, 1))}
          disabled={isCurrentMonth}
          style={{
            background: 'none', border: 'none',
            cursor: isCurrentMonth ? 'default' : 'pointer',
            color: isCurrentMonth ? 'var(--border)' : 'var(--accent)',
            fontSize: 22, padding: '0 8px', lineHeight: 1,
          }}
        >
          ›
        </button>
      </div>

      {/* Month picker overlay */}
      {pickerOpen && (
        <>
          <div
            onClick={() => setPickerOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)' }}
          />
          <div style={{
            position: 'fixed', bottom: 68, left: 12, right: 12, zIndex: 11,
            background: 'var(--card-bg)', borderRadius: 16, padding: '16px',
            border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            {/* Year row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <button
                onClick={() => setPickerYear(y => y - 1)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 20, padding: '0 8px' }}
              >
                ‹
              </button>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{pickerYear}</span>
              <button
                onClick={() => pickerYear < now.getFullYear() && setPickerYear(y => y + 1)}
                disabled={pickerYear >= now.getFullYear()}
                style={{
                  background: 'none', border: 'none',
                  cursor: pickerYear >= now.getFullYear() ? 'default' : 'pointer',
                  color: pickerYear >= now.getFullYear() ? 'var(--border)' : 'var(--accent)',
                  fontSize: 20, padding: '0 8px',
                }}
              >
                ›
              </button>
            </div>

            {/* Month grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {MONTHS_SHORT.map((name, i) => {
                const ms = `${pickerYear}-${String(i + 1).padStart(2, '0')}`;
                const isFuture = pickerYear > now.getFullYear() ||
                  (pickerYear === now.getFullYear() && i + 1 > now.getMonth() + 1);
                const isSel = ms === selectedMonth;
                return (
                  <button
                    key={i}
                    disabled={isFuture}
                    onClick={() => { if (!isFuture) { setSelectedMonth(ms); setPickerOpen(false); } }}
                    style={{
                      padding: '9px 4px', borderRadius: 10, border: 'none',
                      cursor: isFuture ? 'default' : 'pointer',
                      background: isSel ? 'var(--accent)' : 'var(--bg)',
                      color: isSel ? '#fff' : isFuture ? 'var(--border)' : 'var(--text)',
                      fontSize: 13, fontWeight: isSel ? 700 : 400,
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Summary */}
      <div className="mini-stats-grid">
        <div className="mini-stat-card">
          <div className="mini-stat-icon">📤</div>
          <div className="mini-stat-label">Расходы</div>
          <div className="mini-stat-value red">{fmt(totalExpense)} ₸</div>
        </div>
        <div className="mini-stat-card">
          <div className="mini-stat-icon">📥</div>
          <div className="mini-stat-label">Доходы</div>
          <div className="mini-stat-value green">{fmt(totalIncome)} ₸</div>
        </div>
        <div className="mini-stat-card" style={{ gridColumn: '1 / -1' }}>
          <div className="mini-stat-icon">{savings >= 0 ? '💰' : '⚠️'}</div>
          <div className="mini-stat-label">Остаток за месяц</div>
          <div className={`mini-stat-value ${savings >= 0 ? 'green' : 'red'}`}>
            {savings >= 0 ? '+' : ''}{fmt(savings)} ₸
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      {displayCategories.length > 0 ? (
        <div className="mini-card mini-section">
          <div className="mini-card-title">Расходы по категориям</div>
          {displayCategories.map((c, i) => (
            <div key={c.categoryName} className="mini-cat-row">
              <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
              <div className="mini-cat-bar-wrap">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="mini-cat-name">{c.categoryName}</div>
                  <div style={{ fontSize: 12, color: 'var(--hint)' }}>{pct(c.total, totalExpense)}%</div>
                </div>
                <div className="mini-cat-track">
                  <div className="mini-cat-fill" style={{ width: `${pct(c.total, totalExpense)}%`, background: COLORS[i % COLORS.length] }} />
                </div>
              </div>
              <div className="mini-cat-amount">{fmt(c.total)} ₸</div>
            </div>
          ))}
        </div>
      ) : !loading && (
        <div className="mini-empty">
          <div className="mini-empty-icon">📊</div>
          <div className="mini-empty-text">Нет расходов за этот месяц</div>
        </div>
      )}

      {/* Comparison with prev month */}
      {prevExpense > 0 && (
        <div className="mini-card">
          <div className="mini-card-title">Сравнение с предыдущим месяцем</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--hint)' }}>Пред. месяц</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(prevExpense)} ₸</div>
            </div>
            <div style={{ fontSize: 24 }}>{totalExpense > prevExpense ? '📈' : '📉'}</div>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--hint)' }}>Выбранный</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(totalExpense)} ₸</div>
            </div>
          </div>
          {(() => {
            const diff = totalExpense - prevExpense;
            const diffPct = Math.round(Math.abs(diff / prevExpense) * 100);
            return (
              <div style={{ marginTop: 10 }}>
                <span className={`mini-compare ${diff > 0 ? 'up' : 'down'}`} style={{ fontSize: 13 }}>
                  {diff > 0 ? '▲ Больше' : '▼ Меньше'} на {fmt(Math.abs(diff))} ₸ ({diffPct}%)
                </span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
