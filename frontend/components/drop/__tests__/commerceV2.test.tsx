import { render, screen, fireEvent, within } from '@testing-library/react';
import { formatMoney } from '../../../lib/money';
import { DeliveryBadge } from '../DeliveryBadge';
import { OrderStatusBadge } from '../OrderStatusBadge';
import { PriceDisplay } from '../PriceDisplay';
import { OrderSummary } from '../OrderSummary';
import { OrderTimeline } from '../OrderTimeline';
import { CartItem } from '../CartItem';

describe('formatMoney', () => {
  it('vírgula decimal, ponto de milhar e duas casas', () => {
    expect(formatMoney(7.4)).toBe('R$ 7,40');
    expect(formatMoney(1234.5)).toBe('R$ 1.234,50');
    expect(formatMoney(1234567)).toBe('R$ 1.234.567,00');
  });
  it('negativo leva o sinal antes do R$', () => {
    expect(formatMoney(-15)).toBe('−R$ 15,00');
  });
  it('arredonda centavos (sem 0,1 + 0,2)', () => {
    expect(formatMoney(0.1 + 0.2)).toBe('R$ 0,30');
  });
});

describe('DeliveryBadge', () => {
  it('rápido: prazo em minutos', () => {
    render(<DeliveryBadge state={{ kind: 'fast', minutes: 35 }} />);
    expect(screen.getByText('Chega em ~35 min')).toBeInTheDocument();
  });
  it('frete grátis e frete pago', () => {
    const { rerender } = render(<DeliveryBadge state={{ kind: 'free' }} />);
    expect(screen.getByText('Frete grátis')).toBeInTheDocument();
    rerender(<DeliveryBadge state={{ kind: 'fee', fee: 7.4 }} />);
    expect(screen.getByText('Frete R$ 7,40')).toBeInTheDocument();
  });
  it('hoje e amanhã', () => {
    const { rerender } = render(<DeliveryBadge state={{ kind: 'today', until: '18h' }} />);
    expect(screen.getByText('Chega hoje até 18h')).toBeInTheDocument();
    rerender(<DeliveryBadge state={{ kind: 'tomorrow' }} />);
    expect(screen.getByText('Chega amanhã')).toBeInTheDocument();
  });
  it('sem endereço vira ação', () => {
    const onSetAddress = jest.fn();
    render(<DeliveryBadge state={{ kind: 'noAddress', onSetAddress }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Informe o endereço para ver prazo e frete' }));
    expect(onSetAddress).toHaveBeenCalled();
  });
  it('calculando é anunciado', () => {
    render(<DeliveryBadge state={{ kind: 'loading' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Calculando entrega…');
  });
  it('fora da área diz o endereço e oferece trocar', () => {
    const onChangeAddress = jest.fn();
    render(<DeliveryBadge state={{ kind: 'outOfArea', address: 'Av. Paulista, 1578', onChangeAddress }} />);
    expect(screen.getByText('Não entrega em Av. Paulista, 1578')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trocar endereço' }));
    expect(onChangeAddress).toHaveBeenCalled();
  });
});

describe('OrderStatusBadge', () => {
  it.each([
    ['awaiting_payment', 'Aguardando pagamento', 'warning'],
    ['awaiting_store', 'Aguardando a loja', 'warning'],
    ['preparing', 'Em preparação', 'warning'],
    ['finding_courier', 'Procurando entregador', 'info'],
    ['out_for_delivery', 'Saiu para entrega', 'brand'],
    ['delivered', 'Entregue', 'success'],
    ['cancelled', 'Cancelado', 'neutral'],
    ['problem', 'Problema na entrega', 'error'],
  ] as const)('%s → "%s" (tom %s)', (status, label, tone) => {
    const { container } = render(<OrderStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.firstChild).toHaveClass(tone);
  });
});

describe('PriceDisplay', () => {
  it('card: preço, antigo riscado e % de desconto calculado', () => {
    render(<PriceDisplay price={80} oldPrice={100} />);
    expect(screen.getByText('R$ 80,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 100,00').tagName).toBe('S');
    expect(screen.getByText('-20%')).toBeInTheDocument();
  });
  it('sem desconto real, não mostra preço antigo nem %', () => {
    render(<PriceDisplay price={80} oldPrice={80} />);
    expect(screen.queryByText('-0%')).toBeNull();
    expect(screen.getAllByText('R$ 80,00')).toHaveLength(1);
  });
  it('produto: parcelamento com o total por extenso', () => {
    render(
      <PriceDisplay size="product" price={240} installment={{ count: 12, installmentValue: 21.8, total: 261.6 }} />,
    );
    expect(screen.getByText('ou até 12x de R$ 21,80 no cartão (total R$ 261,60)')).toBeInTheDocument();
  });
  it('leitor de tela ouve "de … por …"', () => {
    render(<PriceDisplay price={80} oldPrice={100} />);
    expect(screen.getByLabelText('De R$ 100,00 por R$ 80,00, 20% de desconto')).toBeInTheDocument();
  });
});

describe('OrderSummary', () => {
  it('lista as linhas, créditos em verde com sinal de menos, e o total', () => {
    render(
      <OrderSummary
        lines={[
          { label: 'Subtotal (2 itens)', value: 269.8 },
          { label: 'Entrega · 2,4 km', value: 7.4 },
          { label: 'Cupom SEMANATECH', value: -15, tone: 'credit' },
        ]}
        total={262.2}
      />,
    );
    expect(screen.getByText('−R$ 15,00')).toHaveClass('credit');
    const total = screen.getByText('Total').closest('div')!;
    expect(within(total).getByText('R$ 262,20')).toBeInTheDocument();
  });
  it('entrega grátis aparece por escrito', () => {
    render(<OrderSummary lines={[{ label: 'Entrega', value: 0, freeLabel: 'Grátis' }]} total={10} />);
    expect(screen.getByText('Grátis')).toBeInTheDocument();
  });
});

describe('OrderTimeline', () => {
  const steps = [
    { label: 'Pedido confirmado', time: '14:02', state: 'done' as const },
    { label: 'Em preparação', time: '14:05', state: 'current' as const },
    { label: 'Saiu para entrega', state: 'upcoming' as const },
  ];
  it('lista ordenada com o passo atual marcado', () => {
    render(<OrderTimeline steps={steps} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('14:02')).toBeInTheDocument();
  });
});

describe('CartItem', () => {
  const item = { name: 'Fone JBL', price: 199.9, quantity: 2, imageUrl: '/f.png' };
  it('mostra nome, preço da linha (unitário × qtd) e quantidade', () => {
    render(<CartItem item={item} onQuantityChange={() => {}} />);
    expect(screen.getByText('Fone JBL')).toBeInTheDocument();
    expect(screen.getByText('R$ 399,80')).toBeInTheDocument();
    expect(screen.getByText('R$ 199,90 cada')).toBeInTheDocument();
  });
  it('no 1, o "−" remove (quantidade 0)', () => {
    const onQuantityChange = jest.fn();
    render(<CartItem item={{ ...item, quantity: 1 }} onQuantityChange={onQuantityChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Fone JBL' }));
    expect(onQuantityChange).toHaveBeenCalledWith(0);
  });
  it('indisponível: avisa e trava a quantidade', () => {
    render(<CartItem item={{ ...item, unavailable: true }} onQuantityChange={() => {}} />);
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aumentar/ })).toBeDisabled();
  });
});
