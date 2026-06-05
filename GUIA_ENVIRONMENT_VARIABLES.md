# 🔑 GUIA DE VARIÁVEIS DE AMBIENTE - DROP

## 📋 Variáveis Necessárias

### 1. **NEXT_PUBLIC_GOOGLE_MAPS_KEY** ⭐ OBRIGATÓRIA
**Uso**: Renderizar mapas interativos (localização, rotas, endereços)

**Como conseguir**:
1. Acesse: https://console.cloud.google.com/
2. Crie um novo projeto (ou use um existente)
3. Ative as APIs:
   - **Maps JavaScript API**
   - **Places API**
   - **Directions API**
4. Vá em **Credenciais** → **Criar Credenciais** → **Chave de API**
5. Restrinja a chave para:
   - Aplicações HTTP (referrer)
   - URLs: `localhost:3000`, `localhost:3001`, seu domínio no Vercel

**Formato**:
```
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIzaSy... (começando com AIzaSy)
```

---

### 2. **NEXT_PUBLIC_API_URL** (Opcional, tem default)
**Uso**: URL do backend para requisições

**Valores possíveis**:
```
Development: http://localhost:4000
Staging: https://api-staging.seudominio.com
Production: https://api.seudominio.com
```

**Default**: Se não configurar, usa `http://localhost:4000`

---

### 3. **NODE_ENV** (Opcional, Next.js configura automaticamente)
**Uso**: Define ambiente (development/production)

**Valores**:
```
development  (local)
production   (Vercel)
```

---

## 📝 Como Configurar Localmente

### Opção 1: Criar arquivo `.env.local`
```bash
# .env.local
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Opção 2: Usar `.env.development`
```bash
# .env.development
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## 🚀 Como Configurar no Vercel

### Via CLI:
```bash
cd d:\PROJETOS\Drop\frontend

# Adicionar chave do Google Maps
vercel env add NEXT_PUBLIC_GOOGLE_MAPS_KEY
# (Cole a chave quando pedir)

# Adicionar URL do backend (se não for localhost)
vercel env add NEXT_PUBLIC_API_URL
# (Digite: https://seu-backend.com ou similar)

# Redeploy
vercel --prod
```

### Via Dashboard:
1. Acesse: https://vercel.com/devasafes-projects/frontend
2. **Settings** → **Environment Variables**
3. Clique em **Add New**
4. Nome: `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
5. Valor: `AIzaSy...` (sua chave)
6. Selecione: Development, Preview, Production
7. **Save**

---

## ✅ Checklist de Configuração

- [ ] Chave do Google Maps criada em console.cloud.google.com
- [ ] APIs habilitadas: Maps JS, Places, Directions
- [ ] `.env.local` configurado com a chave
- [ ] `npm run dev` rodando localmente sem erros
- [ ] Mapa carregando no app (teste em http://localhost:3000)
- [ ] Chave adicionada ao Vercel via CLI ou Dashboard
- [ ] `vercel --prod` deployado com sucesso
- [ ] App rodando em https://frontend-XXXXX.vercel.app

---

## 🔒 Segurança

⚠️ **IMPORTANTE**: Variáveis com `NEXT_PUBLIC_` são **públicas** (expostas no frontend)
- ✅ Seguro expor: GOOGLE_MAPS_KEY (já é pública por padrão)
- ❌ NUNCA exponha: Senhas, chaves privadas, tokens secretos

---

## 🐛 Troubleshooting

### Erro: "Google Maps não está definido"
```
❌ NEXT_PUBLIC_GOOGLE_MAPS_KEY está vazio ou inválido
✅ Solução: Confirme a chave em .env.local
```

### Erro: "API key not found"
```
❌ Chave não foi adicionada ao Vercel
✅ Solução: Rode vercel env add NEXT_PUBLIC_GOOGLE_MAPS_KEY
```

### Mapa carrega mas diz "You have exceeded..."
```
❌ Quota de requisições do Google Maps excedida
✅ Solução: Verifique em console.cloud.google.com/billing
```

---

**Precisa de ajuda?** É só chamar! 🚀
