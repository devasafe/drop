import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { listNearbyStores, listOffers } from '../services/catalog/catalog';

const lat = z.coerce.number().finite().min(-90).max(90);
const lng = z.coerce.number().finite().min(-180).max(180);

/** GET /products/offers — lat/lng opcionais, mas juntos. */
export const OffersQuerySchema = z
  .object({
    lat: lat.optional(),
    lng: lng.optional(),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  })
  .refine((v) => (v.lat == null) === (v.lng == null), { message: 'lat e lng vão juntos', path: ['lat'] });

/** GET /stores/nearby — lat/lng obrigatórios. */
export const NearbyQuerySchema = z.object({
  lat,
  lng,
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

export const getOffers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lat, lng, limit } = req.query as unknown as z.infer<typeof OffersQuerySchema>;
    const point = lat != null && lng != null ? { lat, lng } : null;
    return res.json({ success: true, data: await listOffers({ point, limit }) });
  } catch (err) {
    return next(err);
  }
};

export const getNearbyStores = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lat, lng, limit } = req.query as unknown as z.infer<typeof NearbyQuerySchema>;
    return res.json({ success: true, data: await listNearbyStores({ point: { lat, lng }, limit }) });
  } catch (err) {
    return next(err);
  }
};
