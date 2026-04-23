import type { MiniData } from '../hooks/useMiniApp';

function fmt(n: number) { return n.toLocaleString('ru-RU'); }

function subBadgeClass(status: string) {
  if (status === 'active') return 'active';
  if (status === 'trial')  return 'trial';
  return 'expired';
}

function subLabel(status: string) {
  if (status === 'active')  return '✅ Подписка активна';
  if (status === 'trial')   return '🎁 Пробный период';
  if (status === 'grace')   return '⚠️ Льготный период';
  if (status === 'pending') return '⏳ Ожидание оплаты';
  return '🔒 Подписка истекла';
}

interface Props { data: MiniData; firstName: string; }

export function ProfileScreen({ data, firstName }: Props) {
  const { subscription, goals, recurring } = data;
  const activeGoals = goals.filter((g) => !g.isCompleted);
  const doneGoals   = goals.filter((g) => g.isCompleted);

  return (
    <div className="mini-scroll mini-fadein">
      <div className="mini-header">
        <div>
          <div className="mini-header-title">{firstName || 'Профиль'}</div>
          <div className="mini-header-sub">Aqsha AI</div>
        </div>
      </div>

      {/* Subscription */}
      <div className="mini-card mini-section">
        <div className="mini-card-title">Подписка</div>
        {subscription ? (
          <>
            <span className={`mini-sub-badge ${subBadgeClass(subscription.status)}`}>
              {subLabel(subscription.status)}
            </span>
            <div style={{ marginTop: 10, fontSize: 14, color: 'var(--hint)' }}>
              {subscription.daysLeft > 0
                ? `Осталось дней: ${subscription.daysLeft}`
                : 'Срок действия истёк'}
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--hint)', fontSize: 14 }}>Нет данных</div>
        )}
      </div>

      {/* Goals */}
      <div className="mini-card mini-section">
        <div className="mini-card-title">Цели накопления</div>
        {activeGoals.length === 0 && doneGoals.length === 0 ? (
          <div className="mini-empty" style={{ padding: '16px 0' }}>
            <div className="mini-empty-icon" style={{ fontSize: 28 }}>🎯</div>
            <div className="mini-empty-text">Нет целей. Напишите боту: «Накопить на отпуск 200000»</div>
          </div>
        ) : (
          <>
            {activeGoals.map((g) => {
              const p = Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100));
              return (
                <div key={g.id} className="mini-goal-row">
                  <div className="mini-goal-header">
                    <div className="mini-goal-name">{g.name}</div>
                    <div className="mini-goal-pct">{p}%</div>
                  </div>
                  <div className="mini-goal-track">
                    <div className="mini-goal-fill" style={{ width: `${p}%` }} />
                  </div>
                  <div className="mini-goal-amounts">
                    <span>{fmt(g.savedAmount)} ₸</span>
                    <span>цель: {fmt(g.targetAmount)} ₸</span>
                  </div>
                </div>
              );
            })}
            {doneGoals.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--hint)' }}>
                ✅ Выполнено: {doneGoals.map((g) => g.name).join(', ')}
              </div>
            )}
          </>
        )}
      </div>

      {/* Recurring expenses */}
      <div className="mini-card mini-section">
        <div className="mini-card-title">Регулярные расходы</div>
        {recurring.length === 0 ? (
          <div className="mini-empty" style={{ padding: '16px 0' }}>
            <div className="mini-empty-icon" style={{ fontSize: 28 }}>🔁</div>
            <div className="mini-empty-text">Нет. Напишите: «Аренда 50000 каждый месяц 5»</div>
          </div>
        ) : (
          recurring.map((r) => (
            <div key={r.id} className="mini-rec-row">
              <div className="mini-rec-day">{r.dayOfMonth}</div>
              <div className="mini-rec-info">
                <div className="mini-rec-name">{r.description}</div>
                <div className="mini-rec-cat">{r.categoryName}</div>
              </div>
              <div className="mini-rec-amount">−{fmt(r.amount)} ₸</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
