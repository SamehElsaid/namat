import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SmtpMailer } from './smtp.mailer';
import { GoogleTokenVerifier } from './google-identity';
import {
  UserEntity,
  SessionEntity,
  OtpChallengeEntity,
  AccountIdentityEntity,
  LoginCodeEntity,
} from '../../database/entities';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([
      UserEntity,
      SessionEntity,
      OtpChallengeEntity,
      AccountIdentityEntity,
      LoginCodeEntity,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('app.jwtSecret'),
        signOptions: {
          expiresIn: config.get<string>('app.jwtExpiresIn') ?? '30d',
        },
      }),
    }),
  ],
  providers: [AuthService, SmtpMailer, GoogleTokenVerifier],
  controllers: [AuthController],
  exports: [AuthService, SmtpMailer, GoogleTokenVerifier, JwtModule],
})
export class AuthModule {}
