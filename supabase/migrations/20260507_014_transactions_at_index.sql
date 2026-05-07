begin;

-- Hot-path indexes for ORDER BY transaction_at DESC.
--
-- Existing composite indexes (idx_transactions_user_date_active and friends)
-- order by transaction_date_local, which cannot serve queries that order by
-- transaction_at — they require a sort step on a partial scan.
--
-- queryRecentTransactions and the Mini App /telegram/mini/transactions
-- endpoint both ORDER BY t.transaction_at DESC. With this partial index the
-- planner can walk the index backward and stop after LIMIT, avoiding the sort
-- entirely.
--
-- Partial on is_deleted = false because every active query already filters it.

create index if not exists idx_transactions_user_at_active
  on public.transactions (user_id, transaction_at desc)
  where is_deleted = false;

commit;
