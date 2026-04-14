import { apiRequest, getApiBaseUrl } from './api';

export type MobileMoneyProvider = 'orange_money' | 'mvola' | 'airtel_money';

export interface InitiatePaymentPayload {
  orderId: string;
  provider: MobileMoneyProvider;
  customerMsisdn?: string;
}

export interface InitiatePaymentResponse {
  transactionId: string;
  orderId: string;
  paymentStatus: 'pending' | 'paid' | 'failed';
  ussdCode?: string;
  checkoutUrl?: string | null;
  externalReference?: string;
}

export const isPaymentApiConfigured = () => Boolean(getApiBaseUrl());

export async function initiateMobileMoneyPayment(
  payload: InitiatePaymentPayload,
): Promise<InitiatePaymentResponse> {
  if (!getApiBaseUrl()) {
    throw new Error('PAYMENT_API_NOT_CONFIGURED');
  }

  return apiRequest<InitiatePaymentResponse>('/api/payments/initiate', {
    method: 'POST',
    body: payload,
  });
}

export async function getPaymentStatus(transactionId: string) {
  return apiRequest<{ id: string; status: string; provider: string; externalReference: string }>(
    `/api/payments/${transactionId}/status`
  );
}
