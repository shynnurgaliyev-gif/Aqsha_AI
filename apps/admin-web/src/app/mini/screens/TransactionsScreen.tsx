'use client';

import { useState, useEffect } from 'react';
import type { TransactionRow } from '../hooks/useMiniApp';

function fmt(n: number) { return n.toLocaleString('ru-RU'); }

interface Props {
  loadTransactions: () => Promise<TransactionRow[]>;
}

export function TransactionsScreen({ loadTransactions }: Props) {
  const [txs, setTxs] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all');

  useEffect(() => {
    setLoading(true);
    loadTransactions()
      .then(setTxs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadTransactions]);

  const filtered = filter === 'all' ? txs : txs.filter((t) => t.kind === filter);

  return (
    <div className="mini-scroll mini-fadein">
      <div className="mini-header">
        <div className="mini-header-title">Операции</div>
      </div>

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
          <div className="mini-empty-text">Нет операций</div>
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
                  <div className="mini-tx-date" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
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
