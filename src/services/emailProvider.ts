import logger from '../config/logger';

/**
 * Envio de email. Sem provedor (SMTP/Resend/SendGrid) configurado, apenas loga —
 * permite testar o fluxo localmente. Integre um provedor real antes de produção.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  // TODO: integrar provedor real de email (Resend/SendGrid/SMTP).
  logger.warn('[EMAIL] Provedor de email não configurado — mensagem apenas logada', { to, subject });
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[EMAIL][DEV] to=${to} subject="${subject}" body=${html}`);
  }
}
