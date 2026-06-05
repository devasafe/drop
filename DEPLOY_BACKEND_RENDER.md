# 🚀 Deploy Backend no Render

## Passo-a-passo para deployar o backend no Render

### 1. **Preparar o Backend Localmente**

Primeiro, certifique-se que o build local funciona:

```bash
cd d:\PROJETOS\Drop
npm run build
npm run start
```

Se isso funcionar, estamos prontos pra fazer deploy!

---

### 2. **Configurar no Render**

#### a) Acesse https://render.com e faça login/signup

#### b) Clique em "New Web Service"

#### c) Selecione seu repositório: `devasafe/XDXRXOXPX`

#### d) Configure os campos:

**Name:**
```
drop-backend
```

**Root Directory:**
```
(deixar vazio - raiz do repo)
```

**Branch:**
```
main
```

**Build Command:**
```
npm install; npm run build
```

**Start Command:**
```
npm run start
```

**Instance Type:**
```
Free (você pode começar com o plano gratuito)
```

---

### 3. **Adicionar Environment Variables no Render**

Clique em "Add Environment Variable" e adicione:

| Nome | Valor | Descrição |
|------|-------|-----------|
| `MONGODB_URI` | `sua-string-de-conexao` | String do MongoDB Atlas |
| `NODE_ENV` | `production` | Ambiente de produção |
| `JWT_SECRET` | `uma-chave-secreta-aleatoria` | Chave pra assinar JWTs |
| `CORS_ORIGIN` | `https://seu-frontend-vercel.vercel.app` | URL do frontend Vercel |
| `PORT` | `10000` | Porta (Render default, deixar assim) |

**Como pegar a `MONGODB_URI`:**

1. Vá em: https://cloud.mongodb.com
2. Clique no cluster
3. "Connect" → "Connect your application"
4. Copie a string (vai parecer: `mongodb+srv://usuario:senha@cluster.mongodb.net/dbname`)

**Como gerar JWT_SECRET (no terminal PowerShell):**

```powershell
$secret = -join ((1..32) | ForEach-Object { [char][byte]::Parse('{0:x2}' -f (Get-Random -Min 0 -Max 256)) })
Write-Host $secret
```

Ou use essa string segura (mude depois):
```
your-super-secret-key-change-this-in-production-123456789
```

---

### 4. **Deploy**

Clique em "Deploy Web Service" e aguarde!

Você deve ver algo como:
```
✓ Build started
✓ Build completed
✓ Deploying...
✓ Live at: https://drop-backend.onrender.com
```

---

### 5. **Atualizar o Frontend com a URL do Backend**

Depois que o backend estiver deployado, vá no Vercel e atualize:

```
NEXT_PUBLIC_API_URL = https://drop-backend.onrender.com/api
```

---

### 6. **Testar Conexão**

Abra seu navegador e acesse:

```
https://drop-backend.onrender.com/api/health
```

Ou faça um teste no terminal:

```powershell
curl https://drop-backend.onrender.com/api/health
```

Se devolver algo, tá funcionando! ✅

---

## 🔧 Troubleshooting

### "Build Failed"

1. Verifique se o build funciona localmente:
   ```bash
   npm run build
   npm run start
   ```

2. Verifique se as variáveis de ambiente estão corretas no Render

3. Veja os logs no Render dashboard clicando em "Logs"

### "502 Bad Gateway"

- Backend pode estar fora do ar
- Verifique os logs no Render
- Pode ser problema de conexão MongoDB

### Frontend não conecta no Backend

1. Certifique-se que `NEXT_PUBLIC_API_URL` está correto no Vercel
2. Verifique `CORS_ORIGIN` no backend está permitindo a URL do frontend
3. Teste diretamente a URL do backend num browser ou curl

---

## 📝 Próximos Passos

1. ✅ Deploy backend no Render
2. ✅ Atualizar `NEXT_PUBLIC_API_URL` no Vercel
3. ✅ Testar frontend conectando no backend de produção
4. ✅ Compartilhar URL com amigos para teste

---

## 💡 Dicas

- **Render free tier**: Cai em 15 min de inatividade. Pro testes é ok.
- **Upgrade pago**: $7/mês se quiser produção real
- **Alternative**: Railway, Heroku ou AWS também funcionam
- **Local testing**: Enquanto configura, use `npm run dev` localmente
