import { render, screen, fireEvent } from '@testing-library/react';
import { AddressSelector } from '../AddressSelector';

const ADDR_A = { cep: '1', street: 'Rua A', number: '10', neighborhood: 'C', city: 'Rio', state: 'RJ', latitude: '-22', longitude: '-43' };
const ADDR_B = { cep: '2', street: 'Rua B', number: '20', neighborhood: 'D', city: 'Rio', state: 'RJ', latitude: '-22', longitude: '-43' };

test('sem endereço mostra convite e abre sheet', () => {
  const onAddNew = jest.fn();
  render(<AddressSelector selected={null} addresses={[]} onPick={() => {}} onAddNew={onAddNew} />);
  fireEvent.click(screen.getByRole('button', { name: /adicionar endereço/i }));
  expect(onAddNew).toHaveBeenCalled();
});

test('com endereço mostra a rua', () => {
  render(<AddressSelector selected={ADDR_A} addresses={[]} onPick={() => {}} onAddNew={() => {}} />);
  expect(screen.getByText(/Rua A/)).toBeInTheDocument();
});

test('lista endereços salvos e permite trocar via onPick', () => {
  const onPick = jest.fn();
  render(
    <AddressSelector selected={ADDR_A} addresses={[ADDR_A, ADDR_B]} onPick={onPick} onAddNew={() => {}} />
  );
  fireEvent.click(screen.getByRole('button', { name: /Rua B/ }));
  expect(onPick).toHaveBeenCalledWith(1);
});

test('CTA chama onAddNew quando já existe endereço selecionado', () => {
  const onAddNew = jest.fn();
  render(<AddressSelector selected={ADDR_A} addresses={[ADDR_A]} onPick={() => {}} onAddNew={onAddNew} />);
  fireEvent.click(screen.getByRole('button', { name: /trocar/i }));
  expect(onAddNew).toHaveBeenCalled();
});
