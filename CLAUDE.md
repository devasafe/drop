# CLAUDE.md — Projeto Drop

Marketplace de delivery completo (estilo iFood) com backend Node.js/Express e frontend Next.js.

## Comandos essenciais

```bash
# Backend (porta 4000)
cd D:\PROJETOS\Drop
npm run dev

# Frontend (porta 3000)
cd D:\PROJETOS\Drop\frontend
npm run dev

# Testes
npm test           # backend
npm run lint       # linting
```

## Estrutura do projeto

```
Drop/
├── src/                    # Backend Express/TypeScript
│   ├── index.ts            # Entry point — inicializa DB, Socket.io, server
│   ├── app.ts              # Express config, rotas, middlewares
│   ├── db.ts               # Conexão MongoDB
│   ├── config/
│   │   ├── env.ts          # Validação de env vars via Zod (falha rápido)
│   │   └── logger.ts       # Winston logger (silenciado em prod)
│   ├── models/             # 19 Mongoose models
│   ├── controllers/        # Business logic (14+ controllers)
│   ├── routes/             # 18 grupos de rotas Express
│   ├── middleware/         # auth.ts (JWT), errorHandler.ts, validate.ts, upload.ts
│   ├── services/           # notifier.ts, routeCalculator.ts, wallet.service.ts
│   ├── sockets/            # chat.ts — Socket.io handlers
│   ├── jobs/               # deliveryTimeout.job.ts — cron de timeout
│   └── types/              # TypeScript definitions
│
├── frontend/               # Next.js 13 / React 18
│   ├── pages/              # ~35 páginas
│   ├── components/         # ~25 componentes React
│   ├── contexts/           # AuthContext, SocketContext, CartContext
│   ├── hooks/              # useChat, useAuth, useSync, useAutoRefetch
│   └── lib/                # api.ts (axios), socket.ts, config.ts
│
├── .env.example            # Template de variáveis de ambiente
├── package.json            # Backend deps
└── frontend/package.json   # Frontend deps
```

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express 4.18 + TypeScript 5 |
| Banco | MongoDB 7 + Mongoose 7 |
| Auth | JWT (jsonwebtoken 9) + bcrypt 5 |
| Tempo real | Socket.io 4.8 |
| Validação | Zod 3.25 |
| Frontend | Next.js 13 + React 18 |
| Testes | Jest 29 + mongodb-memory-server |
| Logger | Winston 3 |

## Arquitetura

```
Next.js Frontend
     ↕ REST (axios)          ↕ Socket.io
Express API
  Routes → Controllers → Services → Mongoose → MongoDB
  Middleware: JWT auth, Zod validate, rate-limit, upload
```

## Modelos MongoDB (19)

| Model | Descrição |
|---|---|
| `User` | Usuários com múltiplos roles e endereços |
| `Store` | Lojas dos lojistas |
| `Product` | Catálogo de produtos |
| `Order` | Pedidos com status e distribuição de wallets |
| `Delivery` | Entregas dos motoboys com PIN de verificação |
| `Wallet` | Carteiras financeiras (user, store, motoboy, platform) |
| `Transaction` | Histórico de transações |
| `Conversation` | Conversas do chat |
| `Message` | Mensagens do chat |
| `Notification` | Notificações push |
| `Cancellation` | Cancelamentos e reembolsos |
| `Category` | Categorias de produtos |
| `Gamification` | Pontos e conquistas dos motoboys |
| `AppCashbox` | Caixa da plataforma |
| `PricingPlan` | Planos de assinatura |
| `PlatformConfig` | Configurações globais |
| `StoreSubscription` | Assinaturas das lojas |
| `Withdrawal` | Solicitações de saque |

## Roles de usuário

```
CEO → Manager → Admin → Marketing
Lojista → Cliente → Motoboy
(usuário pode ter múltiplos roles, troca via /api/auth/switch-role)
```

## Fluxo de pedido

```
1. Cliente cria pedido (POST /api/orders) → status: 'criado'
2. Pagamento confirmado → status: 'pago'
3. Sistema busca motoboy disponível → status: 'aguardando_motoboy'
4. Motoboy aceita → Delivery criado → Order status: 'enviado'
5. Entrega concluída (PIN verificado) → status: 'entregue'
6. Distribuição automática das wallets:
   - Loja: valor do produto × (1 - comissão_plataforma)
   - Motoboy: taxa de entrega × (1 - comissão_entrega)
   - Plataforma: comissões (15-30% produto, 20-30% entrega)
```

## Status dos pedidos

`criado` → `pago` → `aguardando_motoboy` → `enviado` → `entregue`
`cancelado` (pode sair de qualquer status, com lógica de reembolso)

## Sistema de chat (Socket.io)

3 tipos de conversa:
- `loja_cliente` — Loja ↔ Cliente
- `loja_motoboy` — Loja ↔ Motoboy
- `motoboy_cliente` — Motoboy ↔ Cliente

Endpoints: `POST /api/chat/conversations`, `GET /api/chat/conversations`, etc.
Socket events: `chat:message`, `chat:join`, `chat:typing`, `chat:read`

## Endpoints principais

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/switch-role

GET    /api/user/:id
PUT    /api/user/:id

POST   /api/orders
GET    /api/orders
GET    /api/orders/:id

GET    /api/deliveries
PUT    /api/deliveries/:id/status
POST   /api/deliveries/:id/accept

GET    /api/wallets
GET    /api/wallets/:userId/history

POST   /api/chat/conversations
GET    /api/chat/conversations
POST   /api/chat/conversations/:id/messages

GET    /api/admin/dashboard
GET    /api/admin/users
GET    /api/admin/withdrawals
```

## Middleware de auth

```typescript
// Importar: import { authenticate } from '../middleware/auth';
// Aplicar em rotas protegidas: router.get('/rota', authenticate, controller)
// req.user.id e req.user.role ficam disponíveis após autenticação
```

## Padrão de resposta da API

```typescript
// Sucesso
res.status(200).json({ success: true, data: result });

// Erro
res.status(400).json({ success: false, error: { message: 'Mensagem', statusCode: 400 } });
```

## Convenções de código

- **Controllers**: try/catch com session MongoDB, usar `AppError` para erros esperados
- **Rotas**: validação Zod via middleware `validate(schema)` antes dos controllers
- **Frontend**: Context API para estado global, hooks customizados para lógica reutilizável
- **Logs backend**: usar `logger.debug()` / `logger.info()` do `src/config/logger.ts` (não `console.log`)
- **Logs frontend**: `console.log` temporariamente aceitável, ideal usar `frontend/lib/logger.ts`
- **URLs no frontend**: sempre usar `process.env.NEXT_PUBLIC_API_URL` (nunca hardcoded `localhost:4000`)

## Variáveis de ambiente

```bash
# Backend (.env)
NODE_ENV=development
PORT=4000
MONGO_URI=mongodb://localhost:27017/drop
JWT_SECRET=<min 32 chars>
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=debug
ENABLE_SOCKET_IO=true
DELIVERY_TIMEOUT_MINUTES=30

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Plano de refatoração ativo

Existe um plano em `C:\Users\00asa\.claude\plans\cozy-scribbling-cascade.md` com 6 fases:

1. **Fase 1** — Correções críticas de segurança (Socket.io JWT, transações MongoDB, URLs hardcoded)
2. **Fase 2** — Criar camada de serviços (WalletService, OrderService, CancellationService)
3. **Fase 3** — Padrões backend (catchAsync, Zod em todos endpoints, N+1 queries, paginação)
4. **Fase 4** — Memory leaks frontend (useSync factory, cleanup Socket.io, polling localStorage)
5. **Fase 5** — Refatorar componentes grandes (checkout.tsx 800 linhas, my-wallet.tsx 700 linhas)
6. **Fase 6** — TypeScript e qualidade (tipos compartilhados, ESLint, testes de serviços)

## Arquivos críticos a conhecer

| Arquivo | Por quê |
|---|---|
| `src/controllers/orderController.ts` | Controller mais complexo (~400 linhas), contém transações MongoDB |
| `src/controllers/cancellationController.ts` | Lógica de reembolso duplicada (problema conhecido) |
| `src/sockets/chat.ts` | Socket.io do chat — verificação de sala pendente |
| `frontend/hooks/useSync.ts` | 808 linhas — candidato a refatoração com factory hook |
| `frontend/pages/checkout.tsx` | 800+ linhas — precisa ser quebrado em componentes |
| `frontend/contexts/AuthContext.tsx` | Auth global — tipado com `any` (problema conhecido) |
| `frontend/components/ChatWidgetWithTabs.tsx` | Cria socket.io próprio em vez de usar SocketContext |
