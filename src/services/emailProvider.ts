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
  // Senha de app do Google é mostrada como "xxxx xxxx xxxx xxxx" — os espaços
  // devem ser removidos para autenticar no SMTP.
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

  if (!user || !pass) {
    logger.warn('[EMAIL] Gmail SMTP não configurado — email apenas logado (não enviado)', { to, subject });
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[EMAIL][DEV] to=${to} subject="${subject}" body=${html}`);
    }
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    // Render não tem rota IPv6 p/ o Gmail (ENETUNREACH em endereço IPv6) — forçar IPv4
    family: 4,
    // Falhar rápido em vez de pendurar a requisição se o SMTP não responder
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  await transporter.sendMail({
    from: `DROP <${user}>`,
    to,
    subject,
    html,
  });
  logger.info('[EMAIL] enviado via Gmail SMTP', { to, subject });
}
