import nodemailer from 'nodemailer';
import dns from 'dns';
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
  // Senha de app do Google vem como "xxxx xxxx xxxx xxxx" — remover espaços.
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

  if (!user || !pass) {
    logger.warn('[EMAIL] Gmail SMTP não configurado — email apenas logado (não enviado)', { to, subject });
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[EMAIL][DEV] to=${to} subject="${subject}" body=${html}`);
    }
    return;
  }

  // O Render não tem rota IPv6 de saída e o Gmail resolve para IPv6 (ENETUNREACH).
  // Resolvemos o IPv4 manualmente e conectamos direto nele, mantendo o servername
  // correto para a validação do certificado TLS.
  const { address: ipv4 } = await dns.promises.lookup('smtp.gmail.com', { family: 4 });

  const transporter = nodemailer.createTransport({
    host: ipv4,
    port: 465,
    secure: true,
    auth: { user, pass },
    tls: { servername: 'smtp.gmail.com' },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  await transporter.sendMail({ from: `DROP <${user}>`, to, subject, html });
  logger.info('[EMAIL] enviado via Gmail SMTP (IPv4)', { to, subject });
}
