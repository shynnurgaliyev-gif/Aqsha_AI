'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getTelegramWebApp } from '@/lib/telegram';

const API = (process.env['NEXT_PUBLIC_API_URL'] ?? 'https://aqsha-ai-bot-api.onrender.com').replace(/\/$/, '');
const TOKEN_KEY = 'aqsha_mini_token';
const TOKEN_EXP_KEY = 'aqsha_mini_token_exp';
/** Hard cap on auth retry chain to prevent a 401 → re-auth → 401 hot loop. */
const MAX_AUTH_RETRIES = 2;

export type MiniPhase = 'loading' | 'not_registered' | 'paywall' | 'shell' | 'error';
export type MiniTab = 'dashboard' | 'transactions' | 'analytics' | 'profile';

export interface BalanceSummary {
  balance: number;
  totalIncome: number;
  totalExpense: number;
}

export interface MonthSummary {
  expense: number;
  income: number;
  prevExpense: number;
  range: { gte: string; lt: string };
}

export interface CategoryRow {
  categoryName: string;
  total: number;
  count: number;
}

export interface TransactionRow {
  id: string;
  kind: 'expense' | 'income';
  amount: number;
  categoryName: string;
  rawText: string | null;
  date: string;
}

export interface RecurringRow {
  id: string;
  description: string;
  categoryName: string;
  amount: number;
  dayOfMonth: number;
}

export interface GoalRow {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  isCompleted: boolean;
}

export interface SubscriptionInfo {
  status: string;
  endDate: string;
  daysLeft: number;
}

export interface AnalyticsData {
  month: MonthSummary & { label: string };
  categories: CategoryRow[];
}

export interface MiniData {
  balance: BalanceSummary;
  month: MonthSummary;
  categories: CategoryRow[];
  transactions: TransactionRow[];
  recurring: RecurringRow[];
  goals: GoalRow[];
  subscription: SubscriptionInfo | null;
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(TOKEN_KEY);
  const exp = localStorage.getItem(TOKEN_EXP_KEY);
  if (!token || !exp) return null;
  if (Date.now() > Number(exp)) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXP_KEY);
    return null;
  }
  return token;
}

function storeToken(token: string, expiresAt: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_EXP_KEY, String(new Date(expiresAt).getTime()));
}

function miniHeaders(): Record<string, string> {
  const token = getStoredToken() ?? '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Mini-Auth': token } : {}),
  };
}

export function useMiniApp() {
  const [phase, setPhase] = useState<MiniPhase>('loading');
  const [tab, setTab] = useState<MiniTab>('dashboard');
  const [firstName, setFirstName] = useState('');
  const [planStatus, setPlanStatus] = useState('');
  const [data, setData] = useState<MiniData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Counts consecutive 401 → re-auth attempts. Resets on any non-401 response.
  const authRetryCount = useRef(0);

  // Authenticate with Telegram initData
  const authenticate = useCallback(async () => {
    const tg = getTelegramWebApp();

    // Try cached token first
    const cached = getStoredToken();
    if (cached) {
      setPhase('shell');
      return;
    }

    if (!tg) {
      // Development fallback
      if (process.env['NODE_ENV'] === 'development') {
        setPhase('shell');
        setFirstName('Dev');
        return;
      }
      setPhase('error');
      setError('Откройте приложение через Telegram');
      return;
    }

    tg.ready();
    tg.expand();

    const initData = tg.initData;
    if (!initData) {
      setPhase('error');
      setError('Нет данных авторизации');
      return;
    }

    try {
      const res = await fetch(`${API}/telegram/mini/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ init_data: initData }),
      });
      const json = await res.json() as {
        ok: boolean;
        state?: string;
        plan_status?: string;
        first_name?: string;
        mini_token?: string;
        expires_at?: string;
        error?: string;
      };

      if (!json.ok || json.state === 'not_registered') {
        setPhase('not_registered');
        return;
      }

      if (json.state === 'paywall') {
        setFirstName(json.first_name ?? tg.initDataUnsafe?.user?.first_name ?? '');
        setPlanStatus(json.plan_status ?? '');
        setPhase('paywall');
        return;
      }

      if (json.mini_token && json.expires_at) {
        storeToken(json.mini_token, json.expires_at);
      }
      setFirstName(json.first_name ?? tg.initDataUnsafe?.user?.first_name ?? '');
      setPlanStatus(json.plan_status ?? '');
      setPhase('shell');
    } catch {
      setPhase('error');
      setError('Ошибка подключения');
    }
  }, []);

  // Load main data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/telegram/mini/data`, {
        headers: miniHeaders(),
      });
      if (res.status === 402) {
        // Subscription required — back to paywall
        const json = await res.json().catch(() => ({})) as { plan_status?: string };
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXP_KEY);
        if (json.plan_status) setPlanStatus(json.plan_status);
        setPhase('paywall');
        return;
      }
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXP_KEY);
        if (authRetryCount.current >= MAX_AUTH_RETRIES) {
          // Avoid 401 → auth → 401 hot loop. Surface a hard error instead.
          authRetryCount.current = 0;
          setPhase('error');
          setError('Не удалось авторизоваться. Откройте Mini App заново через бота.');
          return;
        }
        authRetryCount.current += 1;
        setPhase('loading');
        authenticate();
        return;
      }
      // Any non-401 response means the auth chain succeeded; reset the counter.
      authRetryCount.current = 0;
      if (!res.ok) {
        setError(`Ошибка сервера: ${res.status}`);
        return;
      }
      const json = await res.json() as { ok: boolean; error?: string } & MiniData;
      if (!json.ok) {
        setError(json.error ?? 'Ошибка загрузки данных');
        return;
      }
      setData(json);
      setPlanStatus(json.subscription?.status ?? planStatus);
    } catch {
      setError('Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
    }
  }, [authenticate, planStatus]);

  // Load analytics for a specific month (YYYY-MM)
  const loadAnalytics = useCallback(async (month: string): Promise<AnalyticsData | null> => {
    try {
      const res = await fetch(
        `${API}/telegram/mini/analytics?month=${encodeURIComponent(month)}`,
        { headers: miniHeaders() },
      );
      if (!res.ok) return null;
      const json = await res.json() as { ok: boolean } & AnalyticsData;
      return json.ok ? json : null;
    } catch {
      return null;
    }
  }, []);

  // Load transactions for a date range (YYYY-MM-DD)
  const loadTransactions = useCallback(async (from: string, to: string): Promise<TransactionRow[]> => {
    const res = await fetch(
      `${API}/telegram/mini/transactions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers: miniHeaders() },
    );
    const json = await res.json() as { ok: boolean; transactions: TransactionRow[] };
    return json.transactions ?? [];
  }, []);

  useEffect(() => {
    authenticate();
  }, [authenticate]);

  useEffect(() => {
    if (phase === 'shell') {
      loadData();
    }
  }, [phase, loadData]);

  return {
    phase,
    tab,
    setTab,
    firstName,
    planStatus,
    data,
    loading,
    error,
    reload: loadData,
    loadAnalytics,
    loadTransactions,
  };
}
