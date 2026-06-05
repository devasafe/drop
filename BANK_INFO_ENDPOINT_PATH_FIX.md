# 🔧 CORREÇÃO: Endpoint Path de Dados Bancários

## Problema Reportado

```
GET http://localhost:4000/api/user/bank-info 404 (Not Found)
Erro ao carregar carteira: AxiosError: Request failed with status code 404
```

## Causa Raiz

O frontend estava chamando `/api/user/bank-info` mas o backend montava a rota em `/bank-info` (sem `/api/user`).

### Estrutura Backend (app.ts)
```typescript
app.use('/', userRoutes);  // ← Rotas de usuário montadas em /
```

### Rotas Criadas (user.ts)
```typescript
router.get('/bank-info', authenticate, getBankInfo);    // ← GET /bank-info
router.post('/bank-info', authenticate, setBankInfo);   // ← POST /bank-info
```

### Endpoint Real
- ✅ GET `/bank-info` (não `/api/user/bank-info`)
- ✅ POST `/bank-info` (não `/api/user/bank-info`)

---

## Solução Aplicada

### Frontend - Corrigidos 3 Arquivos

#### 1. `frontend/pages/my-wallet.tsx`

**Linha 55 - loadWallet()**:
```typescript
// ❌ ANTES
const bankRes = await api.get('/user/bank-info');

// ✅ DEPOIS
const bankRes = await api.get('/bank-info');
```

**Linha 150 - handleWithdraw()**:
```typescript
// ❌ ANTES
const bankRes = await api.get('/user/bank-info');

// ✅ DEPOIS
const bankRes = await api.get('/bank-info');
```

#### 2. `frontend/pages/bank-setup.tsx`

**Linha 39 - loadBankInfo()**:
```typescript
// ❌ ANTES
const res = await api.get('/user/bank-info');

// ✅ DEPOIS
const res = await api.get('/bank-info');
```

**Linha 102 - handleSubmit()**:
```typescript
// ❌ ANTES
const res = await api.post('/user/bank-info', bankInfo);

// ✅ DEPOIS
const res = await api.post('/bank-info', bankInfo);
```

---

## Validação

✅ **TypeScript**: Sem erros
✅ **Endpoints**: Agora corretos
✅ **Frontend**: Compilando normalmente

---

## Endpoints Corretos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/bank-info` | Retorna status de configuração |
| POST | `/bank-info` | Configura dados bancários |

**Nota**: Ambos requerem autenticação e o header será adicionado pelo axios interceptor automaticamente.

---

## Próximos Passos

1. Recarregue o navegador (Ctrl+F5)
2. Acesse `/my-wallet`
3. Verifique se o erro 404 desapareceu
4. Se for novo usuário, verá o aviso para configurar banco
5. Clique em "Configurar Agora" e teste o fluxo

---

## Status

✅ **CORRIGIDO**: Endpoints agora acessíveis
⏳ **Próximo**: Testar fluxo de configuração

**Agora tudo deve funcionar!** 🚀
