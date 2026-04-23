import type { MiniData } from '../hooks/useMiniApp';

function fmt(n: number) { return n.toLocaleString('ru-RU'); }

function pct(part: number, total: number) {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

interface Props { data: MiniData; }

export function AnalyticsScreen({ data }: Props) {
  const { month, categories } = data;
  const totalExpense = month.expense;
  const totalIncome  = month.income;
  const savings = totalIncome - totalExpense;

  return (
    <div className="mini-scroll mini-fadein">
      <div className="mini-header">
        <div className="mini-header-title">Аналитика</div>
      </div>

      {/* Summary row */}
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
          <div className={`mini-stat-value ${savings >= 0 ? 'green' : 'red'}`}>{savings >= 0 ? '+' : ''}{fmt(savings)} ₸</div>
        </div>
      </div>

      {/* Category breakdown */}
      {categories.length > 0 ? (
        <div className="mini-card mini-section">
          <div className="mini-card-title">Расходы по категориям</div>

          {/* Visual bars */}
          {categories.map((c, i) => (
            <div key={c.categoryName} className="mini-cat-row">
              <div style={{
                width: 10, height: 10, borderRadius: 2,
                background: COLORS[i % COLORS.length],
                flexShrink: 0,
              }} />
              <div className="mini-cat-bar-wrap">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="mini-cat-name">{c.categoryName}</div>
                  <div style={{ fontSize: 12, color: 'var(--hint)' }}>{pct(c.total, totalExpense)}%</div>
                </div>
                <div className="mini-cat-track">
                  <div
                    className="mini-cat-fill"
                    style={{
                      width: `${pct(c.total, totalExpense)}%`,
                      background: COLORS[i % COLORS.length],
                    }}
                  />
                </div>
              </div>
              <div className="mini-cat-amount">{fmt(c.total)} ₸</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mini-empty">
          <div className="mini-empty-icon">📊</div>
          <div className="mini-empty-text">Нет расходов за этот месяц</div>
        </div>
      )}

      {/* Comparison with prev month */}
      {month.prevExpense > 0 && (
        <div className="mini-card">
          <div className="mini-card-title">Сравнение с прошлым месяцем</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--hint)' }}>Прошлый месяц</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(month.prevExpense)} ₸</div>
            </div>
            <div style={{ fontSize: 24 }}>
              {month.expense > month.prevExpense ? '📈' : '📉'}
            </div>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--hint)' }}>Текущий месяц</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(month.expense)} ₸</div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            {(() => {
              const diff = month.expense - month.prevExpense;
              const diffPct = Math.round(Math.abs(diff / month.prevExpense) * 100);
              return (
                <span className={`mini-compare ${diff > 0 ? 'up' : 'down'}`} style={{ fontSize: 13 }}>
                  {diff > 0 ? '▲ Больше' : '▼ Меньше'} на {fmt(Math.abs(diff))} ₸ ({diffPct}%)
                </span>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
