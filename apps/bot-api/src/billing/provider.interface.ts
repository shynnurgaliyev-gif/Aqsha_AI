/**
 * IBillingProvider — contract that every payment provider must implement.
 *
 * Swapping providers (Kaspi QR → TipTopPay) is a one-line env change:
 *   BILLING_PROVIDER=kaspi_qr → BILLING_PROVIDER=tiptoppay
 *
 * The billing service and webhook route only call this interface — they never
 * know which provider is underneath.
 */

export interface PaymentLink {
  /** Provider's internal invoice/order ID — stored in payments.provider_invoice_id */
  invoiceId: string;
  /** When this payment link expires and can no longer be paid */
  expiresAt: Date;
}

export interface PaymentStatus {
  paid: boolean;
  paidAt?: Date;
}

export interface WebhookPayment {
  /** Must match payments.provider_invoice_id for lookup */
  invoiceId: string;
  amountKzt: number;
  status: 'paid' | 'failed' | 'cancelled';
}

export interface IBillingProvider {
  /**
   * Creates a payment invoice.
   * - Kaspi QR: sends a push notification to the customer's Kaspi app
   * - TipTopPay: creates a hosted payment page link
   */
  createInvoice(params: {
    amountKzt: number;
    phone: string;        // customer phone in 87XXXXXXXXX format
    externalId: string;   // our internal idempotency key
    description: string;
  }): Promise<PaymentLink>;

  /** Polls the provider for the current status of a payment */
  getStatus(invoiceId: string): Promise<PaymentStatus>;

  /** Returns true if the webhook signature is valid */
  verifyWebhook(rawBody: string, signature: string): boolean;

  /** Parses the raw webhook body into a normalised WebhookPayment */
  parseWebhook(body: unknown): WebhookPayment;
}
