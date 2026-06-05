# 🚀 GUIA RÁPIDO: Testar Sistema de Dados Bancários

## 1️⃣ INICIALIZAR SERVIDORES

### Terminal 1 - Backend
```bash
cd d:\PROJETOS\Drop
npm run dev
# Espere pela mensagem: "Server running on port 4000"
```

### Terminal 2 - Frontend
```bash
cd d:\PROJETOS\Drop\frontend
npm run dev
# Espere pela mensagem: "ready - started server on 0.0.0.0:3000"
```

---

## 2️⃣ CRIAR NOVO USUÁRIO (ou usar existente)

### Opção A: Criar Novo
1. Acesse: `http://localhost:3000/login`
2. Clique em "Criar Conta"
3. Preencha:
   - Nome: "João Silva"
   - Email: "joao@example.com"
   - Senha: "123456"
4. Clique "Registrar"
5. Será criado automaticamente com wallet vazia

### Opção B: Usar Existente
- Qualquer usuário criado anteriormente funciona
- Verifique no banco se já tem `bankInfo` configurado

---

## 3️⃣ FLUXO DE TESTE #1: Primeira Configuração

### Passo 1: Acessar Carteira
```
URL: http://localhost:3000/my-wallet
Status: ✅ Deve estar logado
```

### Passo 2: Verificar Aviso
```
Esperado: Aviso amarelo aparece
Texto: "⚠️ Atenção: Você ainda não configurou seus dados bancários."
Botão: "Configurar Agora"
```

### Passo 3: Configurar Banco
```
1. Clique em "Configurar Agora"
2. Redireciona para: http://localhost:3000/bank-setup

Form Fields:
┌────────────────────────────┐
│ Nome do Banco *            │
│ [Banco Itaú]               │
│                            │
│ Agência *                  │
│ [0001]                     │
│                            │
│ Número da Conta *          │
│ [12345-67]                 │
│                            │
│ CPF (11 dígitos) *         │
│ [12345678901]              │
│                            │
│ [Voltar] [Confirmar]       │
└────────────────────────────┘
```

### Passo 4: Submeter
```
1. Preencha os 4 campos com dados acima
2. Clique em "✓ Confirmar Dados"
3. Botão muda para "⏳ Salvando..."
4. Aguarde 1-2 segundos
```

### Passo 5: Sucesso
```
Esperado: Mensagem verde
"✅ Dados bancários configurados com sucesso!"

Depois: Auto-redireciona para /my-wallet em ~2s
```

### Passo 6: Verificar
```
Na página /my-wallet:
❌ Aviso amarelo NÃO aparece mais ✅
✅ Saldo, histórico, e botões visíveis
```

---

## 4️⃣ FLUXO DE TESTE #2: Fazer Saque

### Passo 1: Adicionar Fundos
```
1. Se saldo = 0, clique em "Depositar"
2. Valor: 100.00
3. Clique "Confirmar Depósito"
4. Saldo agora: R$ 100.00
```

### Passo 2: Sacar
```
1. Clique em "🏧 Sacar"
2. Form aparece:
   💡 Saldo disponível: R$ 100.00
   
   Quanto deseja sacar?
   [50.00_______________]
   
   [✓ Confirmar Saque]
```

### Passo 3: Confirmar Saque
```
1. Preencha: 50.00
2. Clique em "✓ Confirmar Saque"
3. Botão muda para "⏳ Processando..."
4. Aguarde 1-2 segundos
```

### Passo 4: Resultado
```
Esperado: ✅ Saque realizado com sucesso!

Saldo agora: R$ 50.00

No histórico deve aparecer:
- type: debit
- amount: 50.00
- reason: "Saque para conta bancária"
```

---

## 5️⃣ FLUXO DE TESTE #3: Bloquear Reconfiguração

### Passo 1: Tentar Acessar `/bank-setup` de Novo
```
URL: http://localhost:3000/bank-setup
```

### Passo 2: Resultado
```
Esperado: Mensagem verde aparece
"✅ Dados Bancários Configurados"

"Seus dados bancários já foram configurados.
 Você será direcionado para sua carteira em breve..."

Button: "Ir para Minha Carteira"

NÃO mostra form para editar
```

### Passo 3: Verificar Imutabilidade
```
✅ Correto: Dados não podem ser re-configurados
✅ Correto: Apenas primeira configuração é permitida
```

---

## 6️⃣ VALIDAÇÕES PARA TESTAR

### Teste: CPF com 10 dígitos
```
1. Acesse /bank-setup (novo usuário)
2. CPF: "1234567890" (10 dígitos)
3. Clique "Confirmar"
Esperado: ❌ Erro em vermelho: "CPF deve ter exatamente 11 dígitos"
```

### Teste: Campo Vazio
```
1. Deixe "Banco" vazio
2. Clique "Confirmar"
Esperado: ❌ Erro em vermelho: "Banco é obrigatório"
```

### Teste: Saque sem Banco
```
1. Novo usuário (sem bankInfo)
2. Acesse /my-wallet
3. Clique em "Sacar"
Esperado: ❌ Alert: "⚠️ Você precisa configurar seus dados bancários primeiro!"
          → Redireciona para /bank-setup
```

### Teste: Saldo Insuficiente
```
1. Saldo: R$ 50.00
2. Tente sacar: R$ 100.00
Esperado: ❌ Erro: "❌ Saldo insuficiente"
          Botão "Confirmar Saque" fica desativado
```

---

## 7️⃣ VERIFICAR NO BANCO DE DADOS

### MongoDB Atlas - Documento User
```javascript
// Abra MongoDB Compass ou MongoDB Atlas Web

// Procure pela collection: users
// Encontre o documento do usuário

// Esperado:
{
  _id: ObjectId("..."),
  name: "João Silva",
  email: "joao@example.com",
  // ... outros campos
  
  // ✨ NOVO:
  bankInfo: {
    banco: "Banco Itaú",
    agencia: "0001",
    conta: "12345-67",
    cpfBanco: "12345678901",
    isConfigured: true  // ← Deve ser true
  }
}
```

### MongoDB - Documento Wallet
```javascript
// Collection: wallets

// Esperado após saque:
{
  _id: ObjectId("..."),
  owner: "69a5104...",
  ownerType: "user",
  balance: 50.00,  // Diminuiu em 50
  totalIncome: 100.00,
  totalSpent: 50.00,  // Aumentou em 50
  history: [
    {
      type: "credit",
      amount: 100,
      reason: "Carregamento de saldo via credit_card",
      date: ISODate("..."),
      reference: "DEP_..."
    },
    {
      type: "debit",
      amount: 50,
      reason: "Transferência para banco (Banco Itaú)",
      date: ISODate("..."),
      reference: "TRF_..."
    }
  ]
}
```

---

## 8️⃣ CHECKLIST RÁPIDO

```
✅ Sistema funcionando:
  [ ] Backend rodando em localhost:4000
  [ ] Frontend rodando em localhost:3000
  [ ] Sem erros no console

✅ Primeira Configuração:
  [ ] Aviso amarelo aparece em /my-wallet
  [ ] /bank-setup carrega formulário
  [ ] Validação de CPF funciona
  [ ] Dados salvam sem erro
  [ ] Redireciona para /my-wallet
  [ ] Aviso desaparece

✅ Saque:
  [ ] Depositou R$ 100.00
  [ ] Sacou R$ 50.00
  [ ] Saldo diminuiu
  [ ] Transação no histórico
  [ ] Dados bancários usados automaticamente

✅ Segurança:
  [ ] Não pode reconfigurar dados
  [ ] CPF validado corretamente
  [ ] Campos obrigatórios funcionam
  [ ] Saque redireciona se não configurado
  [ ] /bank-setup protegido (precisa autenticação)
```

---

## 9️⃣ TROUBLESHOOTING

### Problema: "Erro ao carregar dados bancários"
```
Solução:
1. Verifique se backend está rodando (localhost:4000)
2. Verifique se MongoDB está conectado
3. Recarregue a página (F5)
4. Limpe cache do navegador (Ctrl+Shift+Delete)
```

### Problema: "POST 400 - Bad Request"
```
Solução:
1. Verifique se CPF tem 11 dígitos
2. Verifique se todos campos estão preenchidos
3. Verifique se banco está configurado
4. Veja a resposta de erro no DevTools (F12)
```

### Problema: "Saque não reduz saldo"
```
Solução:
1. Recarregue página (F5)
2. Verifique se saque foi bem-sucedido (message ✅)
3. Verifique no MongoDB se transação foi registrada
4. Verifique console.error (F12)
```

### Problema: Aviso amarelo não aparece
```
Solução:
1. Verifique se GET /api/user/bank-info retorna isConfigured: false
2. Recarregue página
3. Verifique no MongoDB se bankInfo existe
4. Limpe localStorage (console: localStorage.clear())
```

---

## 🔟 PRÓXIMOS PASSOS

Depois de testar e validar:

1. [ ] Todos os testes passam
2. [ ] Nenhum erro no console
3. [ ] Dados persistem no banco
4. [ ] Fluxo é intuitivo
5. **👉 Então sistema está PRONTO PARA PRODUÇÃO**

---

## 📞 DÚVIDAS?

Documentação disponível:
- `BANK_INFO_QUICK_SUMMARY.md` - Resumo rápido
- `BANK_INFO_SETUP_COMPLETE.md` - Detalhes técnicos
- `BANK_INFO_VISUAL_FLOWS.md` - Fluxos visuais
- `BANK_INFO_TEST_CHECKLIST.md` - Checklist completo de testes

---

**Status**: ✅ Pronto para testar!

Boa sorte! 🚀
