import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { searchLimiter, searchSuggestLimiter } from '../middleware/publicRateLimit';
import { categorySummary, search, suggest, type SearchParams } from '../services/search/search';

/**
 * Busca pública da vitrine (montada em /api/search). Aplica os filtros da vitrine
 * (KYC e mensalidade) — ver services/search/search.ts.
 */
const router = Router();

const term = z.string().trim().min(2).max(80);
const optionalNumber = (min: number, max: number) => z.coerce.number().finite().min(min).max(max).optional();

export const SearchQuerySchema = z
  .object({
    q: term.optional(),
    type: z.enum(['products', 'stores']).default('products'),
    lat: optionalNumber(-90, 90),
    lng: optionalNumber(-180, 180),
    categoryName: z.string().trim().min(1).max(80).optional(),
    subCategory: z.string().trim().min(1).max(80).optional(),
    minPrice: optionalNumber(0, 10_000_000),
    maxPrice: optionalNumber(0, 10_000_000),
    openNow: z.enum(['0', '1', 'true', 'false']).optional().transform((v) => v === '1' || v === 'true'),
    sort: z.enum(['relevance', 'price_asc', 'price_desc', 'distance']).default('relevance'),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(40).default(20),
  })
  // Sem termo só se navega por categoria de produto (tela Categoria). Busca de loja sempre tem termo.
  .refine((v) => v.q != null || (v.type === 'products' && v.categoryName != null), { message: 'Informe o termo (q) ou a categoria', path: ['q'] })
  .refine((v) => (v.lat == null) === (v.lng == null), { message: 'lat e lng vão juntos', path: ['lat'] })
  .refine((v) => !(v.sort === 'distance' || v.openNow) || (v.lat != null && v.lng != null), {
    message: 'distance e openNow exigem lat e lng',
    path: ['lat'],
  })
  .refine((v) => v.minPrice == null || v.maxPrice == null || v.minPrice <= v.maxPrice, {
    message: 'minPrice maior que maxPrice',
    path: ['minPrice'],
  });

export const CategoryQuerySchema = z.object({ name: z.string().trim().min(1).max(80) });

export const SuggestQuerySchema = z.object({ q: term });

router.get('/', searchLimiter, validate(SearchQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await search(req.query as unknown as SearchParams);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
});

router.get('/category', searchLimiter, validate(CategoryQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.query as unknown as z.infer<typeof CategoryQuerySchema>;
    return res.json({ success: true, data: await categorySummary(name) });
  } catch (err) {
    return next(err);
  }
});

router.get('/suggest', searchSuggestLimiter, validate(SuggestQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q } = req.query as unknown as z.infer<typeof SuggestQuerySchema>;
    return res.json({ success: true, data: await suggest(q) });
  } catch (err) {
    return next(err);
  }
});

export default router;
