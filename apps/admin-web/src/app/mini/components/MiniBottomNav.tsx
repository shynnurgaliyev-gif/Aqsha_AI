import type { MiniTab } from '../hooks/useMiniApp';

interface Props {
  tab: MiniTab;
  onTab: (t: MiniTab) => void;
}

const TABS: { id: MiniTab; icon: string; label: string }[] = [
  { id: 'dashboard',    icon: '🏠', label: 'Главная'   },
  { id: 'transactions', icon: '📋', label: 'Операции'  },
  { id: 'analytics',   icon: '📊', label: 'Аналитика' },
  { id: 'profile',     icon: '👤', label: 'Профиль'   },
];

export function MiniBottomNav({ tab, onTab }: Props) {
  return (
    <nav className="mini-nav">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`mini-nav-item${tab === t.id ? ' active' : ''}`}
          onClick={() => onTab(t.id)}
        >
          <span className="mini-nav-icon">{t.icon}</span>
          <span className="mini-nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
