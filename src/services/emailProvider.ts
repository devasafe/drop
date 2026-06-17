import axios from 'axios';
import logger from '../config/logger';

/**
 * Envio de email via Resend (https://resend.com).
 * Sem RESEND_API_KEY configurada, apenas loga — permite testar o fluxo localmente.
 *
 * Env:
 *   RESEND_API_KEY  — chave da API do Resend
 *   EMAIL_FROM      — remetente, ex.: "DROP <noreply@seudominio.com>"
 *                     (sem domínio verificado, use o sandbox: "onboarding@resend.dev")
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'DROP <onboarding@resend.dev>';

  if (!apiKey) {
    logger.warn('[EMAIL] RESEND_API_KEY não configurada — email apenas logado (não enviado)', { to, subject });
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[EMAIL][DEV] to=${to} subject="${subject}" body=${html}`);
    }
    return;
  }

  try {
    await axios.post(
      'https://api.resend.com/emails',
      { from, to, subject, html },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    logger.info('[EMAIL] enviado via Resend', { to, subject });
  } catch (err: any) {
    logger.error('[EMAIL] Falha ao enviar via Resend', { detail: err?.response?.data || err?.message });
    throw err;
  }
}
