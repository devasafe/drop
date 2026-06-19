import { z } from 'zod';

/**
 * ✅ SEGURANÇA: Schema de validação de variáveis de ambiente
 * Valida no startup, falha rápido com mensagens claras
 */
const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('4000'),
  
  // Database
  MONGO_URI: z.string().min(10, 'MONGO_URI deve ser uma string válida').optional(),
  MONGODB_URI: z.string().min(10, 'MONGODB_URI deve ser uma string válida').optional(),
  
  // Security
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres').optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // CORS - Origens permitidas (separadas por vírgula)
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001'),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  // Features
  ENABLE_SOCKET_IO: z.string().transform(v => v === 'true').default('true'),
  DELIVERY_TIMEOUT_MINUTES: z.string().transform(Number).default('30'),
  
  // Rate Limiting
  AUTH_LIMITER_MAX: z.string().transform(Number).default('5'),
  AUTH_LIMITER_WINDOW_MS: z.string().transform(Number).default('900000'), // 15 min
  
  // Redis (optional)
  REDIS_URL: z.string().optional(),

  // Payout Gateway (SAÍDA — saque pra conta do recebedor)
  PAYOUT_GATEWAY: z.enum(['manual', 'asaas', 'pagarme', 'efi']).default('manual'),

  // Payment Gateway (ENTRADA — cobrança do cliente) + Asaas
  PAYMENT_GATEWAY: z.enum(['none', 'asaas']).default('none'),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_API_URL: z.string().default('https://sandbox.asaas.com/api/v3'),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  RESERVE_PERCENT: z.string().transform(Number).default('5'),
  RESERVE_DAYS: z.string().transform(Number).default('15'),
  RELEASE_FALLBACK_DAYS: z.string().transform(Number).default('3'),
  PIX_EXPIRATION_MINUTES: z.string().transform(Number).default('30'),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

type Environment = z.infer<typeof envSchema>;

/**
 * ✅ VALIDAR NO STARTUP - Falhar rápido se algo estiver faltando
 * Em testes, retorna com valores padrão
 */
// ⚠️ SEGURANÇA: fallback APENAS para desenvolvimento/teste local.
// Em produção este valor NUNCA é usado (o app aborta antes — ver abaixo).
const DEV_ONLY_JWT_FALLBACK = 'dev_only_insecure_secret_min_32_characters_change_me';

export const env = (() => {
  const isTest = process.env.NODE_ENV === 'test';
  const isProd = process.env.NODE_ENV === 'production';

  try {
    const parsed = envSchema.parse(process.env);
    const mongoUri = parsed.MONGO_URI || parsed.MONGODB_URI;

    // ✅ SEGURANÇA: em produção, segredos são OBRIGATÓRIOS. Sem fallback inseguro.
    // Falha rápido (fail-fast) em vez de subir com um JWT_SECRET público conhecido.
    if (isProd) {
      const missing: string[] = [];
      if (!parsed.JWT_SECRET) missing.push('JWT_SECRET (mínimo 32 caracteres)');
      if (!mongoUri) missing.push('MONGO_URI ou MONGODB_URI');
      if (missing.length > 0) {
        console.error(
          '❌ FATAL: variáveis de ambiente obrigatórias ausentes em produção:\n  • ' +
            missing.join('\n  • ') +
            '\n💡 Configure-as no ambiente (Render/Vercel) antes de iniciar.'
        );
        process.exit(1);
      }
    } else if (!isTest) {
      if (!mongoUri) console.warn('⚠️ MONGO_URI não configurada - usando fallback local');
      if (!parsed.JWT_SECRET) {
        console.warn('⚠️ JWT_SECRET não configurada - usando fallback INSEGURO (apenas dev)');
      }
      console.log(`✅ Environment validated (${parsed.NODE_ENV} mode)`);
    }

    return {
      ...parsed,
      MONGO_URI: mongoUri || 'mongodb://localhost:27017/drop-test',
      // Em produção parsed.JWT_SECRET está garantido (senão já abortamos acima).
      JWT_SECRET: parsed.JWT_SECRET || DEV_ONLY_JWT_FALLBACK,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.errors
        .map(e => `  • ${e.path.join('.')}: ${e.message}`)
        .join('\n');
      
      console.error('❌ ERRO: Variáveis de ambiente inválidas:\n' + fieldErrors);
      console.error('\n💡 Copie o arquivo .env.example para .env e configure os valores');
      
      if (!isTest) process.exit(1);
      
      // Em testes, retornar valores default
      return {
        NODE_ENV: 'test',
        PORT: 4000,
        MONGO_URI: 'mongodb://localhost:27017/drop-test',
        JWT_SECRET: 'test_secret_key_with_minimum_32_characters_length_ok',
        JWT_EXPIRES_IN: '7d',
        CORS_ORIGIN: 'http://localhost:3000,http://localhost:3001',
        LOG_LEVEL: 'error' as const,
        ENABLE_SOCKET_IO: true,
        DELIVERY_TIMEOUT_MINUTES: 30,
        AUTH_LIMITER_MAX: 5,
        AUTH_LIMITER_WINDOW_MS: 900000,
        REDIS_URL: undefined,
        PAYOUT_GATEWAY: 'manual' as const,
        PAYMENT_GATEWAY: 'none' as const,
        ASAAS_API_KEY: undefined,
        ASAAS_API_URL: 'https://sandbox.asaas.com/api/v3',
        ASAAS_WEBHOOK_TOKEN: undefined,
        RESERVE_PERCENT: 5,
        RESERVE_DAYS: 15,
        RELEASE_FALLBACK_DAYS: 3,
        PIX_EXPIRATION_MINUTES: 30,
      };
    }
    throw error;
  }
})();

export default env;
