# ✅ Checklist de Testes: Sistema de Dados Bancários

## TESTE 1: Primeira Configuração (Usuário Novo)

- [ ] 1.1 - Login com usuário que não tem bankInfo configurado
- [ ] 1.2 - Acessar `/my-wallet`
- [ ] 1.3 - Verificar se aviso amarelo aparece: "Configure seus dados bancários"
- [ ] 1.4 - Clicar em "Configurar Agora"
- [ ] 1.5 - Redireciona para `/bank-setup`
- [ ] 1.6 - Form mostra 4 campos: Banco, Agência, Conta, CPF
- [ ] 1.7 - Preencher com dados válidos:
  - [ ] Banco: "Banco Itaú"
  - [ ] Agência: "0001"
  - [ ] Conta: "12345-67"
  - [ ] CPF: "12345678901"
- [ ] 1.8 - Clicar "Confirmar Dados"
- [ ] 1.9 - Ver mensagem de sucesso: "✅ Dados bancários configurados..."
- [ ] 1.10 - Redirecionar automaticamente para `/my-wallet` em ~2 segundos
- [ ] 1.11 - Aviso amarelo desaparece
- [ ] 1.12 - Verificar no banco de dados que `User.bankInfo.isConfigured === true`

---

## TESTE 2: Validação de CPF

- [ ] 2.1 - Acessar `/bank-setup` (antes de configurar)
- [ ] 2.2 - Preencher CPF com 10 dígitos: "1234567890"
- [ ] 2.3 - Ver erro em vermelho: "CPF deve ter exatamente 11 dígitos"
- [ ] 2.4 - Preencher com 12 dígitos: "123456789012"
- [ ] 2.5 - Texto deve ser truncado para 11: "12345678901"
- [ ] 2.6 - Preencher com letras: "abcdefghijk"
- [ ] 2.7 - Letras devem ser removidas (apenas números)
- [ ] 2.8 - Preencher com 11 números válidos: "12345678901"
- [ ] 2.9 - Erro desaparece
- [ ] 2.10 - Pode clicar "Confirmar Dados"

---

## TESTE 3: Validação de Campos Obrigatórios

- [ ] 3.1 - Acessar `/bank-setup`
- [ ] 3.2 - Deixar campo "Banco" vazio
- [ ] 3.3 - Clicar "Confirmar Dados"
- [ ] 3.4 - Ver erro: "Banco é obrigatório"
- [ ] 3.5 - Repetir para os campos: Agência, Conta, CPF
- [ ] 3.6 - Cada campo deve ter validação independente
- [ ] 3.7 - Erros desaparecem ao começar a digitar

---

## TESTE 4: Bloquear Reconfiguração

- [ ] 4.1 - Usuário com bankInfo já configurado
- [ ] 4.2 - Acessar `/bank-setup`
- [ ] 4.3 - Ver mensagem: "✅ Dados Bancários Configurados"
- [ ] 4.4 - Form não aparece
- [ ] 4.5 - Botão "Ir para Minha Carteira" aparece
- [ ] 4.6 - Clicar botão redireciona para `/my-wallet`
- [ ] 4.7 - Tentar acessar a rota diretamente novamente
- [ ] 4.8 - Mesmo resultado: mostra mensagem de sucesso

---

## TESTE 5: Saque com Dados Configurados

- [ ] 5.1 - Usuário com bank-info configurado
- [ ] 5.2 - Acessar `/my-wallet`
- [ ] 5.3 - Verificar que NÃO há aviso amarelo
- [ ] 5.4 - Verificar que saldo é maior que 0 (adicionar fundos se necessário)
- [ ] 5.5 - Clicar em "Sacar"
- [ ] 5.6 - Form aparece com campo de valor
- [ ] 5.7 - Mostrar "Saldo disponível: R$ XXX.XX"
- [ ] 5.8 - Preencher valor: "10.00"
- [ ] 5.9 - Clicar "Confirmar Saque"
- [ ] 5.10 - Ver mensagem: "✅ Saque realizado com sucesso!"
- [ ] 5.11 - Saldo diminui em R$ 10.00
- [ ] 5.12 - Transação aparece no histórico com:
  - [ ] type: "debit"
  - [ ] amount: 10.00
  - [ ] reason: "Saque para conta bancária"
- [ ] 5.13 - Verificar no MongoDB que saque foi registrado

---

## TESTE 6: Validação de Saldo no Saque

- [ ] 6.1 - Saldo da carteira: R$ 50.00
- [ ] 6.2 - Tentar sacar: R$ 100.00
- [ ] 6.3 - Ver erro: "❌ Saldo insuficiente"
- [ ] 6.4 - Botão "Confirmar Saque" fica desativado (cinza)
- [ ] 6.5 - Tentar sacar: R$ 50.00 (máximo disponível)
- [ ] 6.6 - Deve funcionar normalmente
- [ ] 6.7 - Saldo final: R$ 0.00

---

## TESTE 7: Saque sem Banco Configurado

- [ ] 7.1 - Usuário SEM bank-info configurado
- [ ] 7.2 - Acessar `/my-wallet`
- [ ] 7.3 - Ver aviso amarelo
- [ ] 7.4 - Clicar em "Sacar"
- [ ] 7.5 - Alert: "⚠️ Você precisa configurar seus dados bancários primeiro!"
- [ ] 7.6 - Redireciona para `/bank-setup`

---

## TESTE 8: Depósito (Verificação Rápida)

- [ ] 8.1 - Acessar `/my-wallet`
- [ ] 8.2 - Saldo inicial: R$ 0.00
- [ ] 8.3 - Clicar em "Depositar"
- [ ] 8.4 - Preencher: R$ 50.00
- [ ] 8.5 - Clicar "Confirmar Depósito"
- [ ] 8.6 - Ver mensagem: "✅ Depósito realizado com sucesso!"
- [ ] 8.7 - Saldo agora: R$ 50.00
- [ ] 8.8 - Transação no histórico com type: "credit"

---

## TESTE 9: Transferência entre Usuários

- [ ] 9.1 - Usuário A com saldo: R$ 100.00
- [ ] 9.2 - Usuário B com saldo: R$ 0.00
- [ ] 9.3 - Usuário A clica "Transferir"
- [ ] 9.4 - Preenche: destinatário e R$ 30.00
- [ ] 9.5 - Clica "Confirmar Transferência"
- [ ] 9.6 - Mensagem de sucesso
- [ ] 9.7 - Usuário A: saldo agora R$ 70.00
- [ ] 9.8 - Usuário B: saldo agora R$ 30.00
- [ ] 9.9 - Ambos veem transação no histórico

---

## TESTE 10: Persistência de Dados Bancários

- [ ] 10.1 - Configurar bank-info com dados X
- [ ] 10.2 - Logout
- [ ] 10.3 - Login novamente
- [ ] 10.4 - Acessar `/my-wallet`
- [ ] 10.5 - Aviso desapareceu (banco já configurado)
- [ ] 10.6 - Fazer saque
- [ ] 10.7 - Verificar que usa dados X (não dados padrão)

---

## TESTE 11: Responsividade - Mobile

- [ ] 11.1 - Acessar `/bank-setup` em mobile (landscape)
- [ ] 11.2 - Form aparece legível
- [ ] 11.3 - Campos não tem scroll horizontal
- [ ] 11.4 - Botões aparecem lado a lado ou empilhados
- [ ] 11.5 - Labels e inputs bem alinhados
- [ ] 11.6 - Acessar `/my-wallet` em mobile
- [ ] 11.7 - Aviso amarelo aparece bem
- [ ] 11.8 - Saldo e buttons responsivos

---

## TESTE 12: Mensagens de Erro (Edge Cases)

- [ ] 12.1 - Tentar submeter com campos vazios
  - [ ] Erro: "Banco é obrigatório"
  - [ ] Erro: "Agência é obrigatória"
  - [ ] Erro: "Conta é obrigatória"
  - [ ] Erro: "CPF é obrigatório"
- [ ] 12.2 - CPF com caracteres especiais
  - [ ] Deve remover automaticamente
- [ ] 12.3 - Submeter com CPF inválido (10 dígitos)
  - [ ] Erro: "CPF deve ter exatamente 11 dígitos"
- [ ] 12.4 - Recarregar durante POST
  - [ ] Deve manter os dados no form (não perder input)

---

## TESTE 13: Estado de Carregamento (Loading)

- [ ] 13.1 - Ao submeter formulário
  - [ ] Botão muda para: "⏳ Salvando..."
  - [ ] Botão fica desativado
  - [ ] Inputs ficam desativados
- [ ] 13.2 - Ao fazer saque
  - [ ] Botão muda para: "⏳ Processando..."
  - [ ] Botão fica desativado
  - [ ] Input fica desativado
- [ ] 13.3 - Ao recarregar `/my-wallet`
  - [ ] Mostra: "⏳ Carregando sua carteira..."

---

## TESTE 14: Navegação

- [ ] 14.1 - `/bank-setup` com usuário não autenticado
  - [ ] Redireciona para `/login`
- [ ] 14.2 - `/my-wallet` com usuário não autenticado
  - [ ] Redireciona para `/login`
- [ ] 14.3 - Clicar "Voltar" em `/bank-setup`
  - [ ] Vai para `/my-wallet`
- [ ] 14.4 - Usar botão voltar do navegador
  - [ ] Histórico mantido

---

## TESTE 15: API Endpoints (Postman/Insomnia)

### GET /api/user/bank-info (Não Configurado)
```json
REQUEST:
GET /api/user/bank-info
Authorization: Bearer {token}

RESPONSE (200):
{
  "isConfigured": false,
  "bankInfo": null
}
```

- [ ] 15.1 - Testar GET sem token → 401
- [ ] 15.2 - Testar GET com token inválido → 401
- [ ] 15.3 - Testar GET com token válido → 200

### POST /api/user/bank-info (Primeira Vez)
```json
REQUEST:
POST /api/user/bank-info
Authorization: Bearer {token}
Content-Type: application/json

{
  "banco": "Banco Itaú",
  "agencia": "0001",
  "conta": "12345-67",
  "cpfBanco": "12345678901"
}

RESPONSE (200):
{
  "success": true,
  "message": "Dados bancários configurados com sucesso",
  "bankInfo": {
    "banco": "Banco Itaú",
    "agencia": "0001",
    "conta": "12345-67"
  }
}
```

- [ ] 15.4 - Testar POST com dados válidos → 200
- [ ] 15.5 - Testar POST sem token → 401
- [ ] 15.6 - Testar POST com campo vazio → 400
- [ ] 15.7 - Testar POST com CPF inválido → 400

### POST /api/user/bank-info (Segunda Vez - Reconfiguração)
```json
RESPONSE (400):
{
  "error": "Dados bancários já foram configurados. Não é possível editá-los novamente."
}
```

- [ ] 15.8 - Testar POST segunda vez → 400
- [ ] 15.9 - Verificar mensagem de erro exata

### GET /api/user/bank-info (Após Configuração)
```json
RESPONSE (200):
{
  "isConfigured": true,
  "bankInfo": {
    "banco": "Banco Itaú",
    "agencia": "0001",
    "conta": "12345-67",
    "cpfBanco": "12345678901"
  }
}
```

- [ ] 15.10 - Testar GET após configuração → retorna dados

### POST /api/wallets/{userId}/transfer (Saque)
```json
REQUEST:
POST /api/wallets/{userId}/transfer
Authorization: Bearer {token}
Content-Type: application/json

{
  "amount": 10.00,
  "bankAccount": {
    "banco": "Banco Itaú",
    "agencia": "0001",
    "conta": "12345-67",
    "cpf": "12345678901"
  },
  "reason": "Saque para conta bancária"
}

RESPONSE (200):
{
  "success": true,
  "newBalance": 40.00,
  "transferId": "TRF_1741000000000",
  "status": "pending"
}
```

- [ ] 15.11 - Testar saque com dados válidos → 200
- [ ] 15.12 - Testar saque com saldo insuficiente → 400
- [ ] 15.13 - Testar saque sem bankAccount → 400

---

## TESTE 16: Console Errors/Warnings

- [ ] 16.1 - Abrir DevTools (F12)
- [ ] 16.2 - Acessar `/bank-setup`
- [ ] 16.3 - Nenhum erro vermelho no console
- [ ] 16.4 - Nenhum warning alarmente
- [ ] 16.5 - Acessar `/my-wallet`
- [ ] 16.6 - Nenhum erro vermelho no console

---

## TESTE 17: Performance

- [ ] 17.1 - `/bank-setup` carrega em < 2s
- [ ] 17.2 - `/my-wallet` carrega em < 2s
- [ ] 17.3 - POST bank-info responde em < 1s
- [ ] 17.4 - POST saque responde em < 2s
- [ ] 17.5 - Nenhuma requisição duplicada

---

## ✅ RESUMO

| Teste | Status | Data |
|-------|--------|------|
| 1 - Primeira Configuração | [ ] | |
| 2 - Validação de CPF | [ ] | |
| 3 - Validação de Campos | [ ] | |
| 4 - Bloquear Reconfiguração | [ ] | |
| 5 - Saque com Dados | [ ] | |
| 6 - Validação de Saldo | [ ] | |
| 7 - Saque sem Banco | [ ] | |
| 8 - Depósito | [ ] | |
| 9 - Transferência | [ ] | |
| 10 - Persistência | [ ] | |
| 11 - Mobile | [ ] | |
| 12 - Mensagens de Erro | [ ] | |
| 13 - Loading States | [ ] | |
| 14 - Navegação | [ ] | |
| 15 - Endpoints | [ ] | |
| 16 - Console | [ ] | |
| 17 - Performance | [ ] | |

**Total de Testes**: 73+

---

## 🎯 OBJETIVO

Após marcar TODOS os testes como ✅, o sistema de dados bancários estará pronto para produção!

**Status Atual**: ⏳ Aguardando testes
