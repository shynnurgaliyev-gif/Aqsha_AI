'use client';

import { useEffect } from 'react';
import { useMiniApp } from './hooks/useMiniApp';
import { MiniStyles } from './components/MiniStyles';
import { MiniBottomNav } from './components/MiniBottomNav';
import { MiniLoader } from './components/MiniLoader';
import { DashboardScreen } from './screens/DashboardScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { getTelegramWebApp } from '@/lib/telegram';

export function MiniShell() {
  const { phase, tab, setTab, firstName, data, loading, error, reload, loadTransactions } = useMiniApp();

  // Expand to full height when shell is ready
  useEffect(() => {
    if (phase === 'shell') {
      const tg = getTelegramWebApp();
      tg?.ready();
      tg?.expand();
    }
  }, [phase]);

  if (phase === 'loading') return <MiniLoader />;

  if (phase === 'not_registered') {
    return (
      <div className="mini-root">
        <MiniStyles />
        <div className="mini-empty" style={{ paddingTop: '40vh' }}>
          <div className="mini-empty-icon">🤖</div>
          <div className="mini-empty-text" style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Аккаунт не найден
          </div>
          <div className="mini-empty-text">
            Напишите боту <strong>@AqshaAiBot</strong>, чтобы начать
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="mini-root">
        <MiniStyles />
        <div className="mini-empty" style={{ paddingTop: '40vh' }}>
          <div className="mini-empty-icon">⚠️</div>
          <div className="mini-empty-text">{error ?? 'Ошибка загрузки'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mini-root">
      <MiniStyles />
      <div className="mini-screen">
        {/* Pull-to-refresh hint */}
        {error && (
          <div style={{
            background: 'var(--red-bg)', color: 'var(--red)',
            padding: '8px 16px', fontSize: 13, textAlign: 'center',
          }}>
            {error}{' '}
            <button onClick={reload} style={{ background: 'none', border: 'none', color: 'var(--red)', fontWeight: 600, cursor: 'pointer' }}>
              Повторить
            </button>
          </div>
        )}

        {/* Screens */}
        {!data && loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MiniLoader />
          </div>
        ) : !data && !loading ? (
          <div className="mini-empty" style={{ flex: 1, paddingTop: '30vh' }}>
            <div className="mini-empty-icon">📡</div>
            <div className="mini-empty-text">Нет данных</div>
            <button
              onClick={reload}
              style={{ marginTop: 16, padding: '8px 20px', borderRadius: 20, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 14 }}
            >
              Повторить
            </button>
          </div>
        ) : data ? (
          <>
            {tab === 'dashboard' && (
              <DashboardScreen data={data} firstName={firstName} loading={loading} />
            )}
            {tab === 'transactions' && (
              <TransactionsScreen loadTransactions={loadTransactions} />
            )}
            {tab === 'analytics' && (
              <AnalyticsScreen data={data} />
            )}
            {tab === 'profile' && (
              <ProfileScreen data={data} firstName={firstName} />
            )}
          </>
        ) : null}

        <MiniBottomNav tab={tab} onTab={setTab} />
      </div>
    </div>
  );
}
