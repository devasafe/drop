# ⚡ QUICK REFERENCE - DROP MARKETPLACE (2026)

**Data**: 11 de Março de 2026  
**Tipo**: Guia Rápido & Cheat Sheet  
**Objetivo**: Referência rápida para desenvolvimento

---

## 📚 Documentos Disponíveis

1. **ESTUDO_CODIGO_COMPLETO_2026.md** - Análise estrutural completa
2. **ANALISE_PADROES_ARQUITETURA_2026.md** - Padrões de design & fluxos detalhados
3. **DIAGRAMAS_VISUAIS_DETALHADOS_2026.md** - Visualizações e fluxogramas
4. **QUICK_REFERENCE_2026.md** - Este arquivo (referência rápida)

---

## 🎯 Entender o Projeto em 5 Minutos

### Qual é a ideia?
**Drop** é um marketplace de delivery tipo iFood com múltiplos papéis de usuário, carteiras digitais, planos de preço e gamificação.

### Stack?
- **Backend**: Node.js + TypeScript + Express + MongoDB + Socket.IO
- **Frontend**: Next.js 16 + React 19 + TypeScript
- **DevOps**: Docker + Docker Compose

### Como funciona?
1. Cliente compra
2. Lojista aceita
3. Motoboy entrega
4. Saldo é distribuído automaticamente para os 3 players
5. Tudo em **tempo real** via WebSocket

### Por onde começo?
1. Leia `src/app.ts` (setup express)
2. Leia `src/controllers/orderController.ts` (lógica principal)
3. Trace um pedido completo (order → delivery → wallet distribution)

---

## 🔧 Comandos Essenciais

```bash
# Setup
npm install
cp .env.example .env
npm run dev

# Build
npm run build
npm start

# Teste
npm test

# Lint
npm run lint

# Seed
npm run seed:roles

# Frontend
cd frontend && npm install && npm run dev
```

---

## 📁 Estrutura de Pastas (Resumido)

```
src/
├── app.ts                  # Express setup
├── index.ts                # Entry point
├── models/ (15)            # User, Order, Wallet, Store, etc
├── controllers/ (17)       # Lógica de negócio
├── routes/ (13+)           # Endpoints
├── middleware/             # Auth, validation, error handling
├── validation/             # Zod schemas
├── utils/                  # Helpers, walletCalculations
├── services/               # Socket.IO, notifier
└── jobs/                   # Cron jobs (deliveryTimeout)

frontend/
├── pages/                  # Next.js pages (20+)
├── components/             # Componentes reutilizáveis
├── contexts/               # AuthContext, CartContext
├── hooks/                  # useAuth, useCart, useSocket
├── lib/                    # API client, Socket.IO setup
└── styles/                 # CSS global
```

---

## 🎭 Roles (Papéis de Usuário)

| Role | Acesso | Exemplo |
|------|--------|---------|
| **CEO** | Tudo | Admin supremo |
| **Marketing** | Notificações, analytics | Anúncios |
| **Gerente Geral** | View all | Dashboard |
| **Gerente Clientes** | Support clientes | Suporte |
| **Gerente Lojistas** | Support lojistas | Suporte |
| **Gerente Motoboys** | Support motoboys | Suporte |
| **Lojista** | Produtos, pedidos da loja | Dono de pizzaria |
| **Cliente** | Comprar, pagar | Consumidor |
| **Motoboy** | Reivindicar, entregar | Entregador |

---

## 🌊 Principais Fluxos

### 1. Login
```
POST /api/auth/login {email, password}
→ jwt.sign({id, role})
→ localStorage.setItem('token')
→ Redireciona dashboard baseado em role
```

### 2. Criar Pedido
```
POST /api/orders {storeId, products}
→ Valida estoque
→ Calcula preço + distribuição
→ Débita carteira cliente
→ Socket: order:new → lojista
→ 201 {orderId, totalValue}
```

### 3. Aceitar Pedido (Lojista)
```
PUT /api/orders/:id/accept
→ Muda status: criado → pago
→ Socket: order:accepted → cliente
→ Socket: delivery:available → motoboys
```

### 4. Reivindicar Entrega (Motoboy)
```
POST /api/deliveries/:id/claim
→ Associa motoboyId
→ Inicia timeout job (30 min)
→ Socket: delivery:claimed → cliente
```

### 5. Finalizar Entrega (Motoboy)
```
POST /api/deliveries/:id/finalizar {pin}
→ Valida PIN
→ Distribui saldo:
   - Loja +storeAmount
   - CEO +ceoAmount
   - Motoboy +deliveryFee
→ Adiciona pontos gamificação
→ Socket broadcast (todos)
```

---

## 💾 Models Principais

### User
```typescript
{
  _id: ObjectId,
  name: string,
  email: string (unique),
  roles: ['cliente', 'lojista'], // múltiplos
  activeRole: 'lojista',          // ativo agora
  storeId?: ObjectId,             // se lojista
  bankInfo?: string,              // criptografado
  addresses: IUserAddress[]
}
```

### Order
```typescript
{
  _id: ObjectId,
  customerId: ObjectId,
  storeId: ObjectId,
  products: [{productId, quantity, price}],
  totalValue: number,
  status: 'criado' | 'pago' | 'aguardando_motoboy' | 'enviado' | 'entregue' | 'cancelado',
  walletDistribution: {storeAmount, ceoAmount},
  deliveryId?: ObjectId,
  createdAt: Date
}
```

### Wallet
```typescript
{
  _id: ObjectId,
  owner: string,              // userId, storeId, 'platform'
  ownerType: 'user' | 'store' | 'platform' | 'motoboy',
  balance: number,
  totalIncome: number,
  totalSpent: number,
  history: [{date, type, category, amount, reason, relatedId}],
  createdAt: Date
}
```

### Delivery
```typescript
{
  _id: ObjectId,
  orderId: ObjectId,
  storeId: ObjectId,
  customerId: ObjectId,
  motoboyId?: ObjectId,       // quem reivindicou
  status: 'pendente' | 'coletada' | 'saiu' | 'entregue',
  pickupLocation: {lat, lng},
  deliveryLocation: {lat, lng},
  pin: string,                // PIN de confirmação
  claimedAt?: Date,
  completedAt?: Date,
  createdAt: Date
}
```

---

## 🔌 API Endpoints (Resumido)

### Auth
```
POST   /api/auth/register      Criar usuário
POST   /api/auth/login         Autenticar
POST   /api/auth/switch-role   Trocar role ativo
GET    /api/auth/profile       Perfil logado
```

### Orders
```
POST   /api/orders             Criar pedido
GET    /api/orders             Listar pedidos
GET    /api/orders/:id         Detalhes
PUT    /api/orders/:id/accept  Aceitar (lojista)
PUT    /api/orders/:id/cancel  Cancelar (cliente)
```

### Deliveries
```
POST   /api/deliveries/:id/claim        Reivindicar
PUT    /api/deliveries/:id/status       Atualizar status
POST   /api/deliveries/:id/finalizar    Finalizar com PIN
GET    /api/deliveries/available        Disponíveis
```

### Wallets
```
GET    /api/wallets/:userId             Saldo usuário
GET    /api/wallets/my-wallet           Minha carteira
POST   /api/wallets/:userId/credit      Carregar saldo
POST   /api/wallets/:userId/transfer    Transferir
POST   /api/wallets/:userId/withdraw    Sacar
GET    /api/wallets/:userId/history     Histórico
```

### Products
```
POST   /api/products           Criar produto
GET    /api/products           Listar (com filtros)
GET    /api/products/:id       Detalhes
PUT    /api/products/:id       Atualizar
DELETE /api/products/:id       Deletar
```

### Admin (CEO only)
```
GET    /api/admin/users                 Listar usuários
PUT    /api/admin/users/:id/role        Mudar role
GET    /api/admin/metrics/platform      Métricas globais
```

---

## 🔐 Middleware Essencial

```typescript
// Autenticação
const { authenticate } = require('./middleware/auth')
// Verifica JWT, popula req.user

// Autorização
const { authorizeRoles } = require('./middleware/auth')
router.post('/...', authenticate, authorizeRoles('lojista'), handler)

// Validação
const { validate } = require('./middleware/validate')
router.post('/...', validate(schema), handler)

// Taxa de requisição
const rateLimit = require('express-rate-limit')
const limiter = rateLimit({windowMs: 15*60*1000, max: 5})
app.use('/api/auth', limiter)
```

---

## ⚠️ Problemas Comuns & Soluções

### Problema: "No token provided"
**Causa**: JWT não enviado no header
**Solução**: 
```javascript
api.defaults.headers.common['Authorization'] = `Bearer ${token}`
```

### Problema: "CORS policy error"
**Causa**: Origem não está na whitelist
**Solução**: Adicionar em `.env` → `CORS_ORIGIN`

### Problema: "Estoque insuficiente"
**Causa**: Validação falhou
**Solução**: Checar `/api/products/:id` antes de criar pedido

### Problema: Socket não conecta
**Causa**: URL incorreta ou server não iniciado
**Solução**: Verificar `io(process.env.NEXT_PUBLIC_API_URL)`

### Problema: Motoboy timeout não funciona
**Causa**: Job não foi iniciado
**Solução**: Verificar `src/index.ts` → `startDeliveryTimeoutJob()`

---

## 📊 Wallet Distribution Exemplo

```
Preço: 100 BRL
Taxa entrega: 10 BRL
Total: 110 BRL

Plano 1 (CEO = 15%):
├─ Cliente paga: -110 BRL
├─ Loja recebe: +93.50 BRL
├─ CEO recebe: +16.50 BRL
└─ Motoboy recebe: +10 BRL

Plano 2 (CEO = 20%):
├─ Cliente paga: -110 BRL
├─ Loja recebe: +88 BRL
├─ CEO recebe: +22 BRL
└─ Motoboy recebe: +10 BRL
```

---

## 🔄 Socket.IO Events

```
Cliente → Backend
  'join-user' {userId}

Backend → Lojista
  'order:new' {orderId, customerId, products}

Backend → Cliente
  'order:accepted' {orderId}
  'delivery:on-the-way' {location, eta}
  'delivery:completed' {orderId}

Backend → Motoboy
  'delivery:available' {location, fee}
  'delivery:claimed' {accepted}

Backend → Dashboard
  'wallet:updated' {balance, history}
```

---

## 🧪 Testando Manualmente

### Com cURL
```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"123456"}'

# Criar pedido
curl -X POST http://localhost:3001/api/orders \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storeId":"...",
    "products":[{"productId":"...","quantity":1}]
  }'
```

### Com Postman
1. Importar `postman_collection.json`
2. Configurar token em `Authorization` → `Bearer Token`
3. Executar requests

### Com Insomnia
Mesmo que Postman, importar collection

---

## 🚀 Deploy Checklist

- [ ] Variáveis de ambiente configuradas
- [ ] MongoDB conectado
- [ ] JWT_SECRET setado (longo e aleatório)
- [ ] CORS_ORIGIN correto
- [ ] Rate limiting ativado
- [ ] Logging funcionando
- [ ] Socket.IO inicializado
- [ ] Jobs agendados (deliveryTimeout)
- [ ] Backup do DB configurado
- [ ] Monitoramento (Sentry/DataDog)
- [ ] HTTPS/SSL configurado
- [ ] CDN para uploads (S3/CloudFront)

---

## 📞 Onde Encontrar Coisas

| Procuro por... | Arquivo |
|---|---|
| Autenticação | `src/controllers/authController.ts` |
| Criação de pedido | `src/controllers/orderController.ts` |
| Distribuição de wallet | `src/utils/walletCalculations.ts` |
| Socket.IO | `src/services/notifier.ts` |
| Validação | `src/validation/schemas.ts` |
| Roles e permissões | `src/models/User.ts` |
| Timeout job | `src/jobs/deliveryTimeout.job.ts` |
| Setup Express | `src/app.ts` |
| Frontend auth | `frontend/contexts/AuthContext.tsx` |
| Frontend checkout | `frontend/pages/checkout.tsx` |

---

## 🎓 Próximos Passos para Desenvolvimento

### Implementar Features
- [ ] Chat entre cliente e lojista
- [ ] Avaliações e reviews
- [ ] Cupons e promoções
- [ ] Integração com gateway de pagamento real
- [ ] Upload de imagens em S3
- [ ] Dark mode
- [ ] Geolocalização real-time
- [ ] PWA/Offline mode

### Melhorias de Código
- [ ] Adicionar testes unitários (Jest)
- [ ] Testes de integração (Supertest)
- [ ] Testes E2E (Cypress)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Database migrations
- [ ] Soft delete para modelos
- [ ] Auditoria (quem/quando modificou)
- [ ] Criptografia E2E

### DevOps
- [ ] Staging environment
- [ ] Health checks
- [ ] Load balancing
- [ ] Redis para cache
- [ ] Backup automático
- [ ] Monitoramento com Sentry
- [ ] APM com DataDog
- [ ] Docker compose para local dev

---

## 💡 Dicas Importantes

1. **Sempre valide input** com Zod antes de processar
2. **Use socket.io para notificações** em tempo real
3. **Cache de permissões** para não bater no DB toda hora
4. **Rate limit em endpoints críticos** (auth, orders, payments)
5. **Encrypt dados sensíveis** (bankInfo)
6. **Sempre use JWT no header** `Authorization: Bearer token`
7. **Teste socket.io** com insomnia/postman WebSocket tab
8. **Verifique índices MongoDB** para performance
9. **Use paginação** em listas grandes
10. **Log tudo** com Winston para debug

---

## 🎯 Fluxo de Desenvolvimento Recomendado

1. **Entender** o modelo de dados (models/)
2. **Estudar** um controller completo (authController)
3. **Traçar** um fluxo completo (order → delivery)
4. **Implementar** nova feature seguindo padrão existente
5. **Testar** com cURL/Postman
6. **Documentar** mudanças
7. **Fazer commit** com descrição clara

---

## 📖 Documentação Externa Útil

- [Express.js docs](https://expressjs.com)
- [MongoDB docs](https://docs.mongodb.com)
- [Socket.IO docs](https://socket.io/docs)
- [Zod docs](https://zod.dev)
- [Next.js docs](https://nextjs.org/docs)
- [TypeScript docs](https://www.typescriptlang.org)

---

**Última atualização**: 11 de Março de 2026  
**Versão**: 1.0  
**Status**: ✅ Completo

Para análise completa, veja: **ESTUDO_CODIGO_COMPLETO_2026.md**
