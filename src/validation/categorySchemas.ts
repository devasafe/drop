import { z } from 'zod';

export const createCategorySchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1)
});

export const updateCategorySchema = z.object({
  name: z.string().min(1)
});
