'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTelegramWebApp } from '@/lib/telegram';

const API = (process.env['NEXT_PUBLIC_API_URL'] ?? 'https://aqsha-ai-bot-api.onrender.com').replace(/\/$/, '');
const TOKEN_KEY = 'aqsha_mini_token';
const TOKEN_EXP_KEY = 'aqsha_mini_token_exp';

export type MiniPhase = 'loading' | 'not_registered' | 'shell' | 'error';
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
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXP_KEY);
        setPhase('loading');
        authenticate();
        return;
      }
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

  // Load full transactions list for transactions tab
  const loadTransactions = useCallback(async (): Promise<TransactionRow[]> => {
    const res = await fetch(`${API}/telegram/mini/transactions`, {
      headers: miniHeaders(),
    });
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
    loadTransactions,
  };
}
