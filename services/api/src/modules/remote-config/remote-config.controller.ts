import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/auth.decorators';
import { RemoteConfigService } from './remote-config.service';

@Controller('remote-config')
export class RemoteConfigController {
  constructor(private readonly remoteConfig: RemoteConfigService) {}

  @Public()
  @Get()
  get() {
    return this.remoteConfig.getPublic();
  }
}
