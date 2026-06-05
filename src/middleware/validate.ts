import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { log } from '../config/logger';
import { ValidationError } from '../utils/AppError';

/**
 * Middleware para validação de requisição com Zod
 * Valida req.body por padrão, mas pode validar outros campos
 */
export const validate = (
  schema: ZodSchema,
  source: 'body' | 'params' | 'query' = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const dataToValidate = (req as any)[source];
      const result = schema.safeParse(dataToValidate);

      if (!result.success) {
        const errors = result.error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));

        log.warn('Validation failed', {
          source,
          errors,
        });

        throw new ValidationError('Validação falhou', errors);
      }

      // Substituir dados com dados validados
      (req as any)[source] = result.data;
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Validar múltiplos campos de uma vez
 */
export const validateMultiple = (validations: Array<{
  schema: ZodSchema;
  source: 'body' | 'params' | 'query';
}>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const allErrors: any[] = [];

      for (const { schema, source } of validations) {
        const dataToValidate = (req as any)[source];
        const result = schema.safeParse(dataToValidate);

        if (!result.success) {
          const errors = result.error.errors.map((e) => ({
            path: `${source}.${e.path.join('.')}`,
            message: e.message,
            code: e.code,
          }));
          allErrors.push(...errors);
        } else {
          (req as any)[source] = result.data;
        }
      }

      if (allErrors.length > 0) {
        log.warn('Multiple validations failed', { errors: allErrors });
        throw new ValidationError('Validação falhou', allErrors);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
