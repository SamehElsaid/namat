import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DeviceChallengeEntity,
  DeviceEntity,
  EntitlementEntity,
} from '../../database/entities';
import { DeviceEnrollmentModule } from '../device-enrollment/device-enrollment.module';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceEntity,
      EntitlementEntity,
      DeviceChallengeEntity,
    ]),
    DeviceEnrollmentModule,
  ],
  providers: [DevicesService],
  controllers: [DevicesController],
  exports: [DevicesService],
})
export class DevicesModule {}
