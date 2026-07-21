# Decisões de modelagem — migração Mongo → Postgres/Prisma

- **Dinheiro:** `Decimal(12,2)`. Nunca float. Percentuais/taxas usam `Decimal(5,2)`.
- **Coordenadas:** `Float` no Order/Delivery; `String` no Address/Store (fiel ao original).
- **IDs:** `cuid()` (String). ObjectId abandonado (greenfield, sem dados a preservar).
- **JSONB:** verification (KYC), asaas, currentLocation, bankInfo, operatingHours, apiConfig,
  walletDistribution, routeWaypoints, gamificationBenefits, participants de Conversation,
  attachments de Message, history de Gamification, openedBy/assignedTo de SupportTicket,
  prizes de RankingPrize, motorcycleTaxes de PricingPlan, bankInfo/bankAccount de saques.
- **Ledgers:** Wallet.history → tabela WalletEntry; AppCashbox.history → tabela AppCashboxEntry.
  Append-only, saldo reconcilia com a soma das entradas.
- **Referências polimórficas (String, sem FK):** Wallet.owner (+ownerType), Payout.recipientId
  (+recipientType). O alvo varia entre User/Store/plataforma — FK não se aplica.
- **FKs no schema inicial:** só o núcleo (User, Store, Product, Category, Order, OrderItem,
  Address, Wallet, WalletEntry, AppCashbox, AppCashboxEntry, Message→Conversation). Demais
  referências ficam como String indexado e serão formalizadas como FK ao migrar cada fatia.
- **⚠️ TTL:** Postgres não tem TTL nativo. EmailVerificationToken, OtpCode, PasswordResetToken
  precisam de um job de limpeza (cron `DELETE WHERE expiresAt < now()`) — a implementar na
  fatia de auth. No Mongo isso era automático (expireAfterSeconds).
- **Enums sem acento:** GamificationLevel.Lendario (rótulo "Lendário" só na apresentação).
- **Campos `select: false` do Mongo** (ex.: apiKeyEncrypted): o Prisma não tem "select false"
  no schema — a proteção passa a ser explícita via `select`/`omit` nas queries. A implementar
  ao migrar os controllers que leem esses campos.
- **`WalletEntry.category` enum fechado (6 valores):** o Mongoose (`src/models/Wallet.ts`)
  removeu o enum de propósito, por "backward compatibility". Como o Postgres é greenfield
  (sem dados legados a preservar), mantivemos o enum fechado — decisão intencional, mais
  integridade. Risco: se algum código gravar `category` fora dos 6 valores
  (`deposit/withdrawal/payment/refund/transfer/penalty`), o insert falha. Validar todos os
  call sites que escrevem `WalletEntry.category` ao migrar o WalletService (Fase 3) e ao
  remover o Mongoose (Fase 6).
- **`PricingPlan.name`:** virou `String @unique` (o Mongoose tinha enum de 3 valores fixos).
  Constraint relaxada intencionalmente — são nomes de exibição do plano, não um tipo fechado
  de domínio.
- **`Gamification.userId`:** no Mongoose o campo era `user_id` (snake_case); renomeado para
  `userId` (camelCase) para seguir a convenção do resto do schema Prisma. Anotar para o script
  de migração de dados da Fase 6 (mapear `user_id` → `userId` ao importar os documentos).
