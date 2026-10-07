import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import {
  AllowPasswordSetup,
  AuthUser,
  CurrentUser,
  PasswordSetupOnly,
  Public,
} from '../../common/decorators/auth.decorators';
import { Throttle } from '@nestjs/throttler';
import { clearSessionCookie, setSessionCookie } from './session-cookie';

class RequestOtpBody {
  @IsEmail()
  email!: string;
}

class VerifyOtpBody {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(4, 8)
  @Matches(/^\d+$/)
  code!: string;
}

class GoogleLoginBody {
  @IsString()
  @Length(20, 8192)
  idToken!: string;
}

class OwnerCodeRequestBody {
  @IsEmail()
  email!: string;
}

class OwnerCodeVerifyBody {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 64)
  code!: string;
}

class OwnerPasswordBody {
  @IsString()
  @Length(12, 128)
  password!: string;

  @IsString()
  @Length(12, 128)
  confirmation!: string;
}

class OwnerLoginBody {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private secureCookie(): boolean {
    return (this.config.get<string>('app.nodeEnv') ?? '') === 'production';
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/request')
  requestOtp(@Body() body: RequestOtpBody) {
    return this.auth.requestOtp(body.email);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('otp/verify')
  async verifyOtp(
    @Body() body: VerifyOtpBody,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: { ip?: string },
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.auth.verifyOtp(body.email, body.code, {
      userAgent,
      ip: req?.ip,
    });
    if (res) setSessionCookie(res, result.accessToken, this.secureCookie());
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('google')
  async google(
    @Body() body: GoogleLoginBody,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: { ip?: string },
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.auth.loginWithGoogle(body.idToken, {
      userAgent,
      ip: req?.ip,
    });
    if (res) setSessionCookie(res, result.accessToken, this.secureCookie());
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('owner/code/request')
  requestOwnerCode(@Body() body: OwnerCodeRequestBody) {
    return this.auth.requestOwnerLoginCode(body.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('owner/password/forgot')
  forgotOwnerPassword(@Body() body: OwnerCodeRequestBody) {
    return this.auth.requestOwnerLoginCode(body.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('owner/code/verify')
  async verifyOwnerCode(
    @Body() body: OwnerCodeVerifyBody,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: { ip?: string },
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.auth.verifyOwnerLoginCode(body.email, body.code, {
      userAgent,
      ip: req?.ip,
    });
    if (res) {
      setSessionCookie(res, result.accessToken, this.secureCookie(), 15 * 60 * 1000);
    }
    return result;
  }

  @PasswordSetupOnly()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('owner/password')
  async setOwnerPassword(
    @CurrentUser() user: AuthUser,
    @Body() body: OwnerPasswordBody,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: { ip?: string },
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.auth.completePasswordSetup(
      user,
      body.password,
      body.confirmation,
      { userAgent, ip: req?.ip },
    );
    if (res) setSessionCookie(res, result.accessToken, this.secureCookie());
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('owner/login')
  async ownerLogin(
    @Body() body: OwnerLoginBody,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: { ip?: string },
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.auth.loginWithPassword(body.email, body.password, {
      userAgent,
      ip: req?.ip,
    });
    if (res) setSessionCookie(res, result.accessToken, this.secureCookie());
    return result;
  }

  @AllowPasswordSetup()
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.revokeSession(user.sessionId);
    clearSessionCookie(res, this.secureCookie());
    return { ok: true };
  }

  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.revokeAllSessions(user.userId);
    clearSessionCookie(res, this.secureCookie());
    return { ok: true };
  }
}
