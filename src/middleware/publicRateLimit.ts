import rateLimit from 'express-rate-limit';

/**
 * Limiters dos endpoints PÚBLICOS novos da vitrine (por IP). Mesmo padrão do
 * `createOrderLimiter` de routes/orders.ts: "trust proxy" já está em app.ts, então
 * `req.ip` vem do X-Forwarded-For; desligado em teste para não acoplar suítes.
 */

/** POST /stores/quotes — cotação em lote dos cards: 30/min/IP. */
export const storeQuotesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: { message: 'Muitas cotações. Aguarde um minuto.', statusCode: 429 } },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});
