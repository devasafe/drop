import axios from 'axios';
import logger from '../config/logger';

/**
 * Abstração de envio de OTP. Permite trocar de provedor sem mexer no resto.
 */
export interface OtpProvider {
  sendOtp(e164: string, code: string): Promise<void>;
}

/**
 * WhatsApp Cloud API (Meta). Em ambiente sem credenciais (dev/teste), apenas
 * loga o código — assim o fluxo funciona localmente sem enviar mensagem real.
 */
class WhatsAppCloudProvider implements OtpProvider {
  async sendOtp(e164: string, code: string): Promise<void> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const template = process.env.WHATSAPP_OTP_TEMPLATE;

    if (!token || !phoneNumberId || !template) {
      logger.warn('[OTP] WhatsApp Cloud API não configurado — código apenas logado (não enviado)', {
        e164,
        // Em produção isto não acontece: as env vars são obrigatórias para enviar.
        code: process.env.NODE_ENV === 'production' ? '******' : code,
      });
      return;
    }

    const to = e164.replace('+', '');
    await axios.post(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: 'pt_BR' },
          // Template com 1 parâmetro no corpo (o código). Se você usar um template
          // "authentication" oficial com botão de copiar, adicione o componente button.
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
          ],
        },
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
  }
}

export const otpProvider: OtpProvider = new WhatsAppCloudProvider();
export default otpProvider;
