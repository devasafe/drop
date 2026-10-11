import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from '../Checkbox';
import { Switch } from '../Switch';
import { QuantitySelector } from '../QuantitySelector';

describe('Checkbox', () => {
  it('clicar no rótulo marca e avisa o novo valor', () => {
    const onChange = jest.fn();
    render(<Checkbox label="Aceito os termos" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByText('Aceito os termos'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it('expõe o estado marcado para leitor de tela', () => {
    render(<Checkbox label="Frete grátis" checked onChange={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Frete grátis' })).toBeChecked();
  });
  it('desabilitado não dispara onChange', () => {
    const onChange = jest.fn();
    render(<Checkbox label="X" checked={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('mostra a descrição de apoio ligada ao campo', () => {
    render(<Checkbox label="Salvar" description="Usaremos na próxima compra" checked={false} onChange={() => {}} />);
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription('Usaremos na próxima compra');
  });
});

describe('Switch', () => {
  it('é um switch com nome e estado acessíveis', () => {
    render(<Switch label="Usar saldo da carteira" checked onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Usar saldo da carteira' })).toHaveAttribute('aria-checked', 'true');
  });
  it('clicar inverte o valor', () => {
    const onChange = jest.fn();
    render(<Switch label="Notificações" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it('desabilitado não dispara onChange', () => {
    const onChange = jest.fn();
    render(<Switch label="N" checked={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('QuantitySelector', () => {
  const setup = (props: Partial<React.ComponentProps<typeof QuantitySelector>> = {}) => {
    const onChange = jest.fn();
    render(<QuantitySelector itemName="Fone JBL" value={2} onChange={onChange} {...props} />);
    return onChange;
  };

  it('aumenta e diminui em 1', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade de Fone JBL' }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir quantidade de Fone JBL' }));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });
  it('não passa do mínimo: o botão de diminuir desabilita', () => {
    setup({ value: 1, min: 1 });
    expect(screen.getByRole('button', { name: /Diminuir/ })).toBeDisabled();
  });
  it('não passa do estoque: o botão de aumentar desabilita', () => {
    setup({ value: 3, max: 3 });
    expect(screen.getByRole('button', { name: /Aumentar/ })).toBeDisabled();
  });
  it('com mínimo 0, chegar a 0 vira "Remover"', () => {
    const onChange = setup({ value: 1, min: 0 });
    const btn = screen.getByRole('button', { name: 'Remover Fone JBL' });
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith(0);
  });
  it('anuncia a quantidade atual', () => {
    setup({ value: 4 });
    expect(screen.getByRole('status')).toHaveTextContent('4');
  });
});
