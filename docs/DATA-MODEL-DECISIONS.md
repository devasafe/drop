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
