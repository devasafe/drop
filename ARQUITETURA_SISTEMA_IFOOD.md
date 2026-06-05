# Arquitetura de um Sistema Tipo iFood - Guia Completo

## 📋 Sumário
1. [Princípios Fundamentais](#princípios-fundamentais)
2. [Arquitetura de Alto Nível](#arquitetura-de-alto-nível)
3. [Padrões de Design](#padrões-de-design)
4. [Estrutura de Camadas](#estrutura-de-camadas)
5. [Componentes Essenciais](#componentes-essenciais)
6. [Boas Práticas](#boas-práticas)
7. [Segurança](#segurança)
8. [Performance](#performance)
9. [Escalabilidade](#escalabilidade)
10. [Monitoramento e Observabilidade](#monitoramento-e-observabilidade)

---

## 🎯 Princípios Fundamentais

### 1. **Separação de Responsabilidades (SRP)**
- Cada componente deve ter uma única responsabilidade
- Facilita manutenção, testes e evolução do código
- Exemplo: Controller não acessa banco de dados direto, usa Service

### 2. **DRY (Don't Repeat Yourself)**
- Eliminar duplicação de código
- Reutilizar componentes, funções e serviços
- Centralizar lógica comum em utilitários

### 3. **KISS (Keep It Simple, Stupid)**
- Simplicidade é chave
- Evitar over-engineering
- Código legível é melhor que código "inteligente"

### 4. **SOLID**
- **S**: Single Responsibility - uma classe, uma responsabilidade
- **O**: Open/Closed - aberto para extensão, fechado para modificação
- **L**: Liskov Substitution - substituição sem quebrar o código
- **I**: Interface Segregation - interfaces específicas, não genéricas
- **D**: Dependency Inversion - depender de abstrações, não de implementações

---

## 🏗️ Arquitetura de Alto Nível

### Visão Geral do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER (Frontend)                   │
│  ┌──────────────┬──────────────┬──────────────────────────┐ │
│  │  Customer    │  Store/      │     Delivery Driver      │ │
│  │  App (Mobile)│  Admin App   │     App (Motoboy)       │ │
│  └──────┬───────┴───────┬──────┴─────────────┬───────────┘ │
└─────────┼────────────────┼────────────────────┼──────────────┘
          │                │                    │
    ┌─────▼─────────────────▼────────────────────▼─────────┐
    │          API GATEWAY / LOAD BALANCER               │
    └─────┬──────────────────────────────────────────────┘
          │
    ┌─────▼──────────────────────────────────────────────┐
    │            MICROSERVICES / BACKEND                 │
    │  ┌──────────────────────────────────────────────┐  │
    │  │  Auth Service    │ Order Service            │  │
    │  │  User Service    │ Payment Service          │  │
    │  │  Product Service │ Delivery Service         │  │
    │  │  Store Service   │ Notification Service     │  │
    │  │  Rating Service  │ Real-time Service (WS)   │  │
    │  └──────────────────────────────────────────────┘  │
    └─────┬──────────────────────────────────────────────┘
          │
    ┌─────┼──────────────────────────────────────────────┐
    │     │        DATA LAYER                            │
    │  ┌──▼────┐  ┌────────┐  ┌─────────┐  ┌────────┐  │
    │  │ Primary│  │ Cache  │  │  Queue  │  │Storage │  │
    │  │   DB   │  │ Redis  │  │ RabbitMQ  │ S3      │  │
    │  └────────┘  └────────┘  └─────────┘  └────────┘  │
    └────────────────────────────────────────────────────┘
```

---

## 🎨 Padrões de Design

### 1. **MVC (Model-View-Controller)**
```
┌─────────────┐
│   Model     │  ← Dados e lógica de negócio
└─────────────┘
     ▲
     │
┌─────────────┐      ┌─────────────┐
│  Controller │ ───▶ │    View     │
└─────────────┘      └─────────────┘
  ▲                       │
  │                       │
  └───────────────────────┘
```

### 2. **Repository Pattern**
- Abstração do acesso aos dados
- Facilita testes (mock do repositório)
- Permite trocar banco de dados sem afetar o resto do código

```typescript
interface UserRepository {
  findById(id: string): Promise<User>;
  save(user: User): Promise<User>;
  delete(id: string): Promise<void>;
}

class UserRepositoryImpl implements UserRepository {
  // Implementação específica do banco
}
```

### 3. **Service Layer Pattern**
- Contém lógica de negócio
- Independente de framework ou banco de dados
- Reutilizável por múltiplos controllers/endpoints

```typescript
class OrderService {
  constructor(
    private orderRepository: OrderRepository,
    private paymentService: PaymentService,
    private notificationService: NotificationService
  ) {}

  async createOrder(data: CreateOrderDTO): Promise<Order> {
    // Lógica de negócio
  }
}
```

### 4. **DTO (Data Transfer Object)**
- Transferência segura de dados entre camadas
- Validação de entrada
- Evita expor entidades do banco diretamente

```typescript
class CreateOrderDTO {
  customerId: string;
  storeId: string;
  items: OrderItemDTO[];
  deliveryAddress: AddressDTO;
}
```

### 5. **Strategy Pattern**
- Encapsular diferentes estratégias de algoritmos
- Exemplo: diferentes formas de pagamento, cálculo de entrega

```typescript
interface PaymentStrategy {
  pay(amount: number): Promise<boolean>;
}

class CreditCardPayment implements PaymentStrategy {
  async pay(amount: number): Promise<boolean> { }
}

class PixPayment implements PaymentStrategy {
  async pay(amount: number): Promise<boolean> { }
}
```

### 6. **Observer Pattern**
- Para eventos em tempo real
- Exemplo: notificações, atualizações ao vivo

```typescript
class OrderEventEmitter extends EventEmitter {
  orderCreated(order: Order) {
    this.emit('order:created', order);
  }
}

// Listeners
orderEventEmitter.on('order:created', (order) => {
  notificationService.notifyStore(order);
  analyticsService.trackOrder(order);
});
```

### 7. **Factory Pattern**
- Criar instâncias de objetos complexos
- Exemplo: criar diferentes tipos de notificações

```typescript
class NotificationFactory {
  static create(type: 'email' | 'sms' | 'push'): Notification {
    switch(type) {
      case 'email': return new EmailNotification();
      case 'sms': return new SMSNotification();
      case 'push': return new PushNotification();
    }
  }
}
```

### 8. **Middleware Pattern**
- Processamento de requisições
- Autenticação, validação, logging, CORS

```typescript
app.use(authMiddleware);
app.use(validationMiddleware);
app.use(loggingMiddleware);
```

---

## 📚 Estrutura de Camadas

### Organização Recomendada

```
src/
├── controllers/          # Recebem requisições HTTP
│   ├── orderController.ts
│   ├── userController.ts
│   └── authController.ts
│
├── services/             # Lógica de negócio
│   ├── orderService.ts
│   ├── paymentService.ts
│   ├── deliveryService.ts
│   └── notificationService.ts
│
├── repositories/         # Acesso aos dados
│   ├── orderRepository.ts
│   ├── userRepository.ts
│   └── productRepository.ts
│
├── models/              # Entidades do banco
│   ├── Order.ts
│   ├── User.ts
│   ├── Product.ts
│   └── Store.ts
│
├── dtos/                # Data Transfer Objects
│   ├── CreateOrderDTO.ts
│   ├── UpdateUserDTO.ts
│   └── CreateProductDTO.ts
│
├── middleware/          # Middlewares Express
│   ├── authMiddleware.ts
│   ├── validationMiddleware.ts
│   ├── errorHandler.ts
│   └── logger.ts
│
├── routes/              # Definição de rotas
│   ├── orderRoutes.ts
│   ├── userRoutes.ts
│   ├── authRoutes.ts
│   └── index.ts
│
├── utils/               # Funções utilitárias
│   ├── validators.ts
│   ├── helpers.ts
│   ├── constants.ts
│   └── errors.ts
│
├── config/              # Configurações
│   ├── database.ts
│   ├── env.ts
│   └── redis.ts
│
├── websocket/           # WebSocket em tempo real
│   ├── socketManager.ts
│   └── socketHandlers.ts
│
├── events/              # Event emitters
│   ├── orderEvents.ts
│   └── userEvents.ts
│
├── jobs/                # Tasks assíncronas
│   ├── sendNotifications.ts
│   └── updateDeliveryStatus.ts
│
├── types/               # TypeScript types
│   ├── index.ts
│   └── domain.ts
│
├── database/            # Migrations, seeders
│   ├── migrations/
│   ├── seeders/
│   └── schema.ts
│
├── tests/               # Testes
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── index.ts             # Arquivo principal
```

---

## 🔧 Componentes Essenciais

### 1. **API Gateway**
```typescript
// Express com rate limiting, validação, autenticação
app.use(cors());
app.use(express.json());
app.use(rateLimiter);
app.use(authMiddleware);

app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
```

### 2. **Autenticação e Autorização**
```typescript
// JWT + Roles
interface AuthToken {
  userId: string;
  role: 'customer' | 'store' | 'driver' | 'admin';
  exp: number;
}

// Middleware de verificação
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = decoded;
  next();
}
```

### 3. **Banco de Dados**
```typescript
// Usar ORM (TypeORM, Prisma, Sequelize)
@Entity()
class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  customer: User;

  @ManyToOne(() => Store)
  store: Store;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @CreateDateColumn()
  createdAt: Date;
}
```

### 4. **Cache (Redis)**
```typescript
class OrderService {
  constructor(private cache: Redis, private repo: OrderRepository) {}

  async getOrder(id: string): Promise<Order> {
    // Tentar cache primeiro
    const cached = await this.cache.get(`order:${id}`);
    if (cached) return JSON.parse(cached);

    // Se não existir, buscar do BD
    const order = await this.repo.findById(id);
    
    // Guardar em cache por 1 hora
    await this.cache.setex(`order:${id}`, 3600, JSON.stringify(order));
    
    return order;
  }
}
```

### 5. **Fila de Mensagens (RabbitMQ/Redis)**
```typescript
// Enviar eventos assíncronos
async createOrder(data: CreateOrderDTO) {
  const order = await this.orderRepository.save(orderEntity);
  
  // Publicar evento
  await this.messageQueue.publish('order.created', {
    orderId: order.id,
    storeId: order.storeId
  });

  return order;
}

// Consumidor
messageQueue.subscribe('order.created', async (message) => {
  await this.notificationService.notifyStore(message.orderId);
  await this.deliveryService.assignDelivery(message.orderId);
});
```

### 6. **WebSocket em Tempo Real**
```typescript
// Socket.IO para atualizações ao vivo
io.on('connection', (socket) => {
  socket.on('order:join', (orderId) => {
    socket.join(`order:${orderId}`);
  });

  socket.on('order:update', (data) => {
    io.to(`order:${data.orderId}`).emit('status:changed', {
      status: data.newStatus,
      timestamp: new Date()
    });
  });
});
```

### 7. **Validação de Dados**
```typescript
// Usar librarias como: Joi, Yup, class-validator
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

class CreateUserDTO {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsNotEmpty()
  name: string;
}

// No middleware
async function validateDTO(req, res, next) {
  const errors = await validate(plainToInstance(CreateUserDTO, req.body));
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  next();
}
```

### 8. **Tratamento de Erros**
```typescript
// Classe customizada de erro
class ApplicationError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code: string
  ) {
    super(message);
  }
}

// Middleware global
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    error: {
      code: err.code,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});
```

---

## ✅ Boas Práticas

### 1. **Versionamento de API**
```
/api/v1/orders
/api/v2/orders  ← Com melhorias
```

### 2. **Logging Estruturado**
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

logger.info('Order created', { orderId, customerId });
```

### 3. **Variáveis de Ambiente**
```
.env
DATABASE_URL=postgresql://user:pass@localhost/dbname
JWT_SECRET=sua_chave_secreta
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

### 4. **Documentação da API**
```typescript
// Swagger/OpenAPI
/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Criar novo pedido
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderDTO'
 *     responses:
 *       201:
 *         description: Pedido criado com sucesso
 */
router.post('/orders', createOrder);
```

### 5. **Testes Automatizados**
```typescript
// Unit test
describe('OrderService', () => {
  it('should create order with valid data', async () => {
    const service = new OrderService(mockRepository);
    const order = await service.createOrder(validData);
    expect(order.id).toBeDefined();
  });
});

// Integration test
describe('POST /api/orders', () => {
  it('should return 201 when creating order', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send(orderData)
      .expect(201);
    expect(res.body.id).toBeDefined();
  });
});
```

### 6. **Dependency Injection**
```typescript
// Usar library: InversifyJS, Awilix, TSyringe
class OrderService {
  constructor(
    @Inject('OrderRepository') private orderRepo: OrderRepository,
    @Inject('PaymentService') private paymentService: PaymentService
  ) {}
}

// Configurar container
const container = new Container();
container.bind<OrderRepository>('OrderRepository').to(OrderRepositoryImpl);
container.bind<PaymentService>('PaymentService').to(PaymentService);
```

---

## 🔐 Segurança

### 1. **Validação de Entrada**
```typescript
// Sempre validar dados de entrada
const schema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required()
});

const { error, value } = schema.validate(req.body);
if (error) return res.status(400).json({ error: error.details });
```

### 2. **Criptografia de Senhas**
```typescript
import bcrypt from 'bcrypt';

const hashedPassword = await bcrypt.hash(password, 10);

// Verificar
const isValid = await bcrypt.compare(password, hashedPassword);
```

### 3. **HTTPS Obrigatório**
```typescript
// Redirecionar HTTP para HTTPS em produção
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}
```

### 4. **CORS Seguro**
```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 5. **Rate Limiting**
```typescript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // limite de 100 requisições por IP
});

app.use('/api/', limiter);
```

### 6. **SQL Injection Prevention**
```typescript
// Usar prepared statements (ORM já faz isso)
// ❌ EVITAR
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ USAR
const user = await userRepository.findByEmail(email);
```

### 7. **CSRF Protection**
```typescript
const csrf = require('csurf');
app.use(csrf({ cookie: true }));
```

### 8. **Secrets Management**
```typescript
// Nunca commit de .env na produção
// Usar: AWS Secrets Manager, HashiCorp Vault, Azure Key Vault
const secret = await vault.getSecret('jwt_secret');
```

---

## ⚡ Performance

### 1. **Indexação no Banco de Dados**
```typescript
@Entity()
class Order {
  @PrimaryGeneratedColumn()
  id: string;

  @Index()
  @Column()
  customerId: string;

  @Index()
  @Column()
  storeId: string;

  @Index()
  @Column()
  status: string;
}
```

### 2. **Paginação**
```typescript
// Sempre paginar resultados grandes
async getOrders(page: number = 1, limit: number = 10) {
  const skip = (page - 1) * limit;
  const [data, total] = await this.repo.findAndCount({
    skip,
    take: limit,
    order: { createdAt: 'DESC' }
  });
  
  return {
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}
```

### 3. **Lazy Loading e Eager Loading**
```typescript
// Eager Loading - carregar relacionamentos
const order = await this.orderRepository.findOne({
  where: { id },
  relations: ['customer', 'items', 'store']
});

// Lazy Loading - carregar sob demanda
const items = await order.items; // Carrega apenas quando acessado
```

### 4. **Compress Responses**
```typescript
import compression from 'compression';
app.use(compression());
```

### 5. **Caching Estratégico**
- Cache de dados que mudam pouco (categorias, configurações)
- TTL adequado para cada tipo de dado
- Invalidação inteligente de cache

### 6. **Query Optimization**
```typescript
// Usar SELECT específico, não SELECT *
const orders = await this.repo
  .createQueryBuilder('order')
  .select(['order.id', 'order.status', 'order.totalAmount'])
  .where('order.customerId = :customerId', { customerId })
  .getMany();
```

### 7. **Connection Pooling**
```typescript
const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  poolSize: 10,
  maxConnections: 20
});
```

### 8. **CDN para Arquivos Estáticos**
```
Frontend, imagens, vídeos → AWS CloudFront / Cloudflare
```

---

## 📈 Escalabilidade

### 1. **Microserviços**
```
Backend único → Dividir em serviços independentes:
- Auth Service
- Order Service
- Payment Service
- Delivery Service
- Notification Service
- Review Service
```

### 2. **Load Balancing**
```
Cliente → Load Balancer (Nginx, HAProxy) → [Server 1, Server 2, Server 3]
```

### 3. **Database Replication**
```
Master DB → Replication → Replica DB (Read-only)
```

### 4. **Message Queues**
```
Producer (API) → RabbitMQ → Consumer (Service Workers)
Desacopla serviços e permite processamento assíncronamente
```

### 5. **Containerização (Docker)**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 6. **Orquestração (Kubernetes)**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: order-service
        image: myregistry/order-service:1.0
        ports:
        - containerPort: 3000
```

### 7. **Auto-scaling**
```
CPU > 70% → Adicionar instâncias
CPU < 30% → Remover instâncias
```

---

## 📊 Monitoramento e Observabilidade

### 1. **Health Checks**
```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    database: 'connected',
    redis: 'connected'
  });
});
```

### 2. **Logging Centralizado**
```
Application Logs → ELK Stack (Elasticsearch, Logstash, Kibana)
               → Splunk
               → DataDog
               → CloudWatch
```

### 3. **Distributed Tracing**
```typescript
// Usar Jaeger, Zipkin
const span = tracer.startSpan('order:create');
// ... operações ...
span.finish();
```

### 4. **Métricas**
```typescript
// Usar Prometheus
const orderCounter = new Counter({
  name: 'orders_created_total',
  help: 'Total de pedidos criados'
});

orderCounter.inc();
```

### 5. **Alertas**
```
- Taxa de erro > 5% → Alert
- Latência > 1s → Alert
- Memória > 80% → Alert
```

### 6. **APM (Application Performance Monitoring)**
```
New Relic, DataDog, Dynatrace
Monitoram automáticamente performance e identificam gargalos
```

---

## 📋 Checklist de Uma Boa Arquitetura

- [ ] Separação clara de responsabilidades (Controllers, Services, Repositories)
- [ ] DTOs para transferência de dados
- [ ] Validação de entrada robusta
- [ ] Tratamento de erros global e consistente
- [ ] Autenticação e autorização implementadas
- [ ] Banco de dados com índices apropriados
- [ ] Cache estratégico (Redis)
- [ ] Filas de mensagens para operações assíncronas
- [ ] WebSocket para tempo real
- [ ] Testes (Unit, Integration, E2E)
- [ ] Documentação da API (Swagger)
- [ ] Logging estruturado
- [ ] Variáveis de ambiente configuradas
- [ ] CORS e segurança configurados
- [ ] Rate limiting implementado
- [ ] Versionamento de API
- [ ] CI/CD pipeline
- [ ] Docker e containerização
- [ ] Monitoring e alertas
- [ ] Disaster recovery plan

---

## 🚀 Stack Recomendado para iFood-like

### Backend
- **Runtime**: Node.js com TypeScript
- **Framework**: Express.js / NestJS
- **Database**: PostgreSQL + MongoDB
- **Cache**: Redis
- **Queue**: RabbitMQ / Redis Streams
- **Real-time**: Socket.IO
- **API Docs**: Swagger/OpenAPI
- **Testing**: Jest + Supertest

### Frontend
- **Mobile**: React Native / Flutter
- **Web Admin**: React / Next.js / Vue.js
- **Package Manager**: npm / yarn

### DevOps
- **Containerization**: Docker
- **Orchestration**: Kubernetes
- **CI/CD**: GitHub Actions / Jenkins / GitLab CI
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack / Datadog
- **APM**: New Relic / Datadog

---

## 📚 Referências e Leitura Complementar

1. **Design Patterns**: Gang of Four - Design Patterns
2. **Architecture**: Clean Architecture - Robert C. Martin
3. **Microservices**: Building Microservices - Sam Newman
4. **Database**: High Performance MySQL - Baron Schwartz
5. **Testing**: Test Driven Development - Kent Beck
6. **DevOps**: The Phoenix Project - Gene Kim

---

**Criado em**: Fevereiro 28, 2026
**Versão**: 1.0
**Autor**: Arquitetura de Sistemas
