'use client';

import { useState, useEffect } from 'react';
import type { TransactionRow } from '../hooks/useMiniApp';

function fmt(n: number) { return n.toLocaleString('ru-RU'); }

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

interface Props {
  loadTransactions: (from: string, to: string) => Promise<TransactionRow[]>;
}

export function TransactionsScreen({ loadTransactions }: Props) {
  const { from: defaultFrom, to: defaultTo } = currentMonthRange();

  const [txs, setTxs] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  useEffect(() => {
    setLoading(true);
    loadTransactions(from, to)
      .then(setTxs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadTransactions, from, to]);

  const filtered = filter === 'all' ? txs : txs.filter((t) => t.kind === filter);

  const totalExpense = txs.filter(t => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalIncome  = txs.filter(t => t.kind === 'income').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="mini-scroll mini-fadein">
      <div className="mini-header">
        <div className="mini-header-title">Операции</div>
      </div>

      {/* Date range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 10px' }}>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--card-bg)',
            color: 'var(--text)', fontSize: 13, outline: 'none',
          }}
        />
        <span style={{ color: 'var(--hint)', fontSize: 14, flexShrink: 0 }}>—</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--card-bg)',
            color: 'var(--text)', fontSize: 13, outline: 'none',
          }}
        />
      </div>

      {/* Period summary */}
      {!loading && txs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '0 0 10px' }}>
          <div style={{
            flex: 1, background: 'var(--card-bg)', borderRadius: 10,
            padding: '8px 12px', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--hint)', marginBottom: 2 }}>Расходы</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)' }}>−{fmt(totalExpense)} ₸</div>
          </div>
          <div style={{
            flex: 1, background: 'var(--card-bg)', borderRadius: 10,
            padding: '8px 12px', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--hint)', marginBottom: 2 }}>Доходы</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>+{fmt(totalIncome)} ₸</div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '0 0 12px', overflowX: 'auto' }}>
        {(['all', 'expense', 'income'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
              background: filter === f ? 'var(--accent)' : 'var(--card-bg)',
              color: filter === f ? '#fff' : 'var(--hint)',
              outline: filter === f ? 'none' : '1px solid var(--border)',
            }}
          >
            {f === 'all' ? 'Все' : f === 'expense' ? '📤 Расходы' : '📥 Доходы'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mini-card">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="mini-skeleton" style={{ width: 38, height: 38, borderRadius: '50%' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mini-skeleton" style={{ height: 14, width: '60%' }} />
                <div className="mini-skeleton" style={{ height: 12, width: '30%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mini-empty">
          <div className="mini-empty-icon">📭</div>
          <div className="mini-empty-text">Нет операций за период</div>
        </div>
      ) : (
        <div className="mini-card">
          {filtered.map((tx) => (
            <div key={tx.id} className="mini-tx-row">
              <div className={`mini-tx-icon ${tx.kind}`}>
                {tx.kind === 'expense' ? '📤' : '📥'}
              </div>
              <div className="mini-tx-info">
                <div className="mini-tx-cat">{tx.categoryName}</div>
                {tx.rawText && (
                  <div className="mini-tx-date" style={{ wordBreak: 'break-word' }}>
                    {tx.rawText}
                  </div>
                )}
                <div className="mini-tx-date">{tx.date}</div>
              </div>
              <div className={`mini-tx-amount ${tx.kind}`}>
                {tx.kind === 'expense' ? '−' : '+'}{fmt(tx.amount)} ₸
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
