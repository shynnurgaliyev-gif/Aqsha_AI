/**
 * Domain enums for Aqsha AI.
 *
 * Each domain value is expressed as a const object so it is available
 * at runtime (e.g. for DB inserts / switch statements) and as a
 * union type at compile time.
 *
 * Values must match the CHECK constraints in supabase/migrations exactly.
 */

// ── Transaction / Category kind ──────────────────────────────────────────────

export const TransactionKind = {
  Expense: 'expense',
  Income: 'income',
} as const;
export type TransactionKind = (typeof TransactionKind)[keyof typeof TransactionKind];
export const TRANSACTION_KINDS = Object.values(TransactionKind) as readonly TransactionKind[];

/** Categories share the same kind domain as transactions. */
export const CategoryKind = TransactionKind;
export type CategoryKind = TransactionKind;
export const CATEGORY_KINDS = TRANSACTION_KINDS;

// ── Subscription / plan status ────────────────────────────────────────────────
// Values cover both subscriptions.status and users.current_plan_status.

export const SubscriptionStatus = {
  Trial: 'trial',
  Active: 'active',
  Expired: 'expired',
  Blocked: 'blocked',
  Grace: 'grace',
  Canceled: 'canceled',
  Pending: 'pending',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];
export const SUBSCRIPTION_STATUSES = Object.values(
  SubscriptionStatus,
) as readonly SubscriptionStatus[];

// ── Session status ───────────────────────────────────────────────────────────

export const SessionStatus = {
  Idle: 'idle',
  AwaitingInput: 'awaiting_input',
  AwaitingConfirmation: 'awaiting_confirmation',
  InFlow: 'in_flow',
  Expired: 'expired',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];
export const SESSION_STATUSES = Object.values(SessionStatus) as readonly SessionStatus[];

// ── Parse status (transactions) ──────────────────────────────────────────────

export const ParseStatus = {
  Draft: 'draft',
  Confirmed: 'confirmed',
  Corrected: 'corrected',
  Deleted: 'deleted',
} as const;
export type ParseStatus = (typeof ParseStatus)[keyof typeof ParseStatus];
export const PARSE_STATUSES = Object.values(ParseStatus) as readonly ParseStatus[];

// ── Source type (transactions) ───────────────────────────────────────────────

export const SourceType = {
  Text: 'text',
  Voice: 'voice',
  ManualEdit: 'manual_edit',
  Admin: 'admin',
} as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];
export const SOURCE_TYPES = Object.values(SourceType) as readonly SourceType[];

// ── Job status ───────────────────────────────────────────────────────────────

export const JobStatus = {
  Pending: 'pending',
  Processing: 'processing',
  Done: 'done',
  Failed: 'failed',
  Canceled: 'canceled',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
export const JOB_STATUSES = Object.values(JobStatus) as readonly JobStatus[];

// ── Delivery status (daily recommendations) ──────────────────────────────────

export const DeliveryStatus = {
  Pending: 'pending',
  Sent: 'sent',
  Failed: 'failed',
  Skipped: 'skipped',
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];
export const DELIVERY_STATUSES = Object.values(DeliveryStatus) as readonly DeliveryStatus[];

// ── Event source (admin_events) ──────────────────────────────────────────────

export const EventSource = {
  Bot: 'bot',
  Worker: 'worker',
  Cron: 'cron',
  Admin: 'admin',
  System: 'system',
  AI: 'ai',
} as const;
export type EventSource = (typeof EventSource)[keyof typeof EventSource];
export const EVENT_SOURCES = Object.values(EventSource) as readonly EventSource[];

// ── Event severity (admin_events) ────────────────────────────────────────────

export const EventSeverity = {
  Debug: 'debug',
  Info: 'info',
  Warn: 'warn',
  Error: 'error',
} as const;
export type EventSeverity = (typeof EventSeverity)[keyof typeof EventSeverity];
export const EVENT_SEVERITIES = Object.values(EventSeverity) as readonly EventSeverity[];
