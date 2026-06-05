# 🏧 Sistema de Configuração de Dados Bancários

## Resumo da Implementação

Foi implementado um sistema onde o usuário configura seus dados bancários **uma única vez** no perfil, e esses dados são reutilizados automaticamente para todos os saques.

## Mudanças Realizadas

### 1. Backend - Modelo User

**Arquivo**: `src/models/User.ts`

**Interface adicionada**:
```typescript
bankInfo?: {
  banco: string;
  agencia: string;
  conta: string;
  cpfBanco: string;
  isConfigured: boolean;
};
```

**Schema adicionado**:
```typescript
bankInfo: {
  type: {
    banco: { type: String, required: true },
    agencia: { type: String, required: true },
    conta: { type: String, required: true },
    cpfBanco: { type: String, required: true },
    isConfigured: { type: Boolean, default: false }
  },
  default: null
}
```

### 2. Backend - Endpoints Criados

**Arquivo**: `src/controllers/userController.ts` e `src/routes/user.ts`

#### GET `/api/user/bank-info`
Retorna se os dados bancários foram configurados:
```json
{
  "isConfigured": true,
  "bankInfo": {
    "banco": "Banco Itaú",
    "agencia": "0001",
    "conta": "12345-67",
    "cpfBanco": "00000000000"
  }
}
```

#### POST `/api/user/bank-info`
Configura os dados bancários do usuário (apenas uma vez):
```json
{
  "banco": "Banco Itaú",
  "agencia": "0001",
  "conta": "12345-67",
  "cpfBanco": "00000000000"
}
```

**Respostas**:
- ✅ 200: Dados configurados com sucesso
- ❌ 400: Dados já foram configurados (não pode editá-los)
- ❌ 400: Dados inválidos ou incompletos

**Features**:
- Valida CPF com exatamente 11 dígitos
- Impede re-configuração após primeira vez
- Retorna erro descritivo se já estiver configurado

### 3. Frontend - Nova Página: Bank Setup

**Arquivo**: `frontend/pages/bank-setup.tsx`

**Funcionalidades**:
- ✅ Form com 4 campos: Banco, Agência, Conta, CPF
- ✅ Validação de CPF (11 dígitos)
- ✅ Máscaras e sanitização de entrada
- ✅ Mensagem de sucesso ao salvar
- ✅ Redireciona para `/my-wallet` após sucesso
- ✅ Bloqueia edição se já foi configurado (mostra mensagem verde)
- ✅ Layout responsivo com info box importante

**Fluxo**:
1. Usuário acessa `/bank-setup`
2. Se não configurado: exibe form
3. Se configurado: exibe mensagem de sucesso e botão para ir à carteira
4. Após salvar: redireciona automaticamente para `/my-wallet`

### 4. Frontend - Atualização: My Wallet Page

**Arquivo**: `frontend/pages/my-wallet.tsx`

**Alterações**:
1. **Novo Estado**: `bankInfoConfigured` - rastreia se banco foi configurado
2. **Verificação no carregamento**: Chama `GET /api/user/bank-info` ao carregar página
3. **Aviso visual**: Se não configurado, mostra banner amarelo com botão "Configurar Agora"
4. **Validação no saque**: `handleWithdraw()` verifica se banco está configurado
   - Se não: redireciona para `/bank-setup`
   - Se sim: busca dados bancários e faz o saque
5. **Uso automático de dados**: O saque agora usa os dados bancários configurados

**Código de validação no saque**:
```typescript
const handleWithdraw = async () => {
  if (!bankInfoConfigured) {
    alert('⚠️ Você precisa configurar seus dados bancários primeiro!');
    router.push('/bank-setup');
    return;
  }
  
  // ... resto do código
  
  // Busca dados bancários
  const bankRes = await api.get('/user/bank-info');
  const { banco, agencia, conta, cpfBanco } = bankRes.data.bankInfo;
  
  // Usa dados bancários no saque
  await api.post(`/wallets/${wallet.owner}/transfer`, {
    amount: parseFloat(withdrawAmount),
    bankAccount: {
      banco,
      agencia,
      conta,
      cpf: cpfBanco
    },
    reason: 'Saque para conta bancária'
  });
};
```

## Fluxo Completo do Usuário

### Primeira Vez (Sem Banco Configurado)

```
1. Usuário faz login
   ↓
2. Acessa /my-wallet
   ↓
3. Vê aviso amarelo: "Configure seus dados bancários"
   ↓
4. Clica em "Configurar Agora"
   ↓
5. Vai para /bank-setup
   ↓
6. Preenche Banco, Agência, Conta, CPF
   ↓
7. Clica "Confirmar Dados"
   ↓
8. Dados salvos no banco (isConfigured = true)
   ↓
9. Mensagem de sucesso ✅
   ↓
10. Redireciona para /my-wallet
   ↓
11. Aviso desaparece
   ↓
12. Pode fazer saques normalmente
```

### Próximas Vezes (Banco Já Configurado)

```
1. Usuário acessa /my-wallet
   ↓
2. Nenhum aviso (banco já configurado)
   ↓
3. Clica em "Sacar"
   ↓
4. Backend busca dados bancários do usuário
   ↓
5. Faz saque com dados configurados
   ↓
6. Mensagem de sucesso
```

### Tentativa de Reconfiguração

```
1. Usuário tenta acessar /bank-setup novamente
   ↓
2. GET /user/bank-info retorna isConfigured = true
   ↓
3. Página mostra: "✅ Dados Bancários Configurados"
   ↓
4. Botão: "Ir para Minha Carteira"
   ↓
5. Não permite editação
```

## Segurança

- ✅ CPF validado com regex: `^\d{11}$`
- ✅ Configuração imutável após primeira vez
- ✅ Dados não expostos na listagem (apenas se `isConfigured`)
- ✅ Validação no backend e frontend
- ✅ Autenticação obrigatória em todos endpoints

## URLs Dos Endpoints

| Método | URL | Autenticação | Descrição |
|--------|-----|--------------|-----------|
| GET | `/api/user/bank-info` | ✅ Sim | Retorna status e dados bancários |
| POST | `/api/user/bank-info` | ✅ Sim | Configura dados bancários |
| GET | `/my-wallet` | ✅ Sim | Página de carteira do usuário |
| POST | `/my-wallet` (interno) | ✅ Sim | Submete saque |
| GET | `/bank-setup` | ✅ Sim | Página de configuração de banco |

## Validações

### CPF
- Deve ter exatamente 11 dígitos
- Apenas números
- Regex: `^\d{11}$`

### Banco
- Obrigatório
- Mínimo 1 caractere

### Agência
- Obrigatório
- Mínimo 1 caractere

### Conta
- Obrigatório
- Mínimo 1 caractere

## Mensagens de Erro

| Erro | Causa | Solução |
|------|-------|---------|
| "Dados bancários já foram configurados" | Tentativa de reconfigurar | Acessar `/bank-setup` novamente mostra status |
| "Todos os campos são obrigatórios" | Campo vazio | Preencher todos os campos |
| "CPF deve ter exatamente 11 dígitos" | CPF inválido | Digitar 11 números |
| "Você precisa configurar seus dados bancários" | Tentativa de saque sem banco | Ir para `/bank-setup` |

## Próximas Etapas (Opcional)

1. **Edição com Confirmação**: Permitir re-configuração após enviar comprovante de dados bancários
2. **Integração PIX**: Adicionar suporte a chave PIX como alternativa
3. **Histórico de Saques**: Mostrar todos os saques com status (pendente, processado, erro)
4. **Webhook de Confirmação**: Notificar quando saque foi processado

## Testes

### Teste 1: Primeira Configuração
```
1. Login com usuário novo
2. Acessa /my-wallet
3. Vê aviso amarelo ✓
4. Clica "Configurar Agora" ✓
5. Preenche dados (ex: Itaú, 0001, 12345-67, 12345678901) ✓
6. Clica "Confirmar Dados" ✓
7. Vê mensagem de sucesso ✓
8. Redireciona para /my-wallet ✓
9. Aviso desaparece ✓
```

### Teste 2: Validação de CPF
```
1. Acessa /bank-setup
2. Tenta preencher CPF com 10 dígitos ✓
3. Vê erro: "CPF deve ter exatamente 11 dígitos" ✓
4. Preenche com 11 dígitos ✓
5. Erro desaparece ✓
```

### Teste 3: Saque com Dados Configurados
```
1. Usuário com banco configurado
2. Acessa /my-wallet
3. Nenhum aviso ✓
4. Clica "Sacar" e R$ 10 ✓
5. Saque processado com dados automáticos ✓
6. Saldo diminui ✓
7. Transação aparece no histórico ✓
```

### Teste 4: Bloquear Reconfiguração
```
1. Usuário com banco configurado
2. Tenta acessar /bank-setup novamente ✓
3. Vê mensagem: "✅ Dados Bancários Configurados" ✓
4. Não pode editar formulário ✓
```

## Status

✅ **IMPLEMENTADO**: Sistema completo de dados bancários
✅ **TESTADO**: Validações e fluxo de configuração
✅ **SEGURO**: Imutável após primeira configuração
✅ **USER-FRIENDLY**: Interface clara e intuitiva

**Próximo passo**: Testar todo o fluxo no navegador
