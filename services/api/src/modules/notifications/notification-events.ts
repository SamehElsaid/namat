/**
 * Account-scoped notification events. The dispatcher fans these out to every
 * registered channel (Telegram today; email/push/SMS can register later from
 * the same events). Payloads carry no secrets — only identifiers and
 * already-public, account-owned facts.
 */
export type NotificationType =
  | 'ACCOUNT_LINKED'
  | 'NEW_DEVICE'
  | 'DEVICE_REMOVED'
  | 'PURCHASE_COMPLETED'
  | 'NEW_DESIGN_AVAILABLE'
  | 'SECURITY_ALERT'
  | 'SUPPORT_UPDATE';

export interface NotificationEvent {
  type: NotificationType;
  /** The NAMAT account the event concerns. */
  userId: string;
  /** Optional non-sensitive details a channel may render (e.g. device label). */
  data?: Record<string, string | number | null | undefined>;
}

/** A delivery channel. Implementations must never throw to the dispatcher. */
export interface NotificationChannel {
  readonly name: string;
  deliver(event: NotificationEvent): Promise<void>;
}
