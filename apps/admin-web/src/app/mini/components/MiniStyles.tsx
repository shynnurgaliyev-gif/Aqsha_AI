export function MiniStyles() {
  return (
    <style>{`
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      .mini-root {
        --accent:    #3b82f6;
        --accent-bg: #eff6ff;
        --green:     #22c55e;
        --green-bg:  #f0fdf4;
        --red:       #ef4444;
        --red-bg:    #fef2f2;
        --text:      var(--tg-theme-text-color, #111827);
        --hint:      var(--tg-theme-hint-color, #6b7280);
        --bg:        var(--tg-theme-bg-color, #f9fafb);
        --card-bg:   var(--tg-theme-secondary-bg-color, #ffffff);
        --border:    rgba(0,0,0,0.08);
        --nav-h:     64px;
        --safe-b:    env(safe-area-inset-bottom, 0px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 15px;
        background: var(--bg);
        color: var(--text);
        min-height: 100vh;
        min-height: 100dvh;
      }

      /* ── Layout ──────────────────────────────────────────────────────── */
      .mini-screen {
        height: 100vh;
        height: 100dvh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .mini-scroll {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 16px 16px calc(var(--nav-h) + var(--safe-b) + 16px);
      }

      /* ── Nav ─────────────────────────────────────────────────────────── */
      .mini-nav {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        height: calc(var(--nav-h) + var(--safe-b));
        padding-bottom: var(--safe-b);
        display: flex;
        background: var(--card-bg);
        border-top: 1px solid var(--border);
        z-index: 100;
      }

      .mini-nav-item {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        border: none;
        background: none;
        cursor: pointer;
        color: var(--hint);
        transition: color 0.15s;
        -webkit-tap-highlight-color: transparent;
        padding: 8px 0;
      }

      .mini-nav-item.active { color: var(--accent); }
      .mini-nav-icon { font-size: 22px; line-height: 1; }
      .mini-nav-label { font-size: 11px; font-weight: 500; }

      /* ── Cards ───────────────────────────────────────────────────────── */
      .mini-card {
        background: var(--card-bg);
        border-radius: 16px;
        padding: 16px;
        margin-bottom: 12px;
        border: 1px solid var(--border);
      }

      .mini-card-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--hint);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 12px;
      }

      /* ── Balance card ────────────────────────────────────────────────── */
      .mini-balance-card {
        background: linear-gradient(135deg, #1d4ed8, #3b82f6);
        border-radius: 20px;
        padding: 20px;
        margin-bottom: 16px;
        color: #fff;
        border: none;
      }

      .mini-balance-label {
        font-size: 13px;
        opacity: 0.75;
        margin-bottom: 6px;
      }

      .mini-balance-amount {
        font-size: 32px;
        font-weight: 700;
        letter-spacing: -0.5px;
        line-height: 1.1;
      }

      .mini-balance-sub {
        display: flex;
        gap: 16px;
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid rgba(255,255,255,0.2);
      }

      .mini-balance-sub-item { flex: 1; }
      .mini-balance-sub-label { font-size: 11px; opacity: 0.7; }
      .mini-balance-sub-value { font-size: 16px; font-weight: 600; margin-top: 2px; }

      /* ── Month stats ─────────────────────────────────────────────────── */
      .mini-stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 12px;
      }

      .mini-stat-card {
        background: var(--card-bg);
        border-radius: 14px;
        padding: 14px;
        border: 1px solid var(--border);
      }

      .mini-stat-icon { font-size: 20px; margin-bottom: 6px; }
      .mini-stat-label { font-size: 11px; color: var(--hint); margin-bottom: 3px; }
      .mini-stat-value { font-size: 18px; font-weight: 700; }
      .mini-stat-value.green { color: var(--green); }
      .mini-stat-value.red   { color: var(--red);   }

      /* ── Category bar ────────────────────────────────────────────────── */
      .mini-cat-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid var(--border);
      }
      .mini-cat-row:last-child { border-bottom: none; }

      .mini-cat-bar-wrap {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mini-cat-name { font-size: 14px; font-weight: 500; }
      .mini-cat-track { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
      .mini-cat-fill  { height: 100%; background: var(--accent); border-radius: 2px; }
      .mini-cat-amount { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; }

      /* ── Transaction row ─────────────────────────────────────────────── */
      .mini-tx-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 0;
        border-bottom: 1px solid var(--border);
      }
      .mini-tx-row:last-child { border-bottom: none; }

      .mini-tx-icon {
        width: 38px; height: 38px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 16px;
        flex-shrink: 0;
      }
      .mini-tx-icon.expense { background: var(--red-bg); }
      .mini-tx-icon.income  { background: var(--green-bg); }

      .mini-tx-info { flex: 1; min-width: 0; }
      .mini-tx-cat  { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .mini-tx-date { font-size: 12px; color: var(--hint); }
      .mini-tx-amount { font-size: 15px; font-weight: 600; }
      .mini-tx-amount.expense { color: var(--red);   }
      .mini-tx-amount.income  { color: var(--green); }

      /* ── Goal row ────────────────────────────────────────────────────── */
      .mini-goal-row { padding: 10px 0; border-bottom: 1px solid var(--border); }
      .mini-goal-row:last-child { border-bottom: none; }
      .mini-goal-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
      .mini-goal-name { font-size: 14px; font-weight: 500; }
      .mini-goal-pct  { font-size: 12px; color: var(--accent); font-weight: 600; }
      .mini-goal-track { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
      .mini-goal-fill  { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.4s; }
      .mini-goal-amounts { display: flex; justify-content: space-between; margin-top: 4px; font-size: 12px; color: var(--hint); }

      /* ── Recurring row ───────────────────────────────────────────────── */
      .mini-rec-row {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 0; border-bottom: 1px solid var(--border);
      }
      .mini-rec-row:last-child { border-bottom: none; }
      .mini-rec-day {
        width: 36px; height: 36px; border-radius: 50%;
        background: var(--accent-bg); color: var(--accent);
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 700; flex-shrink: 0;
      }
      .mini-rec-info { flex: 1; }
      .mini-rec-name { font-size: 14px; font-weight: 500; }
      .mini-rec-cat  { font-size: 12px; color: var(--hint); }
      .mini-rec-amount { font-size: 14px; font-weight: 600; color: var(--red); }

      /* ── Subscription badge ──────────────────────────────────────────── */
      .mini-sub-badge {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 12px; border-radius: 20px;
        font-size: 13px; font-weight: 600;
      }
      .mini-sub-badge.active  { background: var(--green-bg); color: var(--green); }
      .mini-sub-badge.trial   { background: var(--accent-bg); color: var(--accent); }
      .mini-sub-badge.expired { background: var(--red-bg); color: var(--red); }

      /* ── Section title ───────────────────────────────────────────────── */
      .mini-section { margin-bottom: 12px; }
      .mini-section-title {
        font-size: 16px; font-weight: 700;
        margin-bottom: 10px; color: var(--text);
      }

      /* ── Empty state ─────────────────────────────────────────────────── */
      .mini-empty {
        text-align: center; padding: 32px 16px;
        color: var(--hint);
      }
      .mini-empty-icon { font-size: 40px; margin-bottom: 10px; }
      .mini-empty-text { font-size: 14px; }

      /* ── Header ──────────────────────────────────────────────────────── */
      .mini-header {
        padding: 16px 16px 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .mini-header-title { font-size: 20px; font-weight: 700; }
      .mini-header-sub   { font-size: 13px; color: var(--hint); }

      /* ── Animations ──────────────────────────────────────────────────── */
      @keyframes fadein {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .mini-fadein { animation: fadein 0.2s ease-out; }

      /* ── Skeleton ────────────────────────────────────────────────────── */
      @keyframes shimmer {
        from { background-position: -200% 0; }
        to   { background-position:  200% 0; }
      }
      .mini-skeleton {
        background: linear-gradient(90deg, var(--border) 25%, var(--card-bg) 50%, var(--border) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.2s infinite;
        border-radius: 8px;
      }

      /* ── Divider ─────────────────────────────────────────────────────── */
      .mini-divider { height: 1px; background: var(--border); margin: 4px 0; }

      /* ── Compare chip ────────────────────────────────────────────────── */
      .mini-compare {
        font-size: 12px; padding: 2px 6px; border-radius: 6px; font-weight: 500;
      }
      .mini-compare.up   { background: var(--red-bg);   color: var(--red);   }
      .mini-compare.down { background: var(--green-bg); color: var(--green); }
    `}</style>
  );
}
