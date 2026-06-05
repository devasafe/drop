# 💬 Arquitetura Completa de Chat - Drop Marketplace

## 📋 Mapa de Comunicação

```
┌─────────────────────────────────────────────────────────────────┐
│                      DROP MARKETPLACE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CLIENTE (usuário que compra)                                  │
│     ▲                                                           │
│     │ Chat sobre:                                              │
│     │ - Dúvidas sobre produtos                                 │
│     │ - Status do pedido                                       │
│     │ - Devoluções/Reclamações                                 │
│     │                                                           │
│  ┌──┴──┐                    ┌───────┐                          │
│  │LOJA │◄──────Chat────────►│MOTOBOY│                          │
│  └──┬──┘                    └───┬───┘                          │
│     │                           │                               │
│     │ Chat sobre:               │ Chat sobre:                   │
│     │ - Clarificar itens        │ - Localização                 │
│     │ - PIN de retirada         │ - Mudança de endereço         │
│     │ - Recusas de pedido        │ - Problema com entrega       │
│     │ - Problemas de preparo     │ - Contato na hora            │
│     │                           │                               │
│     └───────────┬───────────────┘                              │
│                 │                                               │
│             CLIENTE (entrega)                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 CASO 1: LOJA ↔ USUARIO (Cliente)

### Contexto Geral
Comunicação entre o proprietário da loja e o cliente que comprou.

### 📍 Quando é Necessário

#### **1.1 - ANTES DO PEDIDO CHEGAR NA LOJA**
**Momento:** Cliente criou pedido, ainda esperando loja aceitar
**Motivo:** Dúvidas sobre disponibilidade
```
Cliente:  "Vocês têm este produto em estoque?"
Loja:     "Temos sim! Será preparado em 10min"
Cliente:  "Perfeito!"
```

**Ações no Sistema:**
- Cliente vê chat icon na página de pedido
- Loja vê chat icon no dashboard
- Mensagens salvas no banco de dados

#### **1.2 - PEDIDO ACEITO, SENDO PREPARADO**
**Momento:** Loja aceitou o pedido, motoboy ainda não atribuído
**Motivo:** Cliente quer saber se está pronto / Loja avisa atraso
```
Loja:     "Seu pedido está sendo preparado"
Cliente:  "Quanto tempo?"
Loja:     "5 minutos! Motoboy já vem"
Cliente:  "Ok, obrigado!"
```

**Ações no Sistema:**
- Loja pode enviar status em tempo real
- Cliente pode perguntar sobre andamento
- Estimativa de entrega

#### **1.3 - PROBLEMA NO PEDIDO**
**Momento:** Qualquer hora (antes ou depois)
**Motivo:** Item faltando / Diferente do pedido / Dano no transporte
```
Cliente:  "Recebi a pizza queimada"
Loja:     "Desculpe! Enviaremos outra agora"
Cliente:  "Obrigado"
```

**Ações no Sistema:**
- Abrir devolução/reclamação
- Comunicação em tempo real
- Registro para análise

#### **1.4 - DÚVIDA SOBRE O PRODUTO**
**Momento:** Antes de confirmar o pedido
**Motivo:** Especificações / Sabor / Tamanho / Customizações
```
Cliente:  "A pizza grande é o tamanho G ou maior?"
Loja:     "A grande tem 40cm, a maior tem 50cm"
Cliente:  "Ok, grande mesmo"
```

**Ações no Sistema:**
- Chat antes de checkout
- Evita problemas de expectativa
- Reduz devoluções

---

## 🚚 CASO 2: LOJA ↔ MOTOBOY

### Contexto Geral
Comunicação entre o proprietário da loja e o motoboi que vai buscar o pedido.

### 📍 Quando é Necessário

#### **2.1 - MOTOBOY CHEGOU NA LOJA, PRECISA BUSCAR**
**Momento:** Motoboy aceitou entrega, está a caminho da loja
**Motivo:** Confirmar presença / Localizar a loja
```
Motoboy:  "Cheguei. Onde faço a retirada?"
Loja:     "Porta de trás, pede por João"
Motoboy:  "Pronto, vou lá"
```

**Ações no Sistema:**
- Chat aberto automaticamente quando motoboy chega perto
- Loja recebe notificação
- PIN de retirada pode ser compartilhado por aqui

#### **2.2 - LOJA NÃO TERMINOU O PEDIDO A TEMPO**
**Momento:** Motoboy chegou mas pedido não está pronto
**Motivo:** Atraso na preparação / Falta de ingredientes
```
Loja:     "Desculpe, pedido ainda está em preparo"
Motoboy:  "Quanto tempo?"
Loja:     "Uns 5 minutos"
Motoboy:  "Ok, aguardar aqui"
```

**Ações no Sistema:**
- Registra atraso
- Afeta avaliação da loja
- Pode gerar bônus para motoboy por espera

#### **2.3 - PROBLEMA COM O ITEM NO PEDIDO**
**Momento:** Motoboy chegou e vê item errado/danificado
**Motivo:** Verificação de qualidade antes de sair
```
Motoboy:  "Esta bebida veio aberta"
Loja:     "Desculpe! Vou trocar agora"
Motoboy:  "Ok, obrigado"
```

**Ações no Sistema:**
- Previne que motoboy saia com pedido danificado
- Evita reclamação do cliente
- Responsabilidade clara

#### **2.4 - ENDEREÇO CONFUSO / INACESSÍVEL**
**Momento:** Motoboy está saindo da loja
**Motivo:** Pedido com entrega difícil de localizar
```
Motoboy:  "O cliente está em um prédio fechado"
Loja:     "Aqui está o número do apartamento: 502"
Motoboy:  "Obrigado!"
```

**Ações no Sistema:**
- Chat com contexto de localização
- Foto de referência pode ser enviada
- Reduz erros de entrega

#### **2.5 - DEVOLUÇÕES / CANCELAMENTOS**
**Momento:** Motoboy chega e loja quer cancelar entrega
**Motivo:** Cliente pediu cancelamento / Produto indisponível
```
Loja:     "Este pedido foi cancelado pelo cliente"
Motoboy:  "Ok, retorno para loja?"
Loja:     "Não, descarte mesmo"
```

**Ações no Sistema:**
- Comunicação de mudança de status
- Documentação de devolução
- Registro de cancelamento

---

## 👤 CASO 3: MOTOBOY ↔ USUARIO (Cliente)

### Contexto Geral
Comunicação entre o motoboi que faz a entrega e o cliente que a recebe.

### 📍 Quando é Necessário

#### **3.1 - MOTOBOY A CAMINHO, ETA PODE MUDAR**
**Momento:** Motoboy aceitou, deixou a loja, indo pro cliente
**Motivo:** Atrasos / Congestionamento / Rota fechada
```
Motoboy:  "Estou a 5min de você"
Cliente:  "Ótimo!"
Motoboy:  "Aí congestionamento, agora 10min"
Cliente:  "Ok, sem pressa"
```

**Ações no Sistema:**
- Notificação em tempo real
- GPS compartilhado (opcional)
- Atualizações de ETA automáticas

#### **3.2 - CLIENTE NÃO ESTÁ EM CASA / NÃO ATENDE**
**Momento:** Motoboy chega no endereço, ninguém atende
**Motivo:** Cliente saiu / Adormeceu / Número errado
```
Motoboy:  "Ninguém atendeu na porta"
Cliente:  "Desculpe! Estou aqui agora"
Motoboy:  "Ok, subindo"
```

**Ações no Sistema:**
- Tentativas de entrega registradas
- Após 3 tentativas: devolver para loja
- Chat como primeira tentativa de contato

#### **3.3 - ENDERECO INCORRETO / INCOMPLETO**
**Momento:** Motoboy chegou e endereço está diferente
**Motivo:** Falta de número / Referência errada / Endereço incompleto
```
Motoboy:  "O endereço diz R. A, 123 mas não existe número 123"
Cliente:  "Perdão! É 125, do lado esquerdo"
Motoboy:  "Achou! Chegando"
```

**Ações no Sistema:**
- Chat com geolocalização
- Foto de referência
- Registra dados incorretos do cadastro

#### **3.4 - CLIENTE QUER MUDAR ENDERECO NA ULTIMA HORA**
**Momento:** Motoboy já está a caminho ou próximo
**Motivo:** Mudança de planos / Estava em outro local
```
Cliente:  "Pode entregar no escritório em vez de casa?"
Motoboy:  "Sim, qual é o endereço?"
Cliente:  "Avenida X, sala 300"
Motoboy:  "Verifico se fica mais caro"
```

**Ações no Sistema:**
- Reajuste de taxa se necessário
- Novo ponto no mapa
- ETA recalculado

#### **3.5 - PEDIDO COM PROBLEMA (Danificado/Falta Item)**
**Momento:** Cliente recebe o pedido
**Motivo:** Dano no transporte / Loja esqueceu algo
```
Cliente:  "A pizza veio com a caixa amassada"
Motoboy:  "Desculpe! Vou informar a loja"
Cliente:  "Ok, obrigado"
```

**Ações no Sistema:**
- Documentar problema
- Foto de comprovação
- Iniciar processo de devolução

#### **3.6 - CLIENTE PEDE PARA MOTOBOY FAZER ALGO EXTRA**
**Momento:** Motoboy próximo ou chegando
**Motivo:** Subir/descer escadas / Levar para apartamento / Esperar
```
Cliente:  "Você consegue deixar na cozinha?"
Motoboy:  "Sim, sem problema"
```

**Ações no Sistema:**
- Registrar pedido extra
- Bônus para motoboy se aceitar
- Reclamação se recusar sem motivo

#### **3.7 - CLIENTE QUER CONHECER O MOTOBOY**
**Momento:** Antes da entrega
**Motivo:** Rating / Recomendação / Avaliação antecipada
```
Cliente:  "Qual é a avaliação do motoboy?"
Sistema:  "⭐ 4.8 (150 entregas)"
Cliente:  "Ótimo!"
```

**Ações no Sistema:**
- Mostrar perfil do motoboy
- Rating e número de entregas
- Horário de chegada estimado

---

## 📊 TABELA COMPARATIVA: QUANDO USAR CHAT

| Situação | Loja↔Cliente | Loja↔Motoboy | Motoboy↔Cliente |
|----------|:---:|:---:|:---:|
| **Dúvida sobre produto** | ✅ | ❌ | ❌ |
| **Status do pedido** | ✅ | ✅ | ✅ |
| **PIN de retirada** | ❌ | ✅ | ❌ |
| **Endereço confuso** | ❌ | ✅ | ✅ |
| **Motoboy atrasado** | ❌ | ❌ | ✅ |
| **Pedido com problema** | ✅ | ✅ | ✅ |
| **Cancelamento** | ✅ | ✅ | ✅ |
| **ETA/Localização** | ❌ | ❌ | ✅ |
| **Pedido incompleto** | ✅ | ✅ | ✅ |
| **Clarificar detalhes** | ✅ | ❌ | ✅ |

---

## 🔄 FLUXO DE PEDIDO COM CHAT INTEGRADO

```
T+0min:  CLIENTE cria pedido
         ↓
         [💬 CHAT LOJA↔CLIENTE ABRE]
         ├─ Cliente: "Vocês têm este item?"
         └─ Loja: "Temos! Será rápido"
         
T+2min:  LOJA ACEITA PEDIDO
         ↓
         [💬 CHAT LOJA↔MOTOBOY ABRE]
         ├─ Sistema: Motoboy vê disponível
         └─ Motoboy: Aceita entrega
         
T+5min:  MOTOBOY ACEITA ENTREGA
         ↓
         [💬 CHAT MOTOBOY↔CLIENTE ABRE]
         ├─ Motoboy: "Saindo de moto!"
         └─ Cliente: "Ótimo!"
         
T+10min: MOTOBOY CHEGA NA LOJA
         ↓
         [💬 CHAT LOJA↔MOTOBOY INTENSO]
         ├─ Loja: "Seu pedido está pronto"
         ├─ Motoboy: "Pegando aqui"
         └─ Loja: "PIN é 12345"
         
T+15min: MOTOBOY SENTE LOJA
         ↓
         [💬 CHAT MOTOBOY↔CLIENTE ATUALIZA ETA]
         ├─ Motoboy: "Saí da loja"
         └─ Cliente: "Ótimo, estou esperando"
         
T+25min: MOTOBOY CHEGA NO CLIENTE
         ↓
         [💬 CHAT MOTOBOY↔CLIENTE INTENSO]
         ├─ Motoboy: "Cheguei"
         ├─ Cliente: "Um segundo"
         ├─ Motoboy: "Entreguei"
         └─ Cliente: "Obrigado!"
         
T+26min: ENTREGA CONCLUÍDA
         ↓
         [💬 CHAT LOJA↔CLIENTE]
         ├─ Sistema: Abre avaliação
         └─ Cliente pode deixar feedback
```

---

## 🎨 CASOS DE USO PRIORITÁRIOS (MVP)

### Fase 1: CRÍTICO (Implementar primeiro)
- [ ] **Motoboy ↔ Cliente:** ETA em tempo real
- [ ] **Motoboy ↔ Cliente:** Endereço confuso
- [ ] **Motoboy ↔ Loja:** Chegou na loja, confirmar

### Fase 2: IMPORTANTE (Implementar depois)
- [ ] **Loja ↔ Cliente:** Dúvidas sobre produto
- [ ] **Loja ↔ Motoboy:** Pedido não está pronto
- [ ] **Motoboy ↔ Cliente:** Cliente não atende

### Fase 3: NICE-TO-HAVE (Implementar por último)
- [ ] **Loja ↔ Cliente:** Status de preparo
- [ ] **Motoboy ↔ Loja:** Devoluções
- [ ] **Motoboy ↔ Cliente:** Avaliar motoboy em tempo real

---

## 📌 NOTAS IMPORTANTES

1. **Mensagens são públicas?** Não, são privadas entre os 2 participantes
2. **Histórico salvo?** Sim, para referência e disputas
3. **Notificações?** Push notification em tempo real
4. **Verificação de ID?** Sim, apenas participantes podem ver
5. **Limite de caracteres?** 500 caracteres por mensagem
6. **Suporte a anexos?** Foto (para problemas), localização (GPS)
7. **Bloqueio possível?** Sim, ambos podem bloquear
8. **Transferência de chat?** Não, precisa ser entre os dois apenas

---

**Status:** 📋 **ESTUDO COMPLETO E DOCUMENTADO**

Todos os 3 tipos de chat foram analisados com casos de uso reais!
