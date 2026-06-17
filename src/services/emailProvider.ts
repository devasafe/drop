import axios from 'axios';
import logger from '../config/logger';

/**
 * Envio de email via Brevo (API HTTP). Usamos HTTP (porta 443) porque o Render
 * bloqueia SMTP de saída no plano free.
 * Sem credenciais configuradas, apenas loga (dev).
 *
 * Env:
 *   BREVO_API_KEY  — chave da API (Brevo > SMTP & API > API Keys)
 *   BREVO_SENDER   — email remetente VERIFICADO no Brevo (ex.: contatoasapdev@gmail.com)
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER || process.env.GMAIL_USER;

  if (!apiKey || !sender) {
    logger.warn('[EMAIL] Brevo não configurado — email apenas logado (não enviado)', { to, subject });
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[EMAIL][DEV] to=${to} subject="${subject}" body=${html}`);
    }
    return;
  }

  try {
    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { name: 'DROP', email: sender },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
      {
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
        timeout: 15000,
      }
    );
    logger.info('[EMAIL] enviado via Brevo', { to, subject });
  } catch (err: any) {
    logger.error('[EMAIL] Falha ao enviar via Brevo', { detail: err?.response?.data || err?.message });
    throw err;
  }
}
