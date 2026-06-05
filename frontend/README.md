# Frontend (Next.js) - Drop Marketplace

Este é um esqueleto mínimo de frontend em Next.js para o backend MVP.

Como rodar:

1. Entre na pasta frontend:

```powershell
cd frontend
npm install
npm run dev
```

O frontend por padrão tenta acessar a API em `http://localhost:4000`. Você pode alterar isso definindo a variável de ambiente `NEXT_PUBLIC_API_URL`.

Páginas incluídas:
- `/login` — tela de login. Após login o token é armazenado em localStorage.
- `/` — listagem de produtos (GET /products). Botão para adicionar ao carrinho (armazenado em localStorage).
- `/checkout` — mostra o carrinho e permite criar pedido (POST /orders). Informe `storeId` manualmente para testar.

Exemplo de cliente Socket.IO:
Use o script `examples/socket-client.js` no repositório root com um token JWT para receber notificações.
