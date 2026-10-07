import { PurchaseEntity, PurchaseStatusDb } from '../../database/entities/purchase.entity';

/** Customer-facing status. Provider and card data stay off this response. */
export type CustomerPurchaseStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export type CustomerPaymentMethod = 'terminal' | 'card' | 'wallet' | 'unknown';

export interface CustomerPurchase {
  id: string;
  reference: string;
  createdAt: string;
  amountMinor: number;
  currency: string;
  status: CustomerPurchaseStatus;
  /** Safe method label. Never a card number, token, or provider id. */
  paymentMethod: CustomerPaymentMethod;
  test: boolean;
}

export function presentCustomerPurchase(row: PurchaseEntity): CustomerPurchase {
  return {
    id: row.id,
    reference: row.customerReferenceNumber,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: customerPurchaseStatus(row.status),
    paymentMethod: customerPaymentMethod(row),
    test: row.providerMode === 'test' || row.status === 'test_paid',
  };
}

export function customerPurchaseStatus(
  status: PurchaseStatusDb,
): CustomerPurchaseStatus {
  switch (status) {
    case 'approved':
    case 'test_paid':
      return 'completed';
    case 'pending':
    case 'reserving':
      return 'pending';
    case 'rejected':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
    case 'reversed':
      return 'refunded';
  }
}

function customerPaymentMethod(row: PurchaseEntity): CustomerPaymentMethod {
  if (row.provider === 'nearpay') return 'terminal';
  if (row.paymentMethodType === 'applepay' || row.paymentMethodType === 'samsungpay' || row.paymentMethodType === 'stcpay') {
    return 'wallet';
  }
  if (row.paymentMethodType === 'creditcard') return 'card';
  return 'unknown';
}
