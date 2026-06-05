# 🧪 GUIA COMPLETO DE TESTES - PHASE 15

**Data**: 2 de março de 2026  
**Objetivo**: Testar carteiras separadas por role  
**Tempo Estimado**: 10-15 minutos  
**Dificuldade**: ✅ Fácil (interface visual clara)

---

## 🎬 Cenários de Teste

### TESTE 1️⃣: Role Switch Funciona

**Objetivo**: Verificar se consegue alternar entre cliente e lojista

**Pré-requisitos:**
- Login feito como lojista
- Ter múltiplos roles (cliente + lojista)

**Passos:**

```
1. ✅ Abre página qualquer (/inicio, /my-wallet, etc)

2. ✅ Clica no menu (👤 seu nome) no navbar (canto superior direito)
   └─ Vê dropdown abrir

3. ✅ Procura seção "Ir para Cliente" ou "Ir para Lojista"
   └─ Vê que role atual está com fundo cinza (desabilitado)

4. ✅ Clica em "Ir para Lojista"
   └─ POST /auth/switch-role é chamado
   └─ Página recarrega
   └─ Console mostra: "🔄 Switching role to: lojista"

5. ✅ Depois de recarregar:
   └─ Verifica que activeRole mudou
   └─ Clica no menu novamente
   └─ Vê que "Ir para Lojista" está desabilitado (fundo cinza)
   └─ "Ir para Cliente" está habilitado

6. ✅ Clica em "Ir para Cliente"
   └─ Página recarrega novamente
   └─ Volta para cliente
```

**Esperado**: ✅ Consegue trocar entre roles sem erros

---

### TESTE 2️⃣: Carteira Muda Conforme Role

**Objetivo**: Verificar se busca a carteira correta baseado no role

**Pré-requisitos:**
- Estar logado como lojista
- Acessar página `/my-wallet`

**Passos:**

```
1. ✅ Login como lojista

2. ✅ Inicia como CLIENTE (activeRole='cliente')
   └─ Vai para /my-wallet
   └─ GET /wallets/my-wallet/by-role/cliente é chamado

3. ✅ Verifica saldo:
   └─ Mostra saldo da carteira de CLIENTE
   └─ Exemplo: R$ 1.000,00
   └─ Nota: Este é um saldo de comprador

4. ✅ Clica no navbar menu e escolhe "Ir para Lojista"
   └─ Página recarrega

5. ✅ Depois de recarregar:
   └─ GET /wallets/my-wallet/by-role/lojista é chamado
   └─ Verifica saldo:
   └─ Mostra saldo da carteira de LOJA (DIFERENTE!)
   └─ Exemplo: R$ 5.000,00
   └─ Nota: Este é o saldo de vendedor

6. ✅ Volta para cliente:
   └─ Clica em "Ir para Cliente"
   └─ GET /wallets/my-wallet/by-role/cliente é chamado
   └─ Saldo volta ao original: R$ 1.000,00 (não mudou!)
   └─ Prova que são carteiras separadas!
```

**Esperado**: ✅ Cada role mostra carteira diferente com saldos diferentes

---

### TESTE 3️⃣: Botões Mudam Conforme Role

**Objetivo**: Verificar se UI muda conforme ownerType

**Pré-requisitos:**
- Estar em `/my-wallet`
- Poder trocar entre roles

**Passos:**

**COMO CLIENTE:**
```
1. ✅ Certifique que está como cliente (activeRole='cliente')

2. ✅ Em /my-wallet, procure a seção de botões (meio da página)

3. ✅ Deve VER esses botões:
   ☑️ "💳 Depositar" (verde/azul)
   ☑️ "💸 Transferir" (verde/azul)

4. ✅ NÃO deve VER:
   ☐ "🏧 Sacar" (vermelho) - este é só para lojista!

5. ✅ NÃO deve VER:
   ☐ Aviso "⚠️ Configurar dados bancários" (isto é só para lojista)
```

**Switch para LOJISTA:**
```
6. ✅ Clica no navbar: "Ir para Lojista"
   └─ Página recarrega

7. ✅ Em /my-wallet, procure botões novamente

8. ✅ Deve VER:
   ☑️ "🏧 Sacar" (vermelho) - botão de saque
   ☑️ "⚠️ Configurar dados bancários" (amarelo) - se não configurado

9. ✅ NÃO deve VER:
   ☐ "💳 Depositar"
   ☐ "💸 Transferir"

10. ✅ Se já configurou dados bancários antes:
    └─ Não mostra mais aviso
    └─ Mostra só: "🏧 Sacar"
```

**Volta para CLIENTE:**
```
11. ✅ Clica em "Ir para Cliente"
    └─ Botões voltam: Depositar, Transferir
    └─ Sacar desaparece
    └─ Aviso de banco desaparece
```

**Esperado**: ✅ Botões mudam dinamicamente conforme role

---

### TESTE 4️⃣: Carteiras Isoladas (Sem Confusão)

**Objetivo**: Provar que transações em uma carteira NÃO afetam a outra

**Pré-requisitos:**
- Estar logado como lojista
- Ter saldo em ambas carteiras (cliente e loja)

**Passos:**

**PARTE 1: Operação como CLIENTE**
```
1. ✅ Login como lojista

2. ✅ Vai para /my-wallet
   └─ Activeole = 'cliente'
   └─ Vê carteira de cliente: R$ 1.000

3. ✅ Clica em "💳 Depositar"
   └─ Abre modal de depósito

4. ✅ Faz um depósito de R$ 100
   └─ Submete formulário
   └─ POST /wallets/{userId}/credit chamado
   └─ Carteira de cliente atualiza para: R$ 1.100
   └─ Vê no histórico: "+R$ 100 - Depósito"

5. ✅ ANOTA O SALDO DE CLIENTE: R$ 1.100
```

**PARTE 2: Switch para LOJISTA**
```
6. ✅ Clica no navbar: "Ir para Lojista"
   └─ Página recarrega

7. ✅ Em /my-wallet, verifica carteira de loja:
   └─ Saldo: R$ 5.000 (não foi afetado!)
   └─ Histórico: Mostra vendas, não o depósito que fez
   └─ Prova: Carteiras são separadas!

8. ✅ Faz um saque de R$ 200:
   └─ Clica em "🏧 Sacar"
   └─ Submete saque
   └─ Carteira de loja atualiza para: R$ 4.800
   └─ Vê no histórico: "-R$ 200 - Saque"

9. ✅ ANOTA O SALDO DE LOJA: R$ 4.800
```

**PARTE 3: Volta para CLIENTE**
```
10. ✅ Clica em "Ir para Cliente"
    └─ Página recarrega

11. ✅ Verifica saldo de cliente:
    └─ AINDA R$ 1.100 (não mudou!)
    └─ Depósito que fez continua lá
    └─ Histórico: Não mostra o saque da loja
    └─ Prova: Carteiras totalmente isoladas!

12. ✅ Volta para lojista:
    └─ Saldo de loja: AINDA R$ 4.800
    └─ Prova: Cada carteira mantém seu estado
```

**Esperado**: ✅ Transações em uma carteira não afetam a outra

---

### TESTE 5️⃣: Histórico Isolado

**Objetivo**: Verificar se histórico de transações é separado por role

**Pré-requisitos:**
- Ter feito algumas transações em ambas carteiras

**Passos:**

**COMO CLIENTE:**
```
1. ✅ Login e vai para /my-wallet como cliente

2. ✅ Procura a seção de "Histórico" ou "Transações"
   └─ Deve mostrar APENAS transações de cliente:
      ✅ Depósitos
      ✅ Compras
      ✅ Transferências
   
3. ✅ NÃO deve mostrar:
      ☐ Vendas (estas são da loja)
      ☐ Saques (estas são da loja)
```

**COMO LOJISTA:**
```
4. ✅ Switch para lojista: "Ir para Lojista"

5. ✅ Em /my-wallet, verifica histórico:
   └─ Deve mostrar APENAS transações de loja:
      ✅ Vendas
      ✅ Saques
      ✅ Repasses (comissões)
   
6. ✅ NÃO deve mostrar:
      ☐ Depósitos do cliente
      ☐ Compras do cliente
      ☐ Transferências do cliente
```

**Esperado**: ✅ Histórico totalmente separado por role

---

## 🐛 Possíveis Problemas e Soluções

### ❌ Problema: Dropdown de role switcher não aparece

**Solução:**
```
1. Verifica se user tem multiple roles (roles array com +1 item)
2. Se só tem 1 role, dropdown não aparece (é normal!)
3. Verifica console do navegador se há erros
4. Tenta recarregar página (F5)
5. Faz logout e login novamente
```

### ❌ Problema: Ao clicar "Ir para Role", nada acontece

**Solução:**
```
1. Verifica console do navegador (F12) procurando erros
2. Abre aba "Network" do DevTools
3. Procura a request: POST /auth/switch-role
4. Verifica se retorna status 200 ou erro
5. Se erro 403: User não tem esse role
6. Se erro 500: Problema no servidor
7. Tenta chamar endpoint manualmente via Postman:
   POST http://localhost:4000/api/auth/switch-role
   Header: Authorization: Bearer {token}
   Body: { "newRole": "lojista" }
```

### ❌ Problema: Mostra mesma carteira para ambos roles

**Solução:**
```
1. Verifica no console se GET /wallets/my-wallet/by-role/:role é chamado
2. Abre DevTools → Network → Procura requests para /wallets/my-wallet
3. Verifica se URL tem o role correto (by-role/cliente vs by-role/lojista)
4. Verifica no console backend se está recebendo role parâmetro
5. Verifica se User tem storeId (necessário para buscar carteira de loja)
6. Testa endpoint manualmente:
   GET http://localhost:4000/api/wallets/my-wallet/by-role/lojista
   Header: Authorization: Bearer {token}
```

### ❌ Problema: Botões não mudam

**Solução:**
```
1. Verifica se wallet retornado tem campo ownerType
2. DevTools → Console → verifica valor de wallet.ownerType
3. Se undefined: problema no backend ao retornar carteira
4. Verifica se componente my-wallet.tsx está renderizando corretamente
5. Tenta fazer um hard refresh (Ctrl+Shift+R)
```

---

## ✅ Checklist de Testes

```
TESTE 1: Role Switch
☑️ Consegue trocar de cliente para lojista
☑️ Consegue trocar de lojista para cliente
☑️ Página recarrega após trocar
☑️ Menu mostra role correto como desabilitado

TESTE 2: Carteira Dinâmica
☑️ Carteira de cliente mostra saldo diferente da loja
☑️ Ao trocar role, carteira muda
☑️ Saldos de cada carteira são preservados

TESTE 3: Botões
☑️ Cliente vê: Depositar, Transferir
☑️ Cliente NÃO vê: Sacar
☑️ Lojista vê: Sacar
☑️ Lojista NÃO vê: Depositar, Transferir
☑️ Aviso de banco só aparece para lojista

TESTE 4: Transações Isoladas
☑️ Depósito como cliente não afeta carteira de loja
☑️ Saque como lojista não afeta carteira de cliente
☑️ Cada carteira mantém seu saldo independente

TESTE 5: Histórico
☑️ Cliente vê só transações de cliente
☑️ Lojista vê só transações de loja
☑️ Históricos não se misturam

COMPILAÇÃO
☑️ Nenhum erro TypeScript
☑️ Nenhum warning
☑️ Aplicação compila sem problemas
```

---

## 📊 Resultado Esperado

Se tudo funcionar, você verá:

### ✅ Quando CLIENTE:
```
┌────────────────────────────────┐
│ MINHA CARTEIRA - CLIENTE       │
├────────────────────────────────┤
│ Saldo: R$ 1.100                │
├────────────────────────────────┤
│ Botões:                        │
│ [💳 Depositar] [💸 Transferir]  │
│                                │
│ Histórico:                     │
│ • Depósito +R$ 100             │
│ • Compra no pedido -R$ 50      │
└────────────────────────────────┘
```

### ✅ Quando LOJISTA:
```
┌────────────────────────────────┐
│ MINHA CARTEIRA - LOJA          │
├────────────────────────────────┤
│ Saldo: R$ 4.800                │
├────────────────────────────────┤
│ ⚠️ Configurar dados bancários   │
│    (se não configurado)        │
├────────────────────────────────┤
│ Botões:                        │
│ [🏧 Sacar]                     │
│                                │
│ Histórico:                     │
│ • Venda cliente X +R$ 45       │
│ • Saque -R$ 200                │
└────────────────────────────────┘
```

---

## 🎯 Próximos Passos Após Testar

1. **Se tudo funcionou**: ✅ Ambiente pronto para produção
2. **Se encontrou bug**: 📝 Documenta exatamente o que falhou
3. **Se falha específica**: 🔧 Debugga seguindo guia de soluções acima

---

**BOA SORTE COM OS TESTES!** 🚀
