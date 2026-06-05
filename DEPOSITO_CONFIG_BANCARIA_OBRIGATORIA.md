# ✅ VALIDAÇÃO: Configuração Bancária Obrigatória para Depósito

## Requisito Implementado

> "Pra depositar dinheiro também tem que ser obrigatório estar com a conta do banco configurada"

## Mudança Aplicada

### Arquivo: `frontend/pages/my-wallet.tsx`

**Linha 101 - handleDeposit()**:

```typescript
// ❌ ANTES
const handleDeposit = async () => {
  if (!depositAmount || parseFloat(depositAmount) <= 0) {
    alert('Digite um valor válido');
    return;
  }
  // ... resto da função

// ✅ DEPOIS
const handleDeposit = async () => {
  // Verifica se banco está configurado
  if (!bankInfoConfigured) {
    alert('⚠️ Você precisa configurar seus dados bancários primeiro!');
    router.push('/bank-setup');
    return;
  }

  if (!depositAmount || parseFloat(depositAmount) <= 0) {
    alert('Digite um valor válido');
    return;
  }
  // ... resto da função
```

## Fluxo de Depósito Agora

```
Usuário clica "Depositar"
    ↓
Verifica: bankInfoConfigured === true?
    ├─ SIM → Prossegue com depósito
    └─ NÃO → Mostra alerta + Redireciona para /bank-setup
    ↓
Valida: amount > 0?
    ├─ SIM → Continua
    └─ NÃO → Alerta "Digite um valor válido"
    ↓
POST /wallets/{userId}/credit
    ↓
Sucesso → Recarrega carteira
```

## Sincronização com Saque

Agora **Depósito** e **Saque** têm o mesmo requisito:

| Operação | Requer Config Bancária | Status |
|----------|------------------------|--------|
| 💳 Depósito | ✅ SIM | Implementado |
| 🏦 Saque | ✅ SIM | Já implementado |
| 👥 Transferência | ❌ NÃO | Sem requisito |

## Comportamento do Usuário

**Novo Usuário (sem config bancária)**:
1. Acessa `/my-wallet`
2. Vê aviso amarelo: "⚠️ Configure seus dados bancários"
3. Clica em "Depositar"
4. Recebe alerta: "⚠️ Você precisa configurar seus dados bancários primeiro!"
5. Redireciona automaticamente para `/bank-setup`
6. Configura dados (banco, agência, conta, CPF)
7. Volta para `/my-wallet`
8. Agora pode depositar e sacar normalmente

## Compilação

✅ **TypeScript**: Sem erros  
✅ **Frontend**: Compilando corretamente

## Status

✅ **IMPLEMENTADO**: Validação de configuração bancária obrigatória para depósito

---

### Próximas Ações
1. Reinicie o servidor frontend
2. Teste o fluxo: clique em "Depositar" sem configuração bancária
3. Verifique se redireciona para `/bank-setup`
4. Configure dados bancários
5. Tente depositar novamente (deve funcionar)
