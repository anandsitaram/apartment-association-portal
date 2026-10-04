// How a payment status (shared/dues PayStatus) is worded and coloured on the phone.
import type { PayStatus } from '../../../shared/dues';

export const STATUS_LABEL: Record<PayStatus, string> = { paid: 'Paid', unpaid: 'Unpaid', excluded: 'Not applicable' };
export const STATUS_TONE: Record<PayStatus, 'ok' | 'warn' | 'bad' | 'muted'> = {
  paid: 'ok',
  unpaid: 'bad',
  excluded: 'muted',
};
