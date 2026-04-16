import { apiRequest, getApiBaseUrl } from './api';

export type MobileMoneyProvider = 'orange_money' | 'mvola' | 'airtel_money';

export interface InitiatePaymentPayload {
  orderId: string;
  provider: MobileMoneyProvider;
  customerPhone?: string;
  userReference?: string;
}

export interface InitiatePaymentResponse {
  transactionId: string;
  orderId: string;
  paymentStatus: 'pending' | 'paid' | 'failed';
  externalReference?: string;
}

export interface PaymentTransaction {
  id: string;
  order_id: string;
  provider: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed';
  customer_phone?: string;
  external_reference?: string;
  vendor_confirmed_at?: string;
  created_at: string;
  table_number?: number;
  client_name?: string;
  order_total?: number;
}

/**
 * Génère le code USSD à composer selon l'opérateur.
 * Le client compose ce code → entre son PIN → confirme le transfert.
 *
 * Orange Money : #144*8*{marchand}*{marchand}*{montant}#
 * Mvola        : #111*1*4*1*{marchand}*{montant}#
 * Airtel Money : *436*4*1033*{marchand}*{montant}*73#
 */
export function buildUssdCode(
  provider: MobileMoneyProvider,
  merchantNumber: string,
  amount: number,
): string {
  const n = merchantNumber.trim();
  const a = Math.round(amount);
  switch (provider) {
    case 'orange_money':  return `#144*8*${n}*${n}*${a}#`;
    case 'mvola':         return `#111*1*4*1*${n}*${a}#`;
    case 'airtel_money':  return `*436*4*1033*${n}*${a}*73#`;
    default:              return '';
  }
}

export const isPaymentApiConfigured = () => Boolean(getApiBaseUrl() !== undefined);

/** Client → enregistre la transaction "en attente de confirmation vendeur" */
export async function initiateMobileMoneyPayment(
  payload: InitiatePaymentPayload,
): Promise<InitiatePaymentResponse> {
  return apiRequest<InitiatePaymentResponse>('/api/payments/initiate', {
    method: 'POST',
    body: payload,
  });
}

/** Vendeur → confirme la réception du paiement */
export async function confirmPaymentVendor(transactionId: string) {
  return apiRequest<{ ok: boolean }>(`/api/payments/${transactionId}/confirm`, { method: 'PATCH' });
}

/** Vendeur → rejette un paiement */
export async function rejectPaymentVendor(transactionId: string) {
  return apiRequest<{ ok: boolean }>(`/api/payments/${transactionId}/reject`, { method: 'PATCH' });
}

/** Liste toutes les transactions */
export async function listPayments(): Promise<PaymentTransaction[]> {
  return apiRequest<PaymentTransaction[]>('/api/payments');
}

export async function getPaymentStatus(transactionId: string) {
  return apiRequest<{ id: string; status: string; provider: string; externalReference: string; customerPhone: string }>(
    `/api/payments/${transactionId}/status`,
  );
}
