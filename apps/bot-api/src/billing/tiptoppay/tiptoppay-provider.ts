import type {
  IBillingProvider,
  PaymentLink,
  PaymentStatus,
  WebhookPayment,
} from '../provider.interface';

/**
 * TipTopPayProvider — stub for Phase 2.
 *
 * Switch to this provider when monthly volume exceeds 100 active subscribers:
 *   BILLING_PROVIDER=tiptoppay
 *
 * All methods throw until implemented. The architecture (IBillingProvider)
 * ensures zero changes to billing-service.ts when this is filled in.
 */
export class TipTopPayProvider implements IBillingProvider {
  createInvoice(): Promise<PaymentLink> {
    throw new Error('TipTopPay integration not implemented yet. Use BILLING_PROVIDER=kaspi_qr.');
  }

  getStatus(): Promise<PaymentStatus> {
    throw new Error('TipTopPay integration not implemented yet.');
  }

  verifyWebhook(): boolean {
    throw new Error('TipTopPay integration not implemented yet.');
  }

  parseWebhook(): WebhookPayment {
    throw new Error('TipTopPay integration not implemented yet.');
  }
}
