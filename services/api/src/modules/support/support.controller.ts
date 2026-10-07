import { Body, Controller, Get, Post, UnauthorizedException } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/auth.decorators';
import { SupportService } from './support.service';

class CreateSupportBody {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  body!: string;
}

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateSupportBody) {
    if (!user?.userId) throw new UnauthorizedException();
    return this.support.createFromCustomer({
      userId: user.userId,
      email: user.email ?? null,
      subject: body.subject,
      body: body.body,
    });
  }

  @Get('mine')
  async mine(@CurrentUser() user: AuthUser) {
    if (!user?.userId) throw new UnauthorizedException();
    return { requests: await this.support.listForCustomer(user.userId) };
  }
}
