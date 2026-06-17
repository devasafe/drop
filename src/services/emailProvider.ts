import nodemailer from 'nodemailer';
import logger from '../config/logger';

/**
 * Envio de email via Gmail SMTP (nodemailer).
 * Sem credenciais configuradas, apenas loga (dev).
 *
 * Env:
 *   GMAIL_USER          — seu Gmail (ex.: contatoasapdev@gmail.com)
 *   GMAIL_APP_PASSWORD  — "senha de app" gerada em https://myaccount.google.com/apppasswords
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    logger.warn('[EMAIL] Gmail SMTP não configurado — email apenas logado (não enviado)', { to, subject });
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[EMAIL][DEV] to=${to} subject="${subject}" body=${html}`);
    }
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `DROP <${user}>`,
    to,
    subject,
    html,
  });
  logger.info('[EMAIL] enviado via Gmail SMTP', { to, subject });
}
