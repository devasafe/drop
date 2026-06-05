# 🔧 Fix Render Build Cache Issue

## Problema

- ✅ Build funciona **localmente**
- ❌ Build falha **no Render** com erros de tipos que não existem

Possível causa: **Build cache do Render** está usando código antigo

## Solução

### Opção 1: Limpar Cache via Render Dashboard (RECOMENDADO)

1. Acesse seu serviço no Render
2. Vá em **"Settings"** → **"Build & Deploy"**
3. Clique em **"Clear Build Cache"**
4. Clique em **"Manual Deploy"** → **"Deploy Latest Commit"**
5. Aguarde completar

### Opção 2: Forçar Rebuild sem Cache

1. Na página do serviço
2. Clique em **"Logs"**
3. Procure o botão "Rebuild" ou "Manual Deploy"
4. Se tiver opção **"Skip Cache"**, marque
5. Clique **"Deploy"**

### Opção 3: Fazer Commit Dummy (Via Git)

```bash
cd "d:\PROJETOS\Drop"
git commit --allow-empty -m "Force rebuild: clear Render cache"
git push
```

Isso vai forçar o Render a fazer um novo deploy sem cache.

---

## ✅ Verificação Local

Confirme que build passa:

```bash
npm run build
```

Deve compilar sem erros!

---

## 📊 Se Continuar Falhando

### Check 1: Arquivo está no Git?

```bash
git log --name-status -n 5 | grep walletCalculations
```

Deve mostrar `src/utils/walletCalculations.ts`

### Check 2: Arquivo tem a função?

```bash
git show HEAD:src/utils/walletCalculations.ts | grep -n "calculateLateCancellationFee"
```

Deve mostrar a linha com export

### Check 3: Rebuild sem dependências

Mude o Build Command no Render para:

```bash
npm ci && npm run build
```

(sem `--include=dev`)

---

## 🎯 Próximo Passo

Depois que passar:

1. Adicione Environment Variables
2. Teste a URL do backend
3. Conecte com frontend no Vercel

