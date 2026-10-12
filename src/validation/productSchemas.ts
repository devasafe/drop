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

/** PUT /products/:id/active — pausar (false) ou reativar (true) o produto. */
export const setProductActiveSchema = z.object({
  isActive: z.boolean({ required_error: 'Informe isActive', invalid_type_error: 'isActive deve ser true ou false' }),
}).strict();

/** PATCH /products/stock — repor estoque em lote pelo painel (até 200 itens). */
export const bulkStockSchema = z.object({
  storeId: z.string().min(1),
  items: z
    .array(z.object({ productId: z.string().min(1), stock: z.number().int().min(0) }))
    .min(1, 'Envie ao menos um item')
    .max(200, 'Máximo de 200 itens por vez'),
});
export type BulkStockInput = z.infer<typeof bulkStockSchema>;

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
