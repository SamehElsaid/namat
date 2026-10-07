import { Module } from '@nestjs/common';
import { LocalFileStorage } from './local-file.storage';

@Module({
  providers: [LocalFileStorage],
  exports: [LocalFileStorage],
})
export class StorageModule {}
