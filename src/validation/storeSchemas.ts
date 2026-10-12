import { z } from 'zod';

/** PUT /stores/:id/pause — `{ minutes: 30|60|120 }` OU `{ untilTomorrow: true }` (nunca os dois). */
export const storePauseSchema = z.union([
  z.object({ minutes: z.union([z.literal(30), z.literal(60), z.literal(120)]) }).strict(),
  z.object({ untilTomorrow: z.literal(true) }).strict(),
]);

export type StorePauseInput = z.infer<typeof storePauseSchema>;
