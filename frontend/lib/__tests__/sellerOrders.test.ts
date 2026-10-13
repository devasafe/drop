import fs from 'fs';
import path from 'path';
import {
  isAwaitingAccept, orderStage, itemsSummary, sortOngoing, orderItems, REJECT_REASONS, parseSeg,
  stockTone, isLowStock, daysLeft, hasPhoto, LOW_STOCK_MAX,
} from '../sellerOrders';
import { cssViolations } from '../../__tests__/helpers/dsTokens';

describe('estado do pedido no vocabulário da loja', () => {
  it('criado é Novo e espera aceite', () => {
    expect(isAwaitingAccept({ status: 'criado' })).toBe(true);
    expect(orderStage({ status: 'criado' })).toEqual({ label: 'Novo', tone: 'brand' });
  });
  it('aceito sem motoboy é Separando; com readyAt é Pronto para retirada', () => {
    expect(orderStage({ status: 'aguardando_motoboy', deliveryId: 'd1', deliveryFee: 7 }).label).toBe('Separando');
    expect(orderStage({ status: 'aguardando_motoboy', deliveryId: 'd1', deliveryFee: 7, readyAt: '2026-10-12T12:00:00Z' }).label).toBe('Pronto para retirada');
  });
  it('motoboy atribuído, retirado, entregue, cancelado e devolução', () => {
    expect(orderStage({ status: 'aguardando_motoboy', deliveryId: 'd1', delivery: { status: 'assigned' } }).label).toBe('Motoboy chegando');
    expect(orderStage({ status: 'aguardando_motoboy', deliveryId: 'd1', delivery: { status: 'picked' } }).label).toBe('A caminho do cliente');
    expect(orderStage({ status: 'entregue' })).toEqual({ label: 'Entregue', tone: 'success' });
    expect(orderStage({ status: 'rejeitado' })).toEqual({ label: 'Cancelado', tone: 'neutral' });
    expect(orderStage({ status: 'aguardando_motoboy', delivery: { status: 'picked', statusDevolucao: 'aguardando_confirmacao' } }).label).toBe('Devolução: responder');
  });
  it('Plano 1 aceito espera o cliente confirmar', () => {
    expect(orderStage({ status: 'pago', deliveryFee: 0, paymentProvider: 'asaas' }).label).toBe('Aguardando o cliente confirmar');
  });
});

describe('listas', () => {
  it('itemsSummary resume nomes e quantidade', () => {
    const o = { products: [{ productName: 'Fone', quantity: 1 }, { productName: 'Cabo', quantity: 2 }, { productName: 'Capa', quantity: 1 }] };
    expect(itemsSummary(o)).toBe('4 itens · Fone, Cabo e mais 1');
    expect(itemsSummary({ products: [{ productName: 'Fone', quantity: 1 }] })).toBe('1 item · Fone');
  });
  it('orderItems agrupa por produto para pausar', () => {
    expect(orderItems({ products: [{ productId: 'p1', productName: 'Fone', quantity: 1 }, { productId: 'p1', productName: 'Fone', quantity: 1 }, { productId: 'p2', productName: 'Cabo', quantity: 1 }] }))
      .toEqual([{ productId: 'p1', name: 'Fone' }, { productId: 'p2', name: 'Cabo' }]);
  });
  it('sortOngoing põe os novos primeiro e o mais recente no topo', () => {
    const list = [
      { _id: 'a', status: 'aguardando_motoboy', createdAt: '2026-10-12T10:00:00Z' },
      { _id: 'b', status: 'criado', createdAt: '2026-10-12T09:00:00Z' },
      { _id: 'c', status: 'criado', createdAt: '2026-10-12T11:00:00Z' },
    ];
    expect(sortOngoing(list).map((o) => o._id)).toEqual(['c', 'b', 'a']);
  });
  it('motivos de recusa são exatamente o enum do servidor, com as descrições que a tela antiga enviava', () => {
    expect(REJECT_REASONS.map((r) => r.code)).toEqual(['not_available', 'store_busy', 'store_closed', 'payment_issue', 'other']);
    expect(REJECT_REASONS.find((r) => r.code === 'store_closed')!.description).toBe('Loja está fechada no momento');
    expect(REJECT_REASONS.find((r) => r.code === 'store_busy')!.description).toBe('Muitos pedidos para processar');
    expect(REJECT_REASONS.find((r) => r.code === 'not_available')!.description).toBe('Item fora de estoque');
    expect(REJECT_REASONS.find((r) => r.code === 'payment_issue')!.description).toBe('Problema com o pagamento');
  });
  it('parseSeg cai em andamento por padrão', () => {
    expect(parseSeg('historico')).toBe('historico');
    expect(parseSeg('devolucoes')).toBe('devolucoes');
    expect(parseSeg('xyz')).toBe('andamento');
    expect(parseSeg(undefined)).toBe('andamento');
  });
});

describe('estoque', () => {
  it('tom e estoque baixo', () => {
    expect(LOW_STOCK_MAX).toBe(3);
    expect(stockTone(0)).toBe('out');
    expect(stockTone(3)).toBe('low');
    expect(stockTone(4)).toBe('ok');
    expect(isLowStock({ quantity: 2 })).toBe(true);
    expect(isLowStock({ quantity: 12 })).toBe(false);
  });
  it('daysLeft no ritmo de 30 dias', () => {
    expect(daysLeft(0, 30)).toBe(0);
    expect(daysLeft(12, 30)).toBe(12);
    expect(daysLeft(2, 60)).toBe(1);
    expect(daysLeft(5, 0)).toBeNull();
  });
  it('hasPhoto', () => {
    expect(hasPhoto({ image: 'a.jpg' })).toBe(true);
    expect(hasPhoto({ images: ['a.jpg'] })).toBe(true);
    expect(hasPhoto({ images: [] })).toBe(false);
  });
  it('CSS do StageTag só com tokens', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'seller', 'StageTag.module.css'), 'utf8');
    expect(cssViolations(css)).toEqual([]);
  });
});
