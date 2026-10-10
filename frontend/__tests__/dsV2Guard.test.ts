import fs from 'fs';
import path from 'path';
import { cssViolations } from './helpers/dsTokens';

// Guarda do DS v2: nenhum .module.css de components/ui ou components/drop pode ter
// hex, token antigo (incl. --fs-*) ou gradient/glow. ALLOW lista o que a fase C redesenha.
const ROOT = path.join(__dirname, '..');
const ALLOW = new Set<string>([
  'components/drop/checkout/AddressSelector.module.css', // fase C: checkout
  'components/drop/checkout/CheckoutBar.module.css', // fase C: checkout
  'components/drop/checkout/CheckoutItems.module.css', // fase C: checkout
  'components/drop/checkout/CouponField.module.css', // fase C: checkout
  'components/drop/checkout/OrderSummary.module.css', // fase C: checkout
  'components/drop/checkout/PixPaymentSheet.module.css', // fase C: checkout
  'components/drop/checkout/WalletToggle.module.css', // fase C: checkout
  'components/drop/order/CancellationStatus.module.css', // fase C: página do pedido (store-order)
  'components/drop/order/CancelOrderSheet.module.css', // fase C: página do pedido (store-order)
  'components/drop/order/DeliveryPin.module.css', // fase C: página do pedido (store-order)
  'components/drop/order/MotoboyMap.module.css', // fase C: página do pedido (store-order)
  'components/drop/order/OrderActions.module.css', // fase C: página do pedido (store-order)
  'components/drop/order/OrderItemsSummary.module.css', // fase C: página do pedido (store-order)
  'components/drop/order/OrderStatusHero.module.css', // fase C: página do pedido (store-order)
  'components/drop/order/RatingForm.module.css', // fase C: página do pedido (store-order)
  'components/drop/asaas/AsaasConnectCard.module.css', // fase C: pagamentos do lojista (Asaas e modo de liquidação)
  'components/drop/settlement/SettlementSwitchCard.module.css', // fase C: pagamentos do lojista (Asaas e modo de liquidação)
]);

// CSS de página do cliente já redesenhada (fase C). Cada task de tela acrescenta o seu.
const CLIENT_PAGE_CSS: string[] = ['pages/Inicio.module.css', 'pages/Buscar.module.css', 'pages/loja/Loja.module.css', 'pages/produto/Produto.module.css'];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(full);
    return e.name.endsWith('.module.css') ? [full] : [];
  });
}

const files = ['components/ui', 'components/drop']
  .flatMap((d) => walk(path.join(ROOT, d)))
  .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));

describe('DS v2 guard', () => {
  it('ALLOW nunca contém arquivos de components/ui', () => {
    expect([...ALLOW].filter((f) => f.startsWith('components/ui/'))).toEqual([]);
  });

  it('ALLOW só contém arquivos que existem e ainda violam', () => {
    const stale = [...ALLOW].filter((f) => !files.includes(f) || cssViolations(fs.readFileSync(path.join(ROOT, f), 'utf8')).length === 0);
    expect(stale).toEqual([]);
  });

  it('nenhum module.css fora de ALLOW tem cor fixa, token antigo ou gradient', () => {
    const report = files
      .filter((f) => !ALLOW.has(f))
      .map((f) => ({ f, v: cssViolations(fs.readFileSync(path.join(ROOT, f), 'utf8')) }))
      .filter((x) => x.v.length)
      .map((x) => `${x.f}\n  ${x.v.join('\n  ')}`);
    expect(report.join('\n')).toBe('');
  });

  it('CSS das páginas do cliente redesenhadas não tem cor fixa, token antigo nem gradient', () => {
    const report = CLIENT_PAGE_CSS
      .map((f) => ({ f, v: cssViolations(fs.readFileSync(path.join(ROOT, f), 'utf8')) }))
      .filter((x) => x.v.length)
      .map((x) => `${x.f}\n  ${x.v.join('\n  ')}`);
    expect(report.join('\n')).toBe('');
  });
});
