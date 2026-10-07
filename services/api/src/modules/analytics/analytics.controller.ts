import { Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import {
  AuthUser,
  CurrentUser,
  Public,
} from '../../common/decorators/auth.decorators';
import { AnalyticsService } from './analytics.service';

class TrackBody {
  @IsString()
  @Length(2, 64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  installationId?: string;

  @IsOptional()
  properties?: Record<string, unknown>;
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @Post('events')
  track(@Body() body: TrackBody, @CurrentUser() user?: AuthUser) {
    return this.analytics.track({
      name: body.name,
      userId: user?.userId,
      installationId: body.installationId,
      properties: body.properties,
    });
  }
}
