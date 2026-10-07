import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * Global so any domain module can inject NotificationsService and emit without
 * importing a heavy module. It stays a leaf: no domain or channel imports here,
 * which is what keeps the event flow acyclic (channels register themselves).
 */
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
