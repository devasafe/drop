# 🔧 Fix: Render Build Failing - DevDependencies

## Problema

O Render não estava instalando `devDependencies` e o build falhava com erros de tipos TypeScript:
- `Cannot find name 'expect'`
- `Cannot find module '@types/express'`
- `Cannot find module 'supertest'`

## Solução

### Opção 1: Adicionar Variável de Ambiente (Recomendado)

No Render Dashboard:

1. Vá em seu serviço backend
2. Click em "Environment"
3. Clique "Add Environment Variable"
4. Adicione:

```
NPM_TOKEN = (deixar vazio)
```

E, mais importante, modifique o **Build Command** para:

```bash
npm ci --include=dev && npm run build
```

Ou, se preferir usar install:

```bash
npm install && npm run build
```

### Opção 2: Forçar via package.json

Se o Build Command não funcionar, modifique o `package.json`:

```json
{
  "scripts": {
    "build": "npm install && tsc",
    "start": "node dist/index.js"
  }
}
```

### Opção 3: Adicionar .npmrc

Crie um arquivo `.npmrc` na raiz:

```
production=false
```

Isso força o npm a instalar devDependencies mesmo em modo produção.

---

## Verificar Localmente

Antes de fazer deploy novamente, teste se o build funciona com:

```bash
cd d:\PROJETOS\Drop
npm run build
```

Deve gerar a pasta `dist/` sem erros.

---

## Fazer Novo Deploy no Render

1. **Atualize o Build Command no Render** para:
   ```
   npm ci --include=dev && npm run build
   ```

2. **Ou atualize o package.json** conforme descrito acima

3. **Faça push** para Git:
   ```bash
   git add . && git commit -m "Fix: force devDependencies install for build" && git push
   ```

4. **Render vai redeploy automaticamente** ou clique em "Manual Deploy"

---

## Status

- ❌ Render build falhando (antes)
- ✅ Build command corrigido
- ⏳ Aguardando novo deploy para confirmar sucesso

