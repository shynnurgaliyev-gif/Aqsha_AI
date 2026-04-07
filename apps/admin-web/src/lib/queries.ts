import { getDb } from './db';

// ---------------------------------------------------------------------------
// User stats
// ---------------------------------------------------------------------------

export interface UserStats {
  total: number;
  byPlanStatus: { status: string; count: number }[];
}

export async function getUserStats(): Promise<UserStats> {
  const db = getDb();
  const [totals, byStatus] = await Promise.all([
    db<{ total: string }[]>`SELECT COUNT(*)::text AS total FROM public.users`,
    db<{ status: string; count: string }[]>`
      SELECT current_plan_status AS status, COUNT(*)::text AS count
        FROM public.users
       GROUP BY current_plan_status
       ORDER BY count DESC
    `,
  ]);

  return {
    total: Number(totals[0]?.total ?? 0),
    byPlanStatus: (byStatus ?? []).map((r) => ({
      status: r.status,
      count: Number(r.count),
    })),
  };
}

// ---------------------------------------------------------------------------
// Job queue counts
// ---------------------------------------------------------------------------

export interface JobCounts {
  byStatus: { status: string; count: number }[];
}

export async function getJobCounts(): Promise<JobCounts> {
  const db = getDb();
  const rows = await db<{ status: string; count: string }[]>`
    SELECT status, COUNT(*)::text AS count
      FROM public.job_queue
     GROUP BY status
     ORDER BY count DESC
  `;

  return {
    byStatus: (rows ?? []).map((r) => ({ status: r.status, count: Number(r.count) })),
  };
}

// ---------------------------------------------------------------------------
// Daily recommendation counts
// ---------------------------------------------------------------------------

export interface RecommendationCounts {
  byDeliveryStatus: { status: string; count: number }[];
}

export async function getRecommendationCounts(): Promise<RecommendationCounts> {
  const db = getDb();
  const rows = await db<{ status: string; count: string }[]>`
    SELECT delivery_status AS status, COUNT(*)::text AS count
      FROM public.daily_recommendations
     GROUP BY delivery_status
     ORDER BY count DESC
  `;

  return {
    byDeliveryStatus: (rows ?? []).map((r) => ({
      status: r.status,
      count: Number(r.count),
    })),
  };
}

// ---------------------------------------------------------------------------
// Recent admin events
// ---------------------------------------------------------------------------

export interface AdminEvent {
  id: string;           // bigint in DB — cast to text in query
  event_type: string;
  user_id: string | null;
  event_source: string;
  severity: string;
  event_payload: Record<string, unknown>;
  created_at: string;
}

export async function getRecentAdminEvents(limit = 20): Promise<AdminEvent[]> {
  const db = getDb();
  const rows = await db<AdminEvent[]>`
    SELECT id::text, event_type, user_id, event_source, severity, event_payload, created_at::text AS created_at
      FROM public.admin_events
     ORDER BY created_at DESC
     LIMIT ${limit}
  `;

  return rows ?? [];
}

// ---------------------------------------------------------------------------
// Recent failed jobs
// ---------------------------------------------------------------------------

export interface FailedJob {
  id: string;
  job_type: string;
  payload_json: Record<string, unknown>;
  last_error: string | null;
  attempts: number;
  updated_at: string;
}

export async function getRecentFailedJobs(limit = 10): Promise<FailedJob[]> {
  const db = getDb();
  const rows = await db<FailedJob[]>`
    SELECT id::text, job_type, payload_json, last_error, attempts, updated_at::text AS updated_at
      FROM public.job_queue
     WHERE status = 'failed'
     ORDER BY updated_at DESC
     LIMIT ${limit}
  `;

  return rows ?? [];
}
