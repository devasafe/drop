# Drop Marketplace - Backend (MVP)

Scaffold inicial do backend em Node.js + TypeScript para o marketplace.

Principais comandos (após instalar dependências):

```powershell
npm install
cp .env.example .env
npm run dev
```

Arquitetura: Express + Mongoose + JWT

## Rodando com Docker (MongoDB)

Se quiser subir apenas o MongoDB localmente via Docker Compose para desenvolvimento, use o arquivo `docker-compose.yml` incluído. Isso cria um container MongoDB e o painel `mongo-express` para inspeção dos dados.

# Drop Marketplace - Backend (MVP)

Resumo rápido (em português)

Este repositório contém um backend MVP para um marketplace com 3 papéis: cliente, lojista e motoboy.
O objetivo é fornecer APIs para autenticação, CRUD de produtos, criação de pedidos, fluxo de entregas e notificações em tempo real para motoboys (Socket.IO com fallback SSE).

Rodando localmente

1. Instale dependências:

```powershell
npm install
```

2. Iniciar em modo desenvolvimento (usa `mongodb-memory-server` se `MONGO_URI` não estiver configurado):

```powershell
npm run dev
```

3. Rodar testes:

```powershell
npm test
```

Principais endpoints

- POST /auth/register { name, email, password, role } -> registra usuário
- POST /auth/login { email, password } -> retorna { token, user }

- Products
	- GET /products
	- GET /products/:id
	- POST /products (lojista) { storeId, name, price, quantity }
	- PUT /products/:id (lojista)
	- DELETE /products/:id (lojista)

- Orders
	- POST /orders (cliente) { storeId, products: [{ productId, quantity }], deliveryDistanceKm, paymentMethod? }
	- GET /orders/:id
	- PUT /orders/:id/accept (lojista) { distance } -> cria Delivery pendente e notifica motoboys

- Deliveries
	- POST /deliveries (lojista)
	- PUT /deliveries/:id/assign (lojista)
	- PUT /deliveries/:id/status (motoboy)
	- GET /deliveries/:id
	- GET /deliveries/available (motoboy)
	- POST /deliveries/:id/claim (motoboy) -> atomic claim (first-claim-wins)

- Notifications (real-time)
	- WebSocket (Socket.IO): conectar ao servidor passando o JWT no handshake:
		- exemplo (cliente JS):
			const socket = io('http://localhost:4000', { auth: { token: '<JWT>' } });
			socket.on('notification', data => console.log(data));
	- Fallback SSE: GET /notifications/stream (autenticado via header Authorization "Bearer <token>")

Contratos e notas

- JWT: contém { id, role }. Use o token retornado por /auth/login em Authorization: Bearer <token> para chamadas HTTP.
- Para Socket.IO, passe o token em `auth.token` no handshake (ou query param `token` em implementações simples).

Exemplos curl

1) Registrar

```powershell
curl -X POST http://localhost:4000/auth/register -H "Content-Type: application/json" -d '{"name":"A","email":"a@example.com","password":"pass","role":"cliente"}'
```

2) Login

```powershell
curl -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" -d '{"email":"a@example.com","password":"pass"}'
```

3) Criar produto (lojista)

```powershell
curl -X POST http://localhost:4000/products -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"storeId":"<storeId>","name":"Produto","price":10,"quantity":5}'
```

4) Criar pedido (cliente)

```powershell
curl -X POST http://localhost:4000/orders -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"storeId":"<storeId>","products":[{"productId":"<productId>","quantity":1}],"deliveryDistanceKm":3,"paymentMethod":"card"}'
```

Exemplo cliente Socket.IO (Node.js)

Veja o arquivo `examples/socket-client.js` para um cliente mínimo que conecta e imprime notificações.

Postman / Collection

Um arquivo de coleção Postman está disponível em `postman_collection.json` com requisições básicas.

Status e próximos passos

- O backend está pronto para o frontend consumir o MVP (autenticação, produtos, pedido, entrega e notificações em tempo real).
- Recomenda-se criar uma coleção Postman e um cliente de frontend (Next.js / React Native) para testar fluxos completos.



