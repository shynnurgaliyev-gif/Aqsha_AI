import type { AppEnv } from '@aqsha-ai/config';
import type { IBillingProvider } from './provider.interface';
import { KaspiQrProvider } from './kaspi-qr/kaspi-qr-provider';
import { TipTopPayProvider } from './tiptoppay/tiptoppay-provider';

/**
 * Returns the active billing provider based on BILLING_PROVIDER env var.
 * Called once at request/webhook time — no need to singleton.
 */
export function createBillingProvider(env: AppEnv): IBillingProvider {
  switch (env.BILLING_PROVIDER) {
    case 'kaspi_qr':
      return new KaspiQrProvider(env);
    case 'tiptoppay':
      return new TipTopPayProvider();
    default:
      throw new Error(`Unknown BILLING_PROVIDER: "${env.BILLING_PROVIDER}". Use kaspi_qr or tiptoppay.`);
  }
}
