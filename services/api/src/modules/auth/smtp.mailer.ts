import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { StructuredLogger } from '../../common/logging/logger';

export const SMTP_SETTING_NAMES = [
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
] as const;

export interface SmtpPublicStatus {
  configured: boolean;
  missing: string[];
  port: number | null;
  encryption: 'starttls' | 'implicit-tls' | 'unspecified';
  accepted?: boolean;
}

interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/**
 * OTP delivery. Credentials stay in the process environment.
 * Gmail (smtp.gmail.com:587) and a later official host use the same variables.
 */
@Injectable()
export class SmtpMailer {
  private readonly log = new StructuredLogger('SmtpMailer');

  constructor(private readonly config: ConfigService) {}

  settings(): SmtpSettings {
    const port = Number(this.config.get<number>('app.smtp.port') ?? 587);
    return {
      host: (this.config.get<string>('app.smtp.host') ?? '').trim(),
      port: Number.isFinite(port) ? port : 587,
      user: (this.config.get<string>('app.smtp.user') ?? '').trim(),
      password: this.config.get<string>('app.smtp.password') ?? '',
      from: (this.config.get<string>('app.smtp.from') ?? '').trim(),
    };
  }

  missing(): string[] {
    const smtp = this.settings();
    const missing: string[] = [];
    if (!smtp.host) missing.push('SMTP_HOST');
    if (!smtp.user) missing.push('SMTP_USER');
    if (!smtp.password) missing.push('SMTP_PASSWORD');
    if (!smtp.from) missing.push('SMTP_FROM');
    return missing;
  }

  isConfigured(): boolean {
    return this.missing().length === 0;
  }

  status(): SmtpPublicStatus {
    const smtp = this.settings();
    return {
      configured: this.isConfigured(),
      missing: this.missing(),
      port: smtp.port,
      encryption:
        smtp.port === 465
          ? 'implicit-tls'
          : smtp.port === 587
            ? 'starttls'
            : 'unspecified',
    };
  }

  /** Opens the SMTP session. Does not send mail and does not return secrets. */
  async probe(): Promise<SmtpPublicStatus> {
    const status = this.status();
    if (!status.configured) {
      this.log.warn('SMTP probe skipped', { missing: status.missing });
      return { ...status, accepted: false };
    }
    try {
      await this.transport().verify();
      this.log.info('SMTP probe accepted');
      return { ...status, accepted: true };
    } catch (err) {
      this.log.warn('SMTP probe failed', { reason: errorName(err) });
      return { ...status, accepted: false };
    }
  }

  async sendOtpEmail(
    to: string,
    code: string,
    expiresInSeconds: number,
  ): Promise<'sent'> {
    if (!this.isConfigured()) {
      throw new Error('SMTP is not configured');
    }
    const from = this.settings().from;
    const minutes = Math.max(1, Math.round(expiresInSeconds / 60));
    await this.transport().sendMail({
      from,
      to,
      subject: 'نَمَط · رمز التحقق',
      text: [
        `رمز التحقق: ${code}`,
        `ينتهي خلال ${minutes} دقيقة.`,
        '',
        `Your NAMAT code is ${code}. It expires in ${minutes} minute(s).`,
        '',
        'إذا لم تطلب هذا الرمز، تجاهل الرسالة.',
        'If you did not request this code, ignore this email.',
      ].join('\n'),
      html: `<div dir="rtl"><p>رمز التحقق هو <strong>${code}</strong>.</p><p>ينتهي خلال ${minutes} دقيقة.</p><p>إذا لم تطلب هذا الرمز، تجاهل الرسالة.</p></div><p>Your NAMAT code is <strong>${code}</strong>. It expires in ${minutes} minute(s).</p>`,
    });
    this.log.info('OTP email accepted by SMTP');
    return 'sent';
  }

  async sendOwnerLoginCode(
    to: string,
    code: string,
    expiresInSeconds: number,
  ): Promise<'sent'> {
    if (!this.isConfigured()) {
      throw new Error('SMTP is not configured');
    }
    const from = this.settings().from;
    const minutes = Math.max(1, Math.round(expiresInSeconds / 60));
    const grouped = code.replace(/(.{4})/g, '$1-').replace(/-$/, '');
    await this.transport().sendMail({
      from,
      to,
      subject: 'نَمَط · رمز الدخول المؤقت',
      text: [
        `رمز الدخول المؤقت: ${grouped}`,
        `ينتهي خلال ${minutes} دقيقة ويُستخدم مرة واحدة.`,
        'بعد التحقق، عيّن كلمة المرور قبل فتح لوحة المالك.',
        '',
        'إذا لم تطلب هذا الرمز، تجاهل الرسالة.',
      ].join('\n'),
      html: `<div dir="rtl"><p>رمز الدخول المؤقت هو <strong>${grouped}</strong>.</p><p>ينتهي خلال ${minutes} دقيقة ويُستخدم مرة واحدة.</p><p>بعد التحقق، عيّن كلمة المرور قبل فتح لوحة المالك.</p><p>إذا لم تطلب هذا الرمز، تجاهل الرسالة.</p></div>`,
    });
    this.log.info('Owner login email accepted by SMTP');
    return 'sent';
  }

  private transport() {
    const smtp = this.settings();
    const implicitTls = smtp.port === 465;
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: implicitTls,
      requireTLS: !implicitTls,
      auth: { user: smtp.user, pass: smtp.password },
      tls: { minVersion: 'TLSv1.2' },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
}

function errorName(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return err instanceof Error ? err.name : 'error';
}
