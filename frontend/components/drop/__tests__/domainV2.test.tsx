import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { Banner } from '../Banner';
import { OrderRow, toCustomerStatus } from '../OrderRow';
import { List } from '../../ui/List';
import { cssViolations } from '../../../__tests__/helpers/dsTokens';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('Banner', () => {
  const items = [
    { id: 'b1', title: 'Promo', href: '/produtos', imageUrl: 'a.jpg' },
    { id: 'b2', title: 'Aviso sem link' },
    { id: 'b3', title: 'Externo', href: 'https://x.com', subtitle: 'Cupom' },
  ];

  it('vazio não renderiza nada', () => {
    const { container } = render(<Banner items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza um link por item com href e título', () => {
    render(<Banner items={items} />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Promo/ })).toHaveAttribute('href', '/produtos');
    expect(screen.getByRole('link', { name: /Externo/ })).toHaveAttribute('href', 'https://x.com');
    expect(screen.getByRole('link', { name: /Externo/ })).toHaveAttribute('target', '_blank');
  });

  it('item sem href mostra o aviso mas não é link', () => {
    render(<Banner items={items} />);
    expect(screen.getByText('Aviso sem link')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Aviso sem link/ })).toBeNull();
  });

  it('aceita label do landmark', () => {
    render(<Banner items={items} label="Avisos" />);
    expect(screen.getByRole('region', { name: 'Avisos' })).toBeInTheDocument();
  });

  it('não tem autoplay nem dots', () => {
    render(<Banner items={items} />);
    expect(screen.queryByRole('tab')).toBeNull();
  });
});

describe('OrderRow', () => {
  const order = { _id: 'o1', status: 'aguardando_motoboy', total: 1234.5, storeName: 'Pizza Place', createdAt: '2026-07-31T12:00:00Z' };

  it('mostra loja, valor formatado e status do OrderStatusBadge', () => {
    render(<List><OrderRow order={order} /></List>);
    expect(screen.getByText('Pizza Place')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.234,50')).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
  });

  it('mostra código, resumo, pagamento e data (histórico)', () => {
    render(
      <List>
        <OrderRow
          showDate
          order={{ ...order, code: 'A1B2C3D4', itemsLabel: '2 itens · Pizza, Refri', paymentMethod: 'credit_card', installmentCount: 3 }}
        />
      </List>
    );
    expect(screen.getByText(/#A1B2C3D4 · 2 itens · Pizza, Refri/)).toBeInTheDocument();
    expect(screen.getByText('Cartão de crédito · 3x')).toBeInTheDocument();
    expect(screen.getByText(/julho de 2026/)).toBeInTheDocument();
  });

  it('sem paymentMethod não mostra linha de pagamento', () => {
    render(<List><OrderRow order={order} /></List>);
    expect(screen.queryByText(/Cartão|PIX/)).toBeNull();
  });

  it('clicar dispara onClick', () => {
    const onClick = jest.fn();
    render(<List><OrderRow order={order} onClick={onClick} /></List>);
    fireEvent.click(screen.getByText('Pizza Place'));
    expect(onClick).toHaveBeenCalled();
  });

  it('mapeia status do backend para o vocabulário do cliente', () => {
    expect(toCustomerStatus('criado', 'pending')).toBe('awaiting_payment');
    expect(toCustomerStatus('criado', 'paid')).toBe('awaiting_store');
    expect(toCustomerStatus('criado', 'failed')).toBe('awaiting_payment');
    expect(toCustomerStatus('pago')).toBe('preparing');
    expect(toCustomerStatus('aguardando_motoboy')).toBe('in_progress');
    expect(toCustomerStatus('qualquer_outro')).toBe('in_progress');
    expect(toCustomerStatus('rejeitado')).toBe('cancelled');
    expect(toCustomerStatus('entregue')).toBe('delivered');
    expect(toCustomerStatus('cancelado')).toBe('cancelled');
  });
});

describe('CSS do domínio v2', () => {
  it.each(['Banner.module.css', 'OrderRow.module.css', 'chat/ChatFab.module.css'])('%s sem gradiente, hex nem token antigo', (f) => {
    expect(cssViolations(read(f))).toEqual([]);
  });

  it('ChatFab usa ação primária e elevation-2', () => {
    const css = read('chat/ChatFab.module.css');
    expect(css).toMatch(/background:\s*var\(--color-action-primary\)/);
    expect(css).toMatch(/var\(--elevation-2\)/);
  });
});
