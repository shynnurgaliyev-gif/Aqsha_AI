import type { MiniData } from '../hooks/useMiniApp';

function fmt(n: number) {
  return n.toLocaleString('ru-RU');
}

function monthLabel(range: { gte: string }) {
  const [year, month] = range.gte.split('-');
  return new Date(Number(year), Number(month) - 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
}

interface Props {
  data: MiniData;
  firstName: string;
  loading: boolean;
}

export function DashboardScreen({ data, firstName, loading }: Props) {
  const { balance, month, categories, transactions } = data;
  const topCats = categories.slice(0, 5);
  const maxCat = topCats[0]?.total ?? 1;

  const diff = month.expense - month.prevExpense;
  const diffPct = month.prevExpense > 0 ? Math.round((diff / month.prevExpense) * 100) : 0;

  return (
    <div className="mini-scroll mini-fadein">
      {/* Greeting */}
      <div className="mini-header">
        <div>
          <div className="mini-header-title">Привет{firstName ? `, ${firstName}` : ''} 👋</div>
          <div className="mini-header-sub">{monthLabel(month.range)}</div>
        </div>
        {loading && <span style={{ fontSize: 12, color: 'var(--hint)' }}>обновление…</span>}
      </div>

      {/* Balance card */}
      <div className="mini-balance-card">
        <div className="mini-balance-label">Общий баланс</div>
        <div className="mini-balance-amount">{fmt(balance.balance)} ₸</div>
        <div className="mini-balance-sub">
          <div className="mini-balance-sub-item">
            <div className="mini-balance-sub-label">📥 Всего доходов</div>
            <div className="mini-balance-sub-value">{fmt(balance.totalIncome)} ₸</div>
          </div>
          <div className="mini-balance-sub-item">
            <div className="mini-balance-sub-label">📤 Всего расходов</div>
            <div className="mini-balance-sub-value">{fmt(balance.totalExpense)} ₸</div>
          </div>
        </div>
      </div>

      {/* Month stats */}
      <div className="mini-stats-grid">
        <div className="mini-stat-card">
          <div className="mini-stat-icon">📤</div>
          <div className="mini-stat-label">Расходы за месяц</div>
          <div className="mini-stat-value red">{fmt(month.expense)} ₸</div>
          {month.prevExpense > 0 && (
            <div style={{ marginTop: 4 }}>
              <span className={`mini-compare ${diff > 0 ? 'up' : 'down'}`}>
                {diff > 0 ? '▲' : '▼'} {Math.abs(diffPct)}% vs пред.
              </span>
            </div>
          )}
        </div>
        <div className="mini-stat-card">
          <div className="mini-stat-icon">📥</div>
          <div className="mini-stat-label">Доходы за месяц</div>
          <div className="mini-stat-value green">{fmt(month.income)} ₸</div>
        </div>
      </div>

      {/* Category breakdown */}
      {topCats.length > 0 && (
        <div className="mini-card mini-section">
          <div className="mini-card-title">Топ расходов</div>
          {topCats.map((c) => (
            <div key={c.categoryName} className="mini-cat-row">
              <div className="mini-cat-bar-wrap">
                <div className="mini-cat-name">{c.categoryName}</div>
                <div className="mini-cat-track">
                  <div className="mini-cat-fill" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                </div>
              </div>
              <div className="mini-cat-amount">{fmt(c.total)} ₸</div>
            </div>
          ))}
        </div>
      )}

      {/* Recent transactions */}
      {transactions.length > 0 && (
        <div className="mini-card mini-section">
          <div className="mini-card-title">Последние операции</div>
          {transactions.map((tx) => (
            <div key={tx.id} className="mini-tx-row">
              <div className={`mini-tx-icon ${tx.kind}`}>
                {tx.kind === 'expense' ? '📤' : '📥'}
              </div>
              <div className="mini-tx-info">
                <div className="mini-tx-cat">{tx.categoryName}</div>
                <div className="mini-tx-date">{tx.date}</div>
              </div>
              <div className={`mini-tx-amount ${tx.kind}`}>
                {tx.kind === 'expense' ? '−' : '+'}{fmt(tx.amount)} ₸
              </div>
            </div>
          ))}
        </div>
      )}

      {transactions.length === 0 && !loading && (
        <div className="mini-empty">
          <div className="mini-empty-icon">📭</div>
          <div className="mini-empty-text">Нет операций за этот месяц</div>
        </div>
      )}
    </div>
  );
}
