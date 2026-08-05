# Design System DROP — o idioma **flat**

Este documento é a fonte da verdade do estilo visual do DROP. O padrão é
**flat**: superfícies planas, hierarquia por tipografia e divisórias finas, e
**o card como exceção — não a regra**.

## Princípios

1. **Menos caixas.** Uma coleção é uma **lista de linhas separadas por
   divisória** (`--line`), não uma pilha de cards. Um agrupamento é uma
   **seção** (título + régua fina), não uma caixa.
2. **`Card` só quando a borda for funcional** — um bloco denso, único e/ou
   interativo que precisa se destacar do entorno (ex.: um item de ação
   isolado). Nunca por estética. Se você tem N itens iguais, é `List`.
3. **Sem gradiente, sem glow.** Nada de `--brand-grad` em superfícies nem
   `box-shadow` borrado (`0 0 Npx …`) como brilho. Botões primários são
   **sólidos** (`--brand`); positivos usam `--success` sólido. Anel de foco
   (`0 0 0 3px`, spread) é permitido — é indicador de foco, não glow.
4. **Cores sempre por token.** Nada de hex/rgba hardcoded. Use os tokens de
   `tokens.css` (`--brand`, `--surface`, `--line`, `--text-*`, `--success`,
   `--danger`, `--rating`, `--info`, …). Tints via
   `color-mix(in srgb, var(--token) X%, transparent)`.
5. **Espaço e tipografia fazem o trabalho.** Use a escala `--space-*`, os
   tamanhos `--fs-*` e as famílias `--font-display` (títulos) / `--font-body`.

## Primitivos flat (`components/ui/`)

Prefira estes a reescrever CSS de layout à mão:

### `Section` — agrupar sem caixa
Título + régua fina + conteúdo. Substitui o `<div><h2 className={styles.xTitle}>…</h2>…</div>`.

```tsx
import { Section } from '../components/ui/Section';

<Section title="Pedidos em andamento" action={<Button size="sm">Novo</Button>}>
  {/* conteúdo */}
</Section>
```
Props: `title?`, `action?` (à direita), `divider?` (régua sob o cabeçalho, default `true`).

### `List` + `Row` — coleções achatadas
Linhas separadas por divisória, sem caixa. A régua fica **entre** as linhas
automaticamente (a primeira não tem topo).

```tsx
import { List, Row } from '../components/ui/List';

<List>
  {pedidos.map(p => (
    <Row key={p.id} interactive accent={p.isNew} onClick={() => abrir(p)}>
      {/* topo + conteúdo da linha */}
    </Row>
  ))}
</List>
```
`Row` props: `accent?` (barra `--brand` à esquerda p/ item novo/destacado),
`interactive?` (hover/foco/teclado quando clicável, com `onClick`).

### `KpiBand` + `Kpi` — indicadores
Fileira de indicadores com divisória **vertical** entre eles (no lugar de
mini-cards).

```tsx
import { KpiBand, Kpi } from '../components/ui/KpiBand';

<KpiBand>
  <Kpi label="Pendente"  value="R$ 172.909,50" tone="warn" />
  <Kpi label="Total ganho" value="R$ 25.659,50" />
  <Kpi label="Você retém"  value="95%" />
</KpiBand>
```
`Kpi` `tone`: `default | success | danger | warn | info`.

### Quando ainda usar `Card`
Um único bloco denso/interativo que precisa de superfície própria
(`--surface` + `--line` + `--r-lg`). Ex.: um contêiner de chat, um item de
ação isolado. Regra: se a borda **agrupa/interage**, é `Card`; se ela só
**decora** ou se **repete**, use `Section`/`List`.

## Checklist de revisão (flat)

- [ ] Coleção = `List`/`Row`, não pilha de cards
- [ ] Agrupamento = `Section`, não `<div>` + título solto
- [ ] `grep '\-\-drop\-'` = 0 (sem tokens legados)
- [ ] Sem `--brand-grad` em superfície e sem `box-shadow` borrado
- [ ] Botão primário sólido `--brand` / positivo `--success`
- [ ] Cores por token (sem hex/rgba hardcoded)
