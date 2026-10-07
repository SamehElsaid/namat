import { ConfigService } from '@nestjs/config';
import { SmtpMailer } from './smtp.mailer';

function mailer(values: Record<string, string | number>): SmtpMailer {
  const config = {
    get: (key: string) => values[key],
  } as ConfigService;
  return new SmtpMailer(config);
}

describe('SmtpMailer', () => {
  it('reports only missing variable names', () => {
    const status = mailer({
      'app.smtp.host': '',
      'app.smtp.port': 587,
      'app.smtp.user': '',
      'app.smtp.password': '',
      'app.smtp.from': '',
    }).status();
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual([
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASSWORD',
      'SMTP_FROM',
    ]);
    expect(JSON.stringify(status)).not.toContain('app-password');
    expect(JSON.stringify(status)).not.toContain('@');
  });

  it('treats port 587 as STARTTLS without exposing the account', () => {
    const status = mailer({
      'app.smtp.host': 'smtp.gmail.com',
      'app.smtp.port': 587,
      'app.smtp.user': 'owner@gmail.com',
      'app.smtp.password': 'app-password',
      'app.smtp.from': 'owner@gmail.com',
    }).status();
    expect(status.configured).toBe(true);
    expect(status.missing).toEqual([]);
    expect(status.port).toBe(587);
    expect(status.encryption).toBe('starttls');
    expect(JSON.stringify(status)).not.toContain('owner@gmail.com');
    expect(JSON.stringify(status)).not.toContain('app-password');
    expect(JSON.stringify(status)).not.toContain('smtp.gmail.com');
  });

  it('does not call a probe successful when settings are missing', async () => {
    const result = await mailer({
      'app.smtp.host': 'smtp.gmail.com',
      'app.smtp.port': 587,
      'app.smtp.user': '',
      'app.smtp.password': '',
      'app.smtp.from': '',
    }).probe();
    expect(result.accepted).toBe(false);
    expect(result.missing).toEqual(['SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']);
  });
});
