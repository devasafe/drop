# 🔬 ANÁLISE DETALHADA DE PADRÕES & ARQUITETURA

**Documento**: Análise Técnica Aprofundada  
**Data**: 11 de Março de 2026  
**Foco**: Padrões de Design, Fluxos e Integração

---

## 📚 ÍNDICE

1. [Padrões de Código](#padrões-de-código)
2. [Fluxos Detalhados](#fluxos-detalhados)
3. [Integração Backend-Frontend](#integração-backend-frontend)
4. [Exemplo Real: Pedido Completo](#exemplo-real-pedido-completo)
5. [Tratamento de Erros](#tratamento-de-erros)
6. [Performance & Otimizações](#performance--otimizações)
7. [Segurança Deep Dive](#segurança-deep-dive)
8. [Testing Strategy](#testing-strategy)

---

## 🎯 Padrões de Código

### 1. MVC Pattern

```typescript
// ROUTES (recebem requisição HTTP)
router.post('/orders', authenticate, validate(schema), createOrder)

// CONTROLLER (orquestra lógica)
export const createOrder = async (req: Request, res: Response) => {
  // 1. Extrair dados
  const { storeId, products } = req.body
  const customerId = req.user.id
  
  // 2. Chamar serviço
  const order = await orderService.create({customerId, storeId, products})
  
  // 3. Retornar resposta
  return res.json({orderId: order._id})
}

// SERVICE (regra de negócio)
export class OrderService {
  async create(data) {
    // Validar estoque
    // Calcular preço
    // Distribuir wallet
    // Salvar no DB
  }
}

// MODEL (acesso a dados)
const order = await Order.create({...})
```

### 2. Middleware Chain

```typescript
// Estrutura de pipeline
app.use(cors())
app.use(express.json())
app.use(rateLimit)
app.use(logging)

router.post(
  '/orders',
  authenticate,           // 1. Valida JWT
  validate(schema),       // 2. Valida dados
  authorizeRoles('cliente'), // 3. Valida permissão
  createOrder             // 4. Executa controller
)
```

### 3. Error Handling Pattern

```typescript
// Classe personalizada
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message)
  }
}

// Uso em controller
export const getOrder = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id)
    
    // Validação
    if (!order) {
      throw new AppError(404, 'Pedido não encontrado', 'ORDER_NOT_FOUND')
    }
    
    // Autorização
    if (order.customerId !== req.user.id) {
      throw new AppError(403, 'Acesso negado', 'FORBIDDEN')
    }
    
    res.json(order)
  } catch (error) {
    next(error) // Passa para errorHandler
  }
}

// Middleware global
export const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code
    })
  }
  
  // Erro desconhecido
  logger.error('Unexpected error', err)
  res.status(500).json({
    error: 'Erro interno do servidor'
  })
}
```

### 4. Validação com Zod

```typescript
// Define schema reusável
const CreateOrderSchema = z.object({
  storeId: z.string().min(1, 'Store ID é obrigatório'),
  products: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().min(1, 'Quantity >= 1')
    })
  ).min(1, 'Pelo menos 1 produto'),
  deliveryAddress: z.object({
    street: z.string(),
    number: z.string(),
    city: z.string()
  }),
  paymentMethod: z.enum(['wallet', 'credit_card', 'pix'])
})

// Middleware reutilizável
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.body)
      req.validatedBody = validated
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: 'Validação falhou',
          details: err.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }
      next(err)
    }
  }
}

// Uso simplificado
router.post('/', validate(CreateOrderSchema), createOrder)
```

### 5. Permission-Based Access Control

```typescript
// Models
interface IUser {
  roles: Role[]        // Múltiplos roles
  activeRole: Role     // Role ativo agora
  permissions?: string[] // Cache de permissões
}

// Middleware
export const authorizePermission = (permission: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = await User.findById(req.user.id)
      
      if (!user?.permissions?.includes(permission)) {
        return res.status(403).json({
          error: 'Permissão insuficiente',
          required: permission,
          current: user?.permissions
        })
      }
      
      next()
    } catch (err) {
      next(err)
    }
  }
}

// Uso em rotas
router.post(
  '/admin/users/:id/ban',
  authenticate,
  authorizePermission('user:ban'),
  banUser
)
```

### 6. Service Locator / Dependency Injection

```typescript
// Simples: Importar diretos
import User from '../models/User'
import Wallet from '../models/Wallet'

export class OrderService {
  async create(data) {
    const user = await User.findById(data.customerId)
    const wallet = await Wallet.findOne({owner: data.customerId})
  }
}

// Melhor: Injetar dependências
export class OrderService {
  constructor(
    private userModel: typeof User,
    private walletModel: typeof Wallet
  ) {}
  
  async create(data) {
    const user = await this.userModel.findById(data.customerId)
  }
}

// Instanciar com deps
const orderService = new OrderService(User, Wallet)
```

---

## 🔄 Fluxos Detalhados

### Fluxo 1: Login e Autenticação

```
PASSO 1: Cliente submete credenciais
┌─────────────────────────────────┐
│  Frontend: login.tsx            │
├─────────────────────────────────┤
│ const {email, password} = form   │
│ const res = await api.post(      │
│   '/auth/login',                 │
│   {email, password}              │
│ )                               │
└────────────┬────────────────────┘
             │ POST /api/auth/login
             │ {email: "user@example.com", password: "123456"}
             ▼
PASSO 2: Backend valida credenciais
┌────────────────────────────────────────┐
│  Backend: authController.login()        │
├────────────────────────────────────────┤
│ const {email, password} = req.body      │
│ const user = await User.findOne({email})│
│                                         │
│ if (!user) {                            │
│   throw new AppError(401, 'Invalid')    │
│ }                                       │
│                                         │
│ const isValid = await bcrypt.compare(   │
│   password,                             │
│   user.passwordHash                     │
│ )                                       │
│                                         │
│ if (!isValid) {                         │
│   throw new AppError(401, 'Invalid')    │
│ }                                       │
│                                         │
│ const token = jwt.sign(                 │
│   {id: user._id, role: user.activeRole},│
│   process.env.JWT_SECRET                │
│ )                                       │
│                                         │
│ res.json({                              │
│   token,                                │
│   user: {id, name, email, activeRole}   │
│ })                                      │
└────────────┬─────────────────────────────┘
             │ 200 OK
             │ {token: "eyJhbGc...", user: {...}}
             ▼
PASSO 3: Frontend salva token
┌──────────────────────────────────┐
│  Frontend: AuthContext.tsx       │
├──────────────────────────────────┤
│ setAuthState({                   │
│   token: res.token,              │
│   user: res.user                 │
│ })                               │
│                                  │
│ localStorage.setItem(            │
│   'auth_token',                  │
│   res.token                       │
│ )                                │
│                                  │
│ // Configura header padrão       │
│ api.defaults.headers.common[      │
│   'Authorization'                │
│ ] = `Bearer ${res.token}`        │
│                                  │
│ // Redireciona dashboard         │
│ router.push('/dashboard')        │
└──────────────────────────────────┘

VALIDAÇÃO CONTÍNUA:
┌────────────────────────────────────┐
│  Requisições subsequentes:          │
├────────────────────────────────────┤
│ GET /api/orders                     │
│ Headers: {                          │
│   Authorization: "Bearer eyJhbGc..."│
│ }                                   │
└────────────┬────────────────────────┘
             │
             ▼
┌────────────────────────────────────┐
│  Backend: authenticate middleware   │
├────────────────────────────────────┤
│ const token = req.headers.           │
│   authorization.split(' ')[1]       │
│                                     │
│ const decoded = jwt.verify(         │
│   token,                            │
│   process.env.JWT_SECRET            │
│ )                                   │
│                                     │
│ req.user = decoded                  │
│ next() // Continua para controller  │
└────────────────────────────────────┘
```

### Fluxo 2: Criação de Pedido com Transação

```
PASSO 1: Frontend prepara dados
┌─────────────────────────────────┐
│  checkout.tsx                   │
├─────────────────────────────────┤
│ const orderData = {             │
│   storeId: store._id,           │
│   products: [                   │
│     {productId: "...", qty: 2}  │
│   ],                            │
│   deliveryAddress: {...},       │
│   paymentMethod: 'wallet'       │
│ }                               │
│                                 │
│ const res = await api.post(     │
│   '/api/orders',                │
│   orderData                     │
│ )                               │
└────────────┬────────────────────┘
             │ POST /api/orders
             ▼
PASSO 2: Validação
┌────────────────────────────────┐
│  validate middleware            │
├────────────────────────────────┤
│ const schema = z.object({       │
│   storeId: z.string(),          │
│   products: z.array(...),       │
│   ...                           │
│ })                              │
│                                 │
│ const validated =               │
│   schema.parse(req.body)        │
│                                 │
│ req.validatedBody = validated   │
│ next()                          │
└────────────┬────────────────────┘
             │
             ▼
PASSO 3: Autenticação
┌────────────────────────────────┐
│  authenticate middleware        │
├────────────────────────────────┤
│ const token = extract from header│
│ const decoded = jwt.verify(...) │
│ req.user = {id, role}           │
│ next()                          │
└────────────┬────────────────────┘
             │
             ▼
PASSO 4: Controller executa
┌──────────────────────────────────────────┐
│  createOrder() controller                 │
├──────────────────────────────────────────┤
│ const {storeId, products} = req.body      │
│ const customerId = req.user.id            │
│                                          │
│ // 1. Buscar produtos                    │
│ const productsData = await Product.find( │
│   {_id: {$in: products.map(p => p.id)}} │
│ )                                        │
│                                          │
│ // 2. Validar estoque                    │
│ for (const prod of productsData) {       │
│   const req = products.find(...)         │
│   if (prod.stock < req.qty) {            │
│     throw new AppError(400, 'Stock...')  │
│   }                                      │
│ }                                        │
│                                          │
│ // 3. Calcular preços                    │
│ let totalValue = 0                       │
│ for (const prod of productsData) {       │
│   const req = products.find(...)         │
│   totalValue += prod.price * req.qty     │
│ }                                        │
│                                          │
│ const deliveryFee = 10 // BRL             │
│ const totalWithFee = totalValue +        │
│   deliveryFee                            │
│                                          │
│ // 4. Calcular distribuição de wallet    │
│ const store = await Store.findById(      │
│   storeId                                │
│ )                                        │
│ const feePercent = await                 │
│   getStorePlanFee(storeId)               │
│   // 15%, 20%, 30% dependendo do plano   │
│                                          │
│ const distribution = calculateOrder(     │
│   Distribution({                         │
│     totalValue,                          │
│     deliveryFee,                         │
│     feePercent                           │
│   })                                     │
│ )                                        │
│ // Retorna:                              │
│ // {                                     │
│ //   storeAmount: 85 (loja recebe),      │
│ //   ceoAmount: 15 (CEO recebe),         │
│ //   motoboyAmount: 10 (motoboy recebe)  │
│ // }                                     │
│                                          │
│ // 5. Débitar carteira do cliente        │
│ let clientWallet =                       │
│   await Wallet.findOne({                 │
│     owner: customerId,                   │
│     ownerType: 'user'                    │
│   })                                     │
│                                          │
│ if (!clientWallet) {                     │
│   clientWallet = await Wallet.create({   │
│     owner: customerId,                   │
│     ownerType: 'user',                   │
│     balance: 0                           │
│   })                                     │
│ }                                        │
│                                          │
│ if (clientWallet.balance < totalWithFee) {│
│   throw new AppError(402, 'Saldo...')    │
│ }                                        │
│                                          │
│ clientWallet.balance -= totalWithFee     │
│ clientWallet.history.push({              │
│   type: 'debit',                         │
│   category: 'payment',                   │
│   amount: totalWithFee,                  │
│   reason: `Pedido #${Date.now()}`,       │
│   relatedId: orderId,                    │
│   date: new Date()                       │
│ })                                       │
│ await clientWallet.save()                │
│                                          │
│ // 6. Criar Order                        │
│ const order = await Order.create({       │
│   customerId,                            │
│   storeId,                               │
│   products: products.map(p => ({        │
│     productId: p.id,                     │
│     quantity: p.qty,                     │
│     price: products.find(                │
│       pr => pr.id === p.id               │
│     ).price                              │
│   })),                                   │
│   totalValue,                            │
│   deliveryFee,                           │
│   walletDistribution: distribution,      │
│   status: 'criado',                      │
│   idempotentKey: req.idempotentKey       │
│ })                                       │
│                                          │
│ // 7. Emitir socket para lojista         │
│ io.to(`store:${storeId}`).emit(          │
│   'order:new',                           │
│   {                                      │
│     orderId: order._id,                  │
│     customerId,                          │
│     totalValue,                          │
│     products: products                   │
│   }                                      │
│ )                                        │
│                                          │
│ // 8. Retornar resposta                  │
│ res.json({                               │
│   orderId: order._id,                    │
│   totalValue,                            │
│   status: 'criado'                       │
│ })                                       │
└──────────────────────────────────────────┘
             │ 201 Created
             │ {orderId: "...", totalValue: 95}
             ▼
PASSO 5: Frontend processa resposta
┌────────────────────────────────┐
│  checkout.tsx                  │
├────────────────────────────────┤
│ if (res.status === 201) {      │
│   // Mostrar confirmação       │
│   showToast('Pedido criado!')  │
│                                │
│   // Redirecionar              │
│   router.push(                 │
│     `/order/${res.orderId}`    │
│   )                            │
│ }                              │
└────────────────────────────────┘

PASSO 6: Socket real-time
┌────────────────────────────────┐
│  Lojista recebe notificação    │
├────────────────────────────────┤
│ socket.on('order:new', (data)=>│
│   {                            │
│     console.log(               │
│       'Novo pedido!',          │
│       data.orderId             │
│     )                          │
│     // Atualizar UI            │
│     addOrderToList(data)       │
│     // Tocar som/notificação   │
│     playSound()                │
│   }                            │
│ )                              │
└────────────────────────────────┘
```

---

## 🔗 Integração Backend-Frontend

### Contexto (State Management)

```typescript
// frontend/contexts/AuthContext.tsx
interface AuthContextType {
  user: IUser | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  switchRole: (role: Role) => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: FC<{children: ReactNode}> = ({children}) => {
  const [user, setUser] = useState<IUser | null>(null)
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('auth_token')
  )
  const [loading, setLoading] = useState(false)
  
  // Recuperar usuário ao carregar
  useEffect(() => {
    if (token) {
      validateToken()
    }
  }, [])
  
  // Configurar header de autorização
  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete api.defaults.headers.common['Authorization']
    }
  }, [token])
  
  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/login', {email, password})
      setToken(res.data.token)
      setUser(res.data.user)
      localStorage.setItem('auth_token', res.data.token)
    } finally {
      setLoading(false)
    }
  }
  
  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('auth_token')
  }
  
  return (
    <AuthContext.Provider value={{user, token, loading, login, logout}}>
      {children}
    </AuthContext.Provider>
  )
}

// Uso em componentes
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return context
}
```

### Socket.IO Real-Time

```typescript
// Backend: Emitir eventos
export const notifier = {
  initSocket(server: http.Server) {
    const io = new Server(server, {
      cors: {origin: process.env.CORS_ORIGIN}
    })
    
    io.on('connection', (socket) => {
      console.log(`Cliente conectado: ${socket.id}`)
      
      // Juntar em room por userId
      socket.on('join-user', (userId) => {
        socket.join(`user:${userId}`)
      })
      
      // Juntar em room por storeId
      socket.on('join-store', (storeId) => {
        socket.join(`store:${storeId}`)
      })
      
      socket.on('disconnect', () => {
        console.log(`Cliente desconectado: ${socket.id}`)
      })
    })
    
    return io
  }
}

// Emitir para room específico
export const emitToStore = (storeId: string, event: string, data: any) => {
  notifier.io?.to(`store:${storeId}`).emit(event, data)
}

// Uso em controller
export const acceptOrder = async (req: Request, res: Response) => {
  // ...lógica...
  
  // Notificar cliente que pedido foi aceito
  emitToUser(order.customerId, 'order:accepted', {
    orderId: order._id,
    status: 'pago'
  })
  
  res.json({status: 'pago'})
}

// Frontend: Escutar eventos
export const useSocket = () => {
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL)
    
    socket.on('connect', () => {
      console.log('Conectado ao servidor')
      
      // Juntar em room pessoal
      const {user} = useAuth()
      socket.emit('join-user', user?.id)
      
      // Se for lojista, juntar em room da loja
      if (user?.activeRole === 'lojista') {
        socket.emit('join-store', user?.storeId)
      }
    })
    
    // Escutar eventos
    socket.on('order:accepted', (data) => {
      console.log('Pedido aceito!', data)
      setOrderStatus(data)
    })
    
    socket.on('order:new', (data) => {
      console.log('Novo pedido!', data)
      addToOrderList(data)
      playSound()
    })
    
    return () => socket.disconnect()
  }, [])
}
```

---

## 💡 Exemplo Real: Pedido Completo

### Cenário
Um cliente faz um pedido em uma loja, o lojista aceita, um motoboy reclama a entrega, e o pedido é finalizado com sucesso.

### Timeline

```
T=0s    Cliente clica "Pagar" no checkout
T=0.1s  POST /api/orders → Backend
T=0.2s  Validação de schema + JWT
T=0.3s  Buscar produtos do DB
T=0.4s  Calcular distribuição de wallet
T=0.5s  Débitar carteira do cliente
T=0.6s  Criar Order no MongoDB
T=0.7s  Emitir socket 'order:new' para lojista
T=0.8s  Frontend mostra "Pedido criado!"
T=1s    Lojista recebe notificação
T=5s    Lojista clica "Aceitar Pedido"
T=5.1s  PUT /api/orders/:id/accept → Backend
T=5.2s  Validar ownership de loja
T=5.3s  Atualizar Order.status = 'pago'
T=5.4s  Emitir 'order:accepted' para cliente
T=5.5s  Emitir 'delivery:available' para motoboys
T=5.6s  Frontend redireciona para rastreamento
T=6s    Motoboy recebe 'delivery:available'
T=10s   Motoboy clica "Reivindicar Entrega"
T=10.1s POST /api/deliveries/:id/claim → Backend
T=10.2s Checar se já foi reivindicada
T=10.3s Associar motoboyId à entrega
T=10.4s Iniciar timeout job (30 min)
T=10.5s Retornar pickup location
T=10.6s Motoboy navega até loja (mapa)
T=20s   Motoboy chega na loja
T=20.1s Motoboy clica "Coletada"
T=20.2s PUT /api/deliveries/:id/status → 'coletada'
T=21s   Motoboy navega até cliente (mapa)
T=35s   Motoboy chega no cliente
T=35.1s Backend envia SMS com PIN
T=35.2s Motoboy solicita PIN ao cliente
T=35.3s Cliente lê SMS e fala PIN
T=35.4s Motoboy digita PIN
T=35.5s POST /api/deliveries/:id/finalizar {pin}
T=35.6s Backend valida PIN
T=35.7s Créditar saldo:
         - Loja: +85 BRL
         - CEO:  +15 BRL
         - Motoboy: +10 BRL
T=35.8s Criar Transaction records
T=35.9s Emitir socket 'delivery:completed'
T=36s   Todos recebem notificação
        - Cliente: "Pedido entregue!"
        - Loja: "Ganhou 85 BRL"
        - Motoboy: "+10 BRL, +5 pts gamificação"
        - CEO: "Receita: +15 BRL"
```

### Código Real Simplificado

```typescript
// 1. Cliente cria pedido
const handleCheckout = async () => {
  const res = await api.post('/api/orders', {
    storeId: '507f1f77bcf86cd799439011',
    products: [
      {productId: '507f1f77bcf86cd799439012', quantity: 2}
    ],
    paymentMethod: 'wallet'
  })
  
  // res = {orderId: '...' , totalValue: 95}
  setOrderId(res.orderId)
  router.push(`/order/${res.orderId}`)
}

// 2. Lojista aceita pedido
const handleAccept = async () => {
  const res = await api.put(
    `/api/orders/${orderId}/accept`,
    {}
  )
  
  // res = {status: 'pago', delivery: {...}}
  setOrderStatus('pago')
  toast.success('Pedido aceito!')
}

// 3. Motoboy reclama entrega
const handleClaim = async (deliveryId) => {
  const res = await api.post(
    `/api/deliveries/${deliveryId}/claim`,
    {}
  )
  
  // res = {motoboyId: '...', pickupLocation: {...}}
  showMap(res.pickupLocation)
  toast.info('Entrega reivindicada!')
}

// 4. Motoboy finaliza entrega
const handleFinalize = async (deliveryId, pin) => {
  const res = await api.post(
    `/api/deliveries/${deliveryId}/finalizar`,
    {pin}
  )
  
  // res = {transactionId: '...', status: 'entregue'}
  toast.success('Pedido entregue!')
  
  // Distribuição de saldo
  updateWallet({
    balance: wallet.balance + 10,
    history: [
      {
        type: 'credit',
        amount: 10,
        reason: 'Entrega finalizada',
        date: new Date()
      }
    ]
  })
}

// 5. Socket listeners
useEffect(() => {
  socket.on('order:accepted', (data) => {
    console.log('Seu pedido foi aceito!')
    setOrderStatus('pago')
  })
  
  socket.on('delivery:available', (data) => {
    console.log('Tem uma entrega pra você!')
    addAvailableDelivery(data)
  })
  
  socket.on('delivery:completed', (data) => {
    console.log('Pedido entregue!')
    markAsDelivered(data.orderId)
  })
}, [socket])
```

---

## 🛡️ Tratamento de Erros

### Estratégia

```typescript
// 1. Validação de Input
if (!email || !password) {
  return res.status(400).json({
    error: 'Email e senha são obrigatórios'
  })
}

// 2. Validação de Negócio
const order = await Order.findById(orderId)
if (!order) {
  throw new AppError(404, 'Pedido não encontrado')
}

// 3. Validação de Autorização
if (order.customerId !== req.user.id) {
  throw new AppError(403, 'Você não pode acessar este pedido')
}

// 4. Validação de Estado
if (order.status !== 'criado') {
  throw new AppError(409, 'Apenas pedidos em "criado" podem ser aceitos')
}

// 5. Validação de Dependência
const store = await Store.findById(order.storeId)
if (!store?.isActive) {
  throw new AppError(400, 'Loja não está ativa')
}

// Handler centralizado
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

// Uso
router.put(
  '/orders/:id/accept',
  authenticate,
  asyncHandler(acceptOrder)
)
```

### Erros Comuns

```typescript
// ❌ Não fazer
export const acceptOrder = async (req, res) => {
  const order = await Order.findById(req.params.id)
  order.status = 'pago'  // NPE se order é null!
  await order.save()
  res.json({status: 'pago'})
}

// ✅ Fazer
export const acceptOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
    
    if (!order) {
      throw new AppError(404, 'Order not found')
    }
    
    order.status = 'pago'
    await order.save()
    res.json({status: 'pago'})
  } catch (err) {
    next(err)
  }
}
```

---

## ⚡ Performance & Otimizações

### 1. Indexing

```typescript
// Índices importantes em MongoDB
userSchema.index({email: 1}) // Login rápido
orderSchema.index({customerId: 1}) // Listar meus pedidos
orderSchema.index({storeId: 1}) // Pedidos da loja
deliverySchema.index({motoboyId: 1}) // Entregas do motoboy
walletSchema.index({owner: 1, ownerType: 1}, {unique: true})
```

### 2. Paginação

```typescript
export const listOrders = async (req: Request, res: Response) => {
  const {page = 1, limit = 10} = req.query
  const skip = (Number(page) - 1) * Number(limit)
  
  const orders = await Order.find({customerId: req.user.id})
    .skip(skip)
    .limit(Number(limit))
    .sort({createdAt: -1})
  
  const total = await Order.countDocuments({customerId: req.user.id})
  
  res.json({
    orders,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit))
    }
  })
}
```

### 3. Caching

```typescript
// Simples: memória
const rolePermissionsCache = new Map()

export const getPermissions = async (roleId: string) => {
  if (rolePermissionsCache.has(roleId)) {
    return rolePermissionsCache.get(roleId)
  }
  
  const permissions = await Role.findById(roleId)
  rolePermissionsCache.set(roleId, permissions)
  
  // Invalidar após 1 hora
  setTimeout(() => rolePermissionsCache.delete(roleId), 3600000)
  
  return permissions
}

// Redis: melhor para escala
import redis from 'redis'
const client = redis.createClient()

export const getCachedWallet = async (userId: string) => {
  const cached = await client.get(`wallet:${userId}`)
  if (cached) {
    return JSON.parse(cached)
  }
  
  const wallet = await Wallet.findOne({owner: userId})
  await client.setEx(`wallet:${userId}`, 3600, JSON.stringify(wallet))
  return wallet
}
```

### 4. Lazy Loading

```typescript
// Não fazer: carregar tudo de uma vez
const orders = await Order.find({customerId: req.user.id})
  .populate('customerId')
  .populate('storeId')
  .populate('deliveryId')
  // N+1 queries!

// ✅ Fazer: carregar apenas quando necessário
const orders = await Order.find({customerId: req.user.id})

// No controller, se precisar de dados do cliente
const customer = await User.findById(order.customerId)
```

### 5. Agregações

```typescript
// Lento: buscar tudo e processar em JS
const orders = await Order.find({storeId})
const total = orders.reduce((s, o) => s + o.totalValue, 0)
const count = orders.length

// ✅ Rápido: agregação no DB
const stats = await Order.aggregate([
  {$match: {storeId}},
  {
    $group: {
      _id: null,
      total: {$sum: '$totalValue'},
      count: {$sum: 1},
      avg: {$avg: '$totalValue'}
    }
  }
])

// stats = [{_id: null, total: 1000, count: 5, avg: 200}]
```

---

## 🔐 Segurança Deep Dive

### 1. Autenticação JWT

```typescript
// Geração
const token = jwt.sign(
  {
    id: user._id,
    role: user.activeRole,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hora
  },
  process.env.JWT_SECRET,
  {algorithm: 'HS256'}
)

// Validação
try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET)
  // token válido
} catch (err) {
  // Token expirado ou inválido
}

// ⚠️ Risco: Token armazenado em localStorage
// Solução: Usar HttpOnly cookies
res.cookie('authToken', token, {
  httpOnly: true,
  secure: true, // Apenas HTTPS
  sameSite: 'strict',
  maxAge: 3600000 // 1 hora
})
```

### 2. Password Hashing

```typescript
// ❌ Nunca fazer
user.password = password // Armazenar em texto plano!

// ✅ Fazer
const salt = await bcrypt.genSalt(10)
const passwordHash = await bcrypt.hash(password, salt)
user.passwordHash = passwordHash
await user.save()

// Validação
const isValid = await bcrypt.compare(inputPassword, user.passwordHash)
```

### 3. Rate Limiting

```typescript
// Proteção contra brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 tentativas
  message: 'Muitas tentativas. Tente depois.',
  keyGenerator: (req) => {
    // Usar IP real (mesmo atrás de proxy)
    return req.ip || req.connection.remoteAddress
  }
})

app.use('/api/auth', authLimiter)
```

### 4. Validação de Input

```typescript
// ❌ Nunca fazer
const query = `SELECT * FROM users WHERE email = '${req.body.email}'`
// SQL Injection!

// ✅ Fazer com Mongoose
const user = await User.findOne({email: req.body.email})

// ✅ Fazer com Zod
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
})

const validated = schema.parse(req.body)
```

### 5. CORS

```typescript
// ❌ Nunca fazer
app.use(cors()) // Aberto para qualquer origem!

// ✅ Fazer
const allowedOrigins = [
  'https://exemplo.com',
  'https://admin.exemplo.com'
]

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('CORS not allowed'))
    }
  },
  credentials: true
}))
```

### 6. Criptografia de Dados Sensíveis

```typescript
import crypto from 'crypto'

export const encryptBankInfo = (bankInfo: any) => {
  const algorithm = 'aes-256-cbc'
  const key = crypto.scryptSync(
    process.env.ENCRYPTION_KEY!,
    'salt',
    32
  )
  const iv = crypto.randomBytes(16)
  
  const cipher = crypto.createCipheriv(algorithm, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(bankInfo)),
    cipher.final()
  ])
  
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

export const decryptBankInfo = (encrypted: string) => {
  const [ivHex, encryptedHex] = encrypted.split(':')
  const algorithm = 'aes-256-cbc'
  const key = crypto.scryptSync(
    process.env.ENCRYPTION_KEY!,
    'salt',
    32
  )
  const iv = Buffer.from(ivHex, 'hex')
  
  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    iv
  )
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ])
  
  return JSON.parse(decrypted.toString())
}

// Uso
user.bankInfoEncrypted = encryptBankInfo({
  banco: 'BB',
  agencia: '0001',
  conta: '123456'
})
await user.save()

// Depois
const bankInfo = decryptBankInfo(user.bankInfoEncrypted!)
```

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// test/controllers/authController.test.ts
import {register, login} from '../src/controllers/authController'
import User from '../src/models/User'
import {Request, Response} from 'express'

jest.mock('../src/models/User')

describe('authController', () => {
  describe('register', () => {
    it('deve criar usuário com email válido', async () => {
      const req = {
        body: {
          name: 'John',
          email: 'john@example.com',
          password: '123456',
          role: 'cliente'
        }
      } as Request
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any as Response
      
      ;(User.findOne as jest.Mock).mockResolvedValue(null)
      ;(User.prototype.save as jest.Mock).mockResolvedValue({})
      
      await register(req, res)
      
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({token: expect.any(String)})
      )
    })
    
    it('deve rejeitar email duplicado', async () => {
      const req = {
        body: {
          email: 'existing@example.com',
          password: '123456'
        }
      } as Request
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any as Response
      
      ;(User.findOne as jest.Mock).mockResolvedValue({_id: '123'})
      
      await register(req, res)
      
      expect(res.status).toHaveBeenCalledWith(409)
    })
  })
})
```

### Integration Tests

```typescript
// test/integration/order.integration.test.ts
import request from 'supertest'
import app from '../src/app'
import {connectDB, disconnectDB} from '../src/db'

describe('Order Integration Tests', () => {
  beforeAll(async () => {
    await connectDB()
  })
  
  afterAll(async () => {
    await disconnectDB()
  })
  
  it('deve criar pedido completo', async () => {
    // 1. Criar usuário
    const userRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Client',
        email: 'client@example.com',
        password: '123456',
        role: 'cliente'
      })
    
    const token = userRes.body.token
    const customerId = userRes.body.user.id
    
    // 2. Criar loja
    const storeRes = await request(app)
      .post('/api/stores')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Store',
        city: 'SP'
      })
    
    const storeId = storeRes.body.id
    
    // 3. Criar produto
    const productRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Pizza',
        price: 50,
        storeId
      })
    
    const productId = productRes.body.id
    
    // 4. Criar pedido
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storeId,
        products: [
          {productId, quantity: 1}
        ],
        paymentMethod: 'wallet'
      })
    
    expect(orderRes.status).toBe(201)
    expect(orderRes.body).toHaveProperty('orderId')
    expect(orderRes.body.totalValue).toBeGreaterThan(0)
  })
})
```

### E2E Tests (Cypress)

```typescript
// test/e2e/checkout.cy.ts
describe('Checkout Flow', () => {
  it('deve completar pedido do início ao fim', () => {
    // 1. Ir para home
    cy.visit('http://localhost:3000')
    
    // 2. Login
    cy.get('[data-testid="email-input"]').type('client@example.com')
    cy.get('[data-testid="password-input"]').type('123456')
    cy.get('[data-testid="login-button"]').click()
    
    // 3. Procurar loja
    cy.get('[data-testid="store-search"]').type('Pizza')
    cy.get('[data-testid="store-card"]').first().click()
    
    // 4. Adicionar ao carrinho
    cy.get('[data-testid="product-card"]').first().click()
    cy.get('[data-testid="quantity-input"]').type('2')
    cy.get('[data-testid="add-to-cart"]').click()
    
    // 5. Checkout
    cy.get('[data-testid="cart-icon"]').click()
    cy.get('[data-testid="checkout-button"]').click()
    cy.get('[data-testid="address-input"]').type('Rua...')
    cy.get('[data-testid="payment-wallet"]').click()
    cy.get('[data-testid="confirm-order"]').click()
    
    // 6. Confirmar
    cy.get('[data-testid="order-confirmation"]').should('be.visible')
    cy.get('[data-testid="order-id"]').should('contain', 'Order #')
  })
})
```

---

## 📊 Resumo de Padrões

| Padrão | Uso | Benefício |
|--------|-----|-----------|
| MVC | Controllers + Models + Routes | Separação de responsabilidades |
| Middleware Chain | Pipeline de validação | Código limpo e reutilizável |
| Error Handling | AppError + errorHandler | Consistência em erros |
| Validação Zod | Input validation | Type-safe e reusável |
| Permission-based | authorizePermission() | Granular access control |
| Rate Limiting | rateLimit() | Proteção contra abuso |
| Socket.IO | Real-time events | Notificações instantâneas |
| Caching | Redis/Memory | Performance |
| Criptografia | AES-256 | Dados sensíveis seguros |

---

**Fim da Análise Detalhada** ✅
