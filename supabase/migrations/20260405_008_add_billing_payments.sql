-- =========================================================
-- MIGRATION 008: Billing — payments table + users.phone_number
-- =========================================================

-- Phone number for Kaspi Pay invoicing (optional, collected at payment time)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Payments log: every payment attempt from any provider
CREATE TABLE public.payments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  provider            TEXT        NOT NULL,   -- 'kaspi_qr' | 'tiptoppay' | 'stub'
  provider_invoice_id TEXT        NULL,        -- provider's invoice/order ID

  amount_kzt          INTEGER     NOT NULL CHECK (amount_kzt > 0),

  status              TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'expired')),

  expires_at          TIMESTAMPTZ NULL,        -- when the payment link expires
  paid_at             TIMESTAMPTZ NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_user_id
  ON public.payments (user_id);

CREATE INDEX idx_payments_provider_invoice
  ON public.payments (provider, provider_invoice_id)
  WHERE provider_invoice_id IS NOT NULL;

CREATE INDEX idx_payments_status
  ON public.payments (status);

CREATE TRIGGER trg_payments_set_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
