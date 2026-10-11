import { render, screen, fireEvent } from '@testing-library/react';
import { Alert } from '../Alert';
import { Tabs } from '../Tabs';
import { Avatar } from '../Avatar';
import { Rating } from '../Rating';
import { ProgressBar } from '../ProgressBar';

describe('Alert', () => {
  it('erro é anunciado na hora (role=alert)', () => {
    render(<Alert tone="error" title="Endereço fora da área">Escolha outro endereço.</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Endereço fora da área');
  });
  it('tons não urgentes usam role=status', () => {
    render(<Alert tone="info">A taxa muda com a distância.</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('A taxa muda com a distância.');
  });
  it('ação opcional vira botão', () => {
    const onClick = jest.fn();
    render(<Alert tone="warning" action={{ label: 'Trocar endereço', onClick }}>x</Alert>);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar endereço' }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('Tabs', () => {
  const items = [
    { id: 'andamento', label: 'Em andamento', count: 2 },
    { id: 'historico', label: 'Histórico' },
  ];
  it('marca a aba ativa', () => {
    render(<Tabs label="Pedidos" items={items} value="andamento" onChange={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Pedidos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Em andamento/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveAttribute('aria-selected', 'false');
  });
  it('clicar troca a aba', () => {
    const onChange = jest.fn();
    render(<Tabs label="Pedidos" items={items} value="andamento" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    expect(onChange).toHaveBeenCalledWith('historico');
  });
  it('setas do teclado andam entre as abas (e dão a volta)', () => {
    const onChange = jest.fn();
    render(<Tabs label="Pedidos" items={items} value="historico" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Histórico' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('andamento');
  });
  it('só a aba ativa entra no Tab do teclado', () => {
    render(<Tabs label="Pedidos" items={items} value="andamento" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /Em andamento/ })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveAttribute('tabindex', '-1');
  });
});

describe('Avatar', () => {
  it('com foto, usa o nome como texto alternativo', () => {
    render(<Avatar name="Ana Souza" src="/a.png" />);
    expect(screen.getByRole('img', { name: 'Ana Souza' })).toBeInTheDocument();
  });
  it('sem foto, mostra as iniciais', () => {
    render(<Avatar name="Ana Souza" />);
    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ana Souza' })).toBeInTheDocument();
  });
  it('se a foto falha, cai para as iniciais', () => {
    render(<Avatar name="Bruno" src="/quebrada.png" />);
    fireEvent.error(screen.getByRole('img', { name: 'Bruno' }));
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});

describe('Rating', () => {
  it('exibição: nota com vírgula e quantidade', () => {
    render(<Rating value={4.83} count={32} />);
    expect(screen.getByText('4,8')).toBeInTheDocument();
    expect(screen.getByText('(32)')).toBeInTheDocument();
    expect(screen.getByLabelText('Nota 4,8 de 5, 32 avaliações')).toBeInTheDocument();
  });
  it('entrada: 5 estrelas escolhíveis', () => {
    const onChange = jest.fn();
    render(<Rating value={0} onChange={onChange} label="Avalie a loja" />);
    expect(screen.getByRole('radiogroup', { name: 'Avalie a loja' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '4 estrelas' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});

describe('ProgressBar', () => {
  it('expõe valor e rótulo', () => {
    render(<ProgressBar value={2} max={4} label="Progresso do pedido" />);
    const bar = screen.getByRole('progressbar', { name: 'Progresso do pedido' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
  });
  it('limita o valor ao intervalo', () => {
    render(<ProgressBar value={9} max={4} label="P" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4');
  });
});
