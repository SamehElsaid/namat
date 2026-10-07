import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../common/logging/logger';
import { NotificationChannel, NotificationEvent } from './notification-events';

/**
 * A tiny in-process fan-out bus. It deliberately has no dependency on any
 * domain module, so domain services can emit events without creating an import
 * cycle with the channels that deliver them. Channels register themselves at
 * startup. Emission never throws and never blocks the caller's result: a
 * channel failure is logged and swallowed.
 */
@Injectable()
export class NotificationsService {
  private readonly log = new StructuredLogger('Notifications');
  private readonly channels: NotificationChannel[] = [];

  register(channel: NotificationChannel): void {
    if (!this.channels.some((c) => c.name === channel.name)) {
      this.channels.push(channel);
    }
  }

  /** Fire-and-forget. Safe to call from inside a request path. */
  emit(event: NotificationEvent): void {
    for (const channel of this.channels) {
      void channel.deliver(event).catch((err) => {
        this.log.warn('notification channel failed', {
          channel: channel.name,
          type: event.type,
          error: err instanceof Error ? err.message : 'unknown',
        });
      });
    }
  }
}
