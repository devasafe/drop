# 📅 PLANO DE AÇÃO - 4 SEMANAS DE REFATORAÇÃO

**Objetivo:** Melhorar código de nota 6.5/10 para 8.5/10  
**Timeline:** 4 semanas  
**Tipo:** Refatoração incremental (sem brecks de funcionalidade)

---

## 🎯 Semana 1: SEGURANÇA & ESTABILIDADE

### Prioridade: 🔴 CRÍTICO

#### Dia 1-2: Corrigir CORS (30 min)
```typescript
// src/app.ts - ANTES
app.use(cors());  // ❌ Aberto demais

// DEPOIS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.CORS_ORIGIN || 'https://app.drop.com.br'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

**Checklist:**
- [ ] Criar variável de ambiente `CORS_ORIGIN`
- [ ] Testar com Postman/curl de origem diferente
- [ ] Documentar whitelist de front-ends

#### Dia 2-3: Validar Variáveis de Ambiente (45 min)
Seguir exemplo do `GUIA_PRATICO_REFATORACAO.md` - seção **Problema #5**

**Checklist:**
- [ ] Criar `src/config/env.ts` com schema Zod
- [ ] Substituir todos os `process.env.X` por `env.X`
- [ ] Testar startup sem `.env` (deve falhar com mensagens claras)
- [ ] Atualizar `.env.example` com todas as variáveis

#### Dia 3-4: Implementar Logger Centralizado (1 hora)
Winston já está instalado, apenas usar

```typescript
// src/config/logger.ts
import winston from 'winston';
import env from './env';

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'drop-backend' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 10
    }),
    ...(env.NODE_ENV !== 'production'
      ? [new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(
              info => `${info.timestamp} [${info.level}] ${info.message}`
            )
          )
        })]
      : [])
  ]
});

export default logger;
```

**Checklist:**
- [ ] Criar arquivo logger.ts
- [ ] Substituir `console.log/warn/error` em: notifier.ts, socketEmitter.ts (2-3 arquivos top priority)
- [ ] Testar logs aparecem em arquivo
- [ ] Verificar que produção não loga no console

#### Dia 4-5: Testes dos 5 Endpoints Críticos (2 horas)
Seguir exemplo do `GUIA_PRATICO_REFATORACAO.md` - seção **Problema #4**

**Endpoints:**
1. `POST /api/auth/register`
2. `POST /api/auth/login`
3. `POST /api/orders`
4. `PATCH /api/orders/:id/status`
5. `POST /api/wallets/:id/withdraw`

```bash
# Criar testes
mkdir -p src/tests/integration
mkdir -p src/tests/unit

# Arquivo unit test
touch src/tests/unit/orderService.test.ts

# Arquivo integration test  
touch src/tests/integration/auth.integration.test.ts
```

**Checklist:**
- [ ] `auth.integration.test.ts` (3 testes: register, login, invalid)
- [ ] `orderController.integration.test.ts` (3 testes: create, cancel, unauthorized)
- [ ] `orderService.test.ts` (3 testes unitários)
- [ ] `npm test` executa todos
- [ ] Coverage mínimo 20% (será melhorado depois)

#### Dia 5: Deploy & Validação (30 min)
```bash
npm install  # Caso Zod não esteja pronto
npm run lint --fix
npm test
npm run build
```

**Checklist:**
- [ ] Build sem erros
- [ ] Todos os testes passam
- [ ] Lint limpo
- [ ] Documentar mudanças em CHANGELOG.md

---

## 🎨 Semana 2: QUALIDADE DE CÓDIGO (Tipos & Separação)

### Prioridade: 🟠 ALTO

#### Dia 6-7: Remover `any` (2 horas)
Seguir exemplo do `GUIA_PRATICO_REFATORACAO.md` - seção **Problema #2**

**Arquivos por prioridade:**
1. `src/types/index.ts` - Expandir com tipos específicos
2. `src/services/notifier.ts` - Usar tipos para payloads
3. `src/utils/socketEmitter.ts` - Tipificar eventos
4. `src/controllers/authController.ts` - Tipificar req/res

```typescript
// src/types/notifications.ts (novo arquivo)
export type NotificationEvent = 
  | 'order:created'
  | 'order:status_changed'
  | 'delivery:assigned'
  | 'payment:confirmed'
  | 'refund:issued';

export interface NotificationPayload {
  event: NotificationEvent;
  message: string;
  data: Record<string, any>;
  timestamp: Date;
  severity: 'info' | 'warning' | 'error';
}
```

**Checklist:**
- [ ] `src/types/notifications.ts` (novo)
- [ ] `src/types/products.ts` (novo)
- [ ] `src/types/delivery.ts` (novo)
- [ ] Atualizar `notifier.ts` com tipos
- [ ] Atualizar `socketEmitter.ts` com tipos
- [ ] `npm run build` sem erros
- [ ] Diminuir uso de `any` em 50%

#### Dia 7-8: Refatorar orderController (2 horas)
Seguir exemplo do `GUIA_PRATICO_REFATORACAO.md` - seção **Problema #3**

**O que fazer:**
1. Criar `src/services/orderService.ts`
2. Extrair funções: validateOrder, createOrder, cancelOrder
3. Deixar controller com < 100 linhas
4. Adicionar testes para service

```bash
# Estrutura final
src/services/
├── orderService.ts      (lógica)
├── walletService.ts     (distribuição earnings)
├── deliveryService.ts   (atribuição motoboy)
└── notificationService.ts (centralizar notificações)
```

**Checklist:**
- [ ] Criar `orderService.ts` e `walletService.ts`
- [ ] Testes em `orderService.test.ts` passam
- [ ] `orderController.ts` refatorado para 100 linhas
- [ ] Sem mudança de comportamento (testes passam)

#### Dia 8-9: Refatorar authController (1.5 horas)
Separar validação, criptografia, criação de wallet

```bash
# Criar serviço
touch src/services/authService.ts
touch src/services/userService.ts
```

**Checklist:**
- [ ] `authService.ts` com register, login
- [ ] `userService.ts` com validateUser, createUser
- [ ] `authController.ts` < 100 linhas
- [ ] Testes passam

#### Dia 9-10: Adicionar JSDoc (1 hora)
Documentar funções públicas

```typescript
/**
 * Cria novo pedido (com transação atômica)
 * @param customerId - ID do cliente
 * @param storeId - ID da loja
 * @param products - Array de {productId, quantity}
 * @returns Pedido criado
 * @throws {Error} Se produto não existe ou estoque insuficiente
 * @example
 * const order = await createOrder('user123', 'store456', [
 *   { productId: 'prod1', quantity: 2 }
 * ]);
 */
export async function createOrder(
  customerId: string,
  storeId: string,
  products: OrderProduct[]
): Promise<IOrder> {
  // ...
}
```

**Checklist:**
- [ ] Todas as exports de `services/` têm JSDoc
- [ ] Todas as exports de `controllers/` têm JSDoc
- [ ] `npm run lint` sem warnings

---

## 🚀 Semana 3: PERFORMANCE & ESCALABILIDADE

### Prioridade: 🟡 MÉDIO (importante mas timing é flexível)

#### Dia 11-12: Implementar Redis Cache (2 horas)
```bash
npm install redis
npm install -D @types/redis
```

**O que cachear:**
- Produtos (TTL 1 hora)
- Lojas (TTL 1 hora)  
- Configurações de delivery (TTL 4 horas)
- Planos de preço (TTL 24 horas)

```typescript
// src/services/cacheService.ts
import { createClient } from 'redis';
import env from '../config/env';

const redis = env.REDIS_URL 
  ? createClient({ url: env.REDIS_URL })
  : null;

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (!redis) return null;
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  },
  
  async set<T>(key: string, value: T, ttl: number = 3600): Promise<void> {
    if (!redis) return;
    await redis.setEx(key, ttl, JSON.stringify(value));
  },
  
  async del(key: string): Promise<void> {
    if (!redis) return;
    await redis.del(key);
  }
};

// Usar em productController
export const getProduct = async (id: string) => {
  const cached = await cache.get(`product:${id}`);
  if (cached) return cached;
  
  const product = await Product.findById(id);
  await cache.set(`product:${id}`, product, 3600);
  return product;
};
```

**Checklist:**
- [ ] Redis opcional (app funciona sem, com menos performance)
- [ ] Cache invalidation ao atualizar produto
- [ ] Testes com e sem Redis
- [ ] Documentar em `.env.example`

#### Dia 12-13: Paginação em Endpoints (1.5 hora)
```typescript
// src/utils/pagination.ts
export interface PaginationQuery {
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

export function parsePaginationQuery(query: any): PaginationQuery {
  return {
    page: Math.max(1, parseInt(query.page) || 1),
    limit: Math.min(100, Math.max(1, parseInt(query.limit) || 20)),
    sort: query.sort,
    order: query.order === 'desc' ? 'desc' : 'asc'
  };
}

export async function paginate<T>(
  query: Model<T>,
  pagination: PaginationQuery
): Promise<PaginatedResponse<T>> {
  const total = await query.countDocuments();
  const totalPages = Math.ceil(total / pagination.limit);
  const skip = (pagination.page - 1) * pagination.limit;
  
  const data = await query
    .skip(skip)
    .limit(pagination.limit)
    .sort({ [pagination.sort || 'createdAt']: pagination.order === 'desc' ? -1 : 1 });
  
  return {
    data,
    total,
    page: pagination.page,
    totalPages,
    hasMore: pagination.page < totalPages
  };
}
```

Usar em endpoints:
```typescript
// GET /api/products?page=1&limit=20
export const listProducts = async (req: AuthenticatedRequest, res: Response) => {
  const pagination = parsePaginationQuery(req.query);
  const result = await paginate(Product.find(), pagination);
  return res.json(result);
};
```

**Checklist:**
- [ ] `src/utils/pagination.ts` criado
- [ ] Aplicado em: listProducts, listOrders, listWalletHistory
- [ ] Testes com paginação
- [ ] Validação de limites (max 100 por página)

#### Dia 13-14: Índices MongoDB (1 hora)
```typescript
// src/models/Product.ts
ProductSchema.index({ storeId: 1, createdAt: -1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ quantity: 1 });

// src/models/Order.ts
OrderSchema.index({ customerId: 1, createdAt: -1 });
OrderSchema.index({ storeId: 1, status: 1 });
OrderSchema.index({ status: 1, createdAt: -1 });

// src/models/Wallet.ts
WalletSchema.index({ owner: 1 });
WalletSchema.index({ 'history.date': -1 });
```

**Checklist:**
- [ ] Índices adicionados em 5+ collections
- [ ] Executar `db.collection.explain()` para verificar uso
- [ ] Documentar em MONGODB_INDEXES.md
- [ ] Testes de performance antes/depois

---

## ✅ Semana 4: DOCUMENTAÇÃO & TESTES

### Prioridade: 🟡 MÉDIO-ALTO

#### Dia 15-16: Cobertura de Testes para 40% (3 horas)
**Adicionar testes para:**
1. authService (register, login, validatePassword)
2. orderService (create, validate, cancel)
3. walletService (credit, debit, balance)
4. deliveryService (assign, timeout)

```bash
# Estrutura
src/tests/
├── unit/
│   ├── authService.test.ts
│   ├── orderService.test.ts
│   ├── walletService.test.ts
│   └── deliveryService.test.ts
├── integration/
│   ├── auth.test.ts
│   ├── orders.test.ts
│   ├── wallet.test.ts
│   └── delivery.test.ts
└── fixtures/
    ├── users.ts
    ├── products.ts
    └── orders.ts

# Run tests
npm test -- --coverage
```

**Checklist:**
- [ ] 15+ testes unitários
- [ ] 10+ testes de integração
- [ ] Coverage mínimo 40%
- [ ] Todos testes passam
- [ ] CI/CD com `npm test` no github actions

#### Dia 16-18: Documentação API (2 horas)
Criar Swagger/OpenAPI

```bash
npm install swagger-jsdoc swagger-ui-express
npm install -D @types/swagger-jsdoc
```

```typescript
// src/config/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Drop Marketplace API',
      version: '0.1.0',
      description: 'Marketplace API documentation'
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Development' },
      { url: process.env.PRODUCTION_URL, description: 'Production' }
    ]
  },
  apis: ['./src/routes/*.ts']
};

export const specs = swaggerJsdoc(options);
```

```typescript
// src/routes/auth.ts
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registrar novo usuário
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201:
 *         description: Usuário criado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: 
 *                   type: string
 *                 email:
 *                   type: string
 */
```

**Checklist:**
- [ ] Swagger instalado e funcionando
- [ ] 5+ rotas documentadas
- [ ] `GET /api-docs` mostra Swagger UI
- [ ] Documentar no README como usar Swagger

#### Dia 18-19: Documentação de Arquitetura (1.5 hora)
Complementar ao `ANALISE_QUALIDADE_CODIGO_COMPLETA.md`

```markdown
# ARQUITETURA.md

## Estrutura de Diretórios

### Controllers
Recebem requisição HTTP, validam com Zod, chamam services.
- authController.ts
- orderController.ts
- walletController.ts

### Services
Lógica de negócio, sem HTTP. Podem ser reutilizados.
- authService.ts
- orderService.ts
- walletService.ts

### Models
Mongoose schemas com validações.
- User.ts, Order.ts, Wallet.ts

### Utils
Funções auxiliares puras ou side-effects.
- pagination.ts
- socketEmitter.ts
- walletCalculations.ts

### Middleware
Interceptadores de requisição.
- auth.ts (verifica JWT)
- authorize.ts (verifica roles)
- errorHandler.ts (trata erros)

## Fluxo de uma Requisição

1. Request chega em app.ts
2. Middleware (auth, parser) processa
3. Route match e chama controller
4. Controller valida com Zod
5. Controller chama service
6. Service faz lógica e retorna
7. Controller retorna response
8. errorHandler pega qualquer erro

## Padrão de Erro

try-catch em controller -> res.status().json()
throw Error em service -> errorHandler middleware
```

**Checklist:**
- [ ] `ARQUITETURA.md` escrito
- [ ] Diagrama ASCII de fluxo
- [ ] Documentar padrões de erro
- [ ] Adicionar ao README

#### Dia 19-20: Setup Local Documentation (1 hora)
```markdown
# SETUP_LOCAL.md

## Pré-requisitos
- Node.js 16+
- MongoDB local ou Docker
- npm 8+

## Passos

### 1. Clonar repo
\`\`\`bash
git clone ...
cd drop-backend
\`\`\`

### 2. Instalar dependências
\`\`\`bash
npm install
\`\`\`

### 3. Criar arquivo .env
\`\`\`bash
cp .env.example .env
# Editar .env com valores locais
\`\`\`

### 4. Subir MongoDB (opcional, usar Docker)
\`\`\`bash
docker-compose up -d
\`\`\`

### 5. Rodar migrations (se houver)
\`\`\`bash
npm run migrate
\`\`\`

### 6. Iniciar servidor
\`\`\`bash
npm run dev
\`\`\`

Servidor rodando em http://localhost:4000
API Docs em http://localhost:4000/api-docs

## Testes
\`\`\`bash
npm test              # Rodar todos testes
npm test -- --watch   # Watch mode
npm test -- --coverage # Com cobertura
\`\`\`

## Lint & Build
\`\`\`bash
npm run lint          # Verificar lint
npm run lint --fix    # Corrigir automaticamente
npm run build         # Compilar TypeScript
\`\`\`

## Troubleshooting

### Port 4000 já em uso
\`\`\`bash
PORT=5000 npm run dev
\`\`\`

### MongoDB connection refused
- Verificar MongoDB rodando: `mongosh`
- Ou subir com Docker: `docker-compose up -d`

### Erro de tipo TypeScript
- Limpar cache: `rm -rf dist node_modules`
- Reinstalar: `npm install && npm run build`
```

**Checklist:**
- [ ] `SETUP_LOCAL.md` escrito
- [ ] Testado de zero (clonar, setup, rodar)
- [ ] Screenshots (opcional)
- [ ] Adicionar ao README com link

#### Dia 20: Deploy & Cleanup (1 hora)

```bash
# Cleanup
git rm ADMIN_*.md CHECKOUT_*.md FIX_*.md PHASE_*.md ... # Deletar docs antigos
git add .
git commit -m "refactor: improve code quality, add tests, documentation"
git push

# Versionar
npm version patch  # 0.1.0 -> 0.1.1

# Tag
git tag v0.1.1
git push --tags
```

**Checklist:**
- [ ] Cleanup dos docs antigos
- [ ] `npm test` passa
- [ ] `npm run build` sem erros
- [ ] Versão bumped
- [ ] Mudanças commitadas
- [ ] CHANGELOG.md atualizado

---

## 📊 Métricas de Progresso

### Início (Semana 0)
- Nota: 6.5/10
- Cobertura de testes: ~5%
- Type `any`: 20+ usos
- Logging inconsistente: ✓
- Documentação: Mínima
- CORS: Aberto
- Controllers > 200 linhas: 3+

### Fim (Semana 4)
- Nota: 8.5/10
- Cobertura de testes: 40%+
- Type `any`: < 5 usos
- Logging: Centralizado ✓
- Documentação: Completa
- CORS: Whitelist
- Controllers > 200 linhas: 0

### Progresso por Semana
```
Semana 1: 6.5 → 7.0   (Segurança + Testes básicos)
Semana 2: 7.0 → 7.5   (Tipos + Refatoração)
Semana 3: 7.5 → 8.0   (Performance + Cache)
Semana 4: 8.0 → 8.5   (Documentação + Testes)
```

---

## 🎯 Checklist Final (Semana 4, Dia 20)

- [ ] Todos os testes passam (`npm test`)
- [ ] Build sem erros (`npm run build`)
- [ ] Lint sem warnings (`npm run lint`)
- [ ] Cobertura > 40% (`npm test -- --coverage`)
- [ ] Documentação completa (SETUP_LOCAL.md, ARQUITETURA.md, Swagger)
- [ ] CORS configurado
- [ ] Variáveis de ambiente validadas
- [ ] Logger centralizado
- [ ] Type `any` < 5 usos
- [ ] Controllers refatorados < 150 linhas
- [ ] Índices MongoDB criados
- [ ] Cache com Redis (opcional)
- [ ] Paginação implementada
- [ ] Código commitado e tagged como v0.1.1

---

## 🚀 Próximos Passos (Pós-Semana 4)

1. **Semana 5-6:** Coverage de testes para 60%+
2. **Semana 7-8:** Performance tuning e load testing
3. **Semana 9-10:** Preparar para produção (CI/CD, monitoring)
4. **Semana 11+:** Features novas com confiança (testes em dia)

---

*Plano criado para melhorar qualidade do Drop Marketplace de forma sistemática e sustentável.*
