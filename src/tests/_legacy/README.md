# Testes legados (aposentados)

Estes testes **não rodam** (excluídos via `testPathIgnorePatterns` no `jest.config.ts`).

## Por quê foram aposentados
Estavam quebrados de fábrica — não refletem o código atual:
- Usam paths **sem o prefixo `/api`** (ex.: `POST /auth/register` em vez de `/api/auth/register`) → sempre 404.
- Esperam **contratos de resposta antigos** (ex.: `res.body.userId`).
- Esperam o **modelo financeiro antigo** (loja creditada direto na criação do pedido), mas o sistema usa custódia + payouts (a loja recebe na entrega).
- Setups com `address` como objeto, enquanto o model `Store` espera string.

## O que os substituiu
A cobertura real das regras críticas está em:
- `src/tests/hardening.test.ts` — preço do banco, estorno + estoque, anti-duplo-reembolso, IDOR de carteira, débito atômico.
- `src/tests/cancellation.test.ts` — cálculo de taxa de cancelamento (unitário).
- `src/tests/wallets.test.ts` — transferências e carteira.
- `src/tests/auth.test.ts` — autenticação.

## Se quiser reaproveitar
Para reviver um destes testes: corrija os paths para `/api/...`, ajuste os contratos de
resposta e o setup (use `MongoMemoryReplSet` por causa das transações), e mova de volta
para `src/tests/`.
