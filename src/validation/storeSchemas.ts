import { z } from 'zod';

/** PUT /stores/:id/pause — `{ minutes: 30|60|120 }` OU `{ untilTomorrow: true }` (nunca os dois). */
export const storePauseSchema = z.union([
  z.object({ minutes: z.union([z.literal(30), z.literal(60), z.literal(120)]) }).strict(),
  z.object({ untilTomorrow: z.literal(true) }).strict(),
]);

export type StorePauseInput = z.infer<typeof storePauseSchema>;

/** Imagem da loja: só o que o próprio DROP subiu (Cloudinary, https). Evita hotlink de qualquer site. */
const storeImageUrl = z.string().trim().max(500).url('Link de imagem inválido')
  .refine((u) => u.startsWith('https://res.cloudinary.com/'), 'Envie a imagem pelo app');

/**
 * PUT /stores/:id — campos de identidade (D1, todos os planos). `passthrough`: os outros campos
 * do PUT (nome, endereço, raio, preparo) seguem para o controller como antes.
 * `null` remove; frase vazia vira null.
 */
export const updateStoreIdentitySchema = z.object({
  logoUrl: storeImageUrl.nullable().optional(),
  coverBannerUrl: storeImageUrl.nullable().optional(),
  tagline: z.string().trim().max(80, 'A frase pode ter até 80 caracteres').nullable().optional()
    .transform((v) => (v === '' ? null : v)),
}).passthrough();
