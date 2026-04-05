import { createHmac } from 'node:crypto';

/**
 * HTTP client for ApiPay.kz — a Kaspi QR gateway that wraps the official
 * Kaspi QR API without requiring a direct Kaspi Bank contract or VPN tunnel.
 *
 * Docs: https://apipay.kz/docs.html
 * Base: https://bpapi.bazarbay.site/api/v1
 */

export interface ApiPayInvoiceResponse {
  id: number;
  amount: string;
  status: string;        // 'pending' | 'paid' | 'cancelled' | 'expired'
  paid_at: string | null;
  created_at: string;
}

export interface ApiPayWebhookPayload {
  event: string;         // 'invoice.status_changed'
  invoice: {
    id: number;
    external_order_id: string;
    amount: string;
    status: string;
    paid_at: string | null;
  };
  timestamp: string;
}

export class KaspiQrClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly webhookSecret: string;

  constructor(apiKey: string, baseUrl: string, webhookSecret?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    // ApiPay.kz signs webhooks with a separate secret if configured,
    // otherwise falls back to the API key itself.
    this.webhookSecret = webhookSecret ?? apiKey;
  }

  private headers(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async createInvoice(params: {
    phoneNumber: string;
    amount: number;
    description: string;
    externalOrderId: string;
  }): Promise<ApiPayInvoiceResponse> {
    const res = await fetch(`${this.baseUrl}/invoices`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        phone_number: params.phoneNumber,
        amount: params.amount,
        description: params.description,
        external_order_id: params.externalOrderId,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ApiPay createInvoice HTTP ${res.status}: ${text}`);
    }

    return res.json() as Promise<ApiPayInvoiceResponse>;
  }

  async getInvoice(invoiceId: string): Promise<ApiPayInvoiceResponse> {
    const res = await fetch(`${this.baseUrl}/invoices/${invoiceId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`ApiPay getInvoice HTTP ${res.status}`);
    }

    return res.json() as Promise<ApiPayInvoiceResponse>;
  }

  /**
   * Verifies the HMAC-SHA256 signature on an incoming webhook.
   * ApiPay sends: X-Webhook-Signature: sha256=<hex>
   * Secret is the API key itself.
   */
  verifySignature(rawBody: string, signatureHeader: string): boolean {
    const expected = `sha256=${createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex')}`;
    return signatureHeader === expected;
  }
}
