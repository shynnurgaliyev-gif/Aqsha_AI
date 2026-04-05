import type { AppEnv } from '@aqsha-ai/config';
import type {
  IBillingProvider,
  PaymentLink,
  PaymentStatus,
  WebhookPayment,
} from '../provider.interface';
import { KaspiQrClient, type ApiPayWebhookPayload } from './kaspi-qr-client';

/**
 * KaspiQrProvider — implements IBillingProvider using ApiPay.kz.
 *
 * When KASPI_TEST_MODE=true:
 *   createInvoice() returns a fake invoice immediately (no HTTP call).
 *   verifyWebhook() always returns true.
 *   This lets you test the full flow without a real Kaspi account.
 */
export class KaspiQrProvider implements IBillingProvider {
  private readonly client: KaspiQrClient;
  private readonly testMode: boolean;

  constructor(env: AppEnv) {
    this.testMode = env.KASPI_TEST_MODE;
    this.client = new KaspiQrClient(
      env.KASPI_API_KEY ?? '',
      env.KASPI_API_BASE_URL,
    );
  }

  async createInvoice(params: {
    amountKzt: number;
    phone: string;
    externalId: string;
    description: string;
  }): Promise<PaymentLink> {
    if (this.testMode) {
      return {
        invoiceId: `test_${params.externalId}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
    }

    const invoice = await this.client.createInvoice({
      phoneNumber: params.phone,
      amount: params.amountKzt,
      description: params.description,
      externalOrderId: params.externalId,
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    return { invoiceId: String(invoice.id), expiresAt };
  }

  async getStatus(invoiceId: string): Promise<PaymentStatus> {
    if (this.testMode) {
      return { paid: false };
    }
    const invoice = await this.client.getInvoice(invoiceId);
    const paid = invoice.status === 'paid';
    return paid && invoice.paid_at
      ? { paid, paidAt: new Date(invoice.paid_at) }
      : { paid };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    if (this.testMode) return true;
    return this.client.verifySignature(rawBody, signature);
  }

  parseWebhook(body: unknown): WebhookPayment {
    const payload = body as ApiPayWebhookPayload;
    const status = payload.invoice.status === 'paid' ? 'paid'
      : payload.invoice.status === 'cancelled' ? 'cancelled'
      : 'failed';
    return {
      invoiceId: String(payload.invoice.id),
      amountKzt: Math.round(Number(payload.invoice.amount)),
      status,
    };
  }
}
