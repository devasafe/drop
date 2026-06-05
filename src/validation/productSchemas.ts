import { z } from 'zod';

export const createProductSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().nonnegative().optional().default(0),
  category: z.string().optional(),
  subCategory: z.string().optional(),
  tags: z.array(z.string()).optional()
});

export const updateProductSchema = createProductSchema.partial();

export const updateStockSchema = z.object({
  quantity: z.number().int().nonnegative()
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
