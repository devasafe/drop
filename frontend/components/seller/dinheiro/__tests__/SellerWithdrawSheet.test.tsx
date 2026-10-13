import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { SellerWithdrawSheet } from '../SellerWithdrawSheet';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

const base = { open: true, onClose: jest.fn(), available: 1842.6, minimum: 10, pixLabel: 'CNPJ **.***.456/0001-**' };

test('abre com tudo preenchido e o botão repete o valor; "Tudo" vira amount "all"', () => {
  const onConfirm = jest.fn();
  render(<SellerWithdrawSheet {...base} onConfirm={onConfirm} />);
  expect(screen.getByLabelText('Valor do saque')).toHaveValue('1842,60');
  expect(screen.getByText('Para a chave CNPJ **.***.456/0001-**')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 1.842,60' }));
  expect(onConfirm).toHaveBeenCalledWith('all');
});

test('valor parcial pelos atalhos', () => {
  const onConfirm = jest.fn();
  render(<SellerWithdrawSheet {...base} onConfirm={onConfirm} />);
  fireEvent.click(screen.getByRole('button', { name: 'R$ 500,00' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 500,00' }));
  expect(onConfirm).toHaveBeenCalledWith(500);
});

test('abaixo do mínimo do servidor: botão desligado com o mínimo escrito', () => {
  render(<SellerWithdrawSheet {...base} onConfirm={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Valor do saque'), { target: { value: '5' } });
  expect(screen.getByText('O saque mínimo é R$ 10,00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Sacar/ })).toBeDisabled();
  expect(screen.getByText('Mínimo de R$ 10,00 por saque')).toBeInTheDocument();
});

test('acima do disponível não deixa sacar', () => {
  render(<SellerWithdrawSheet {...base} onConfirm={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Valor do saque'), { target: { value: '5000' } });
  expect(screen.getByText('Você tem R$ 1.842,60 para sacar.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Sacar/ })).toBeDisabled();
});

test('saque em conferência bloqueia o pedido novo', () => {
  render(<SellerWithdrawSheet {...base} blocked="Não peça de novo: estamos conferindo com o banco." onConfirm={jest.fn()} />);
  expect(screen.getByText('Saque em conferência')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Sacar R\$/ })).not.toBeInTheDocument();
});

test('erro do servidor aparece no sheet', () => {
  render(<SellerWithdrawSheet {...base} error="O saque mínimo é R$ 10,00" onConfirm={jest.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('O saque mínimo é R$ 10,00');
});

test('valor ambíguo (1.000) vira erro na tela e nunca envia', () => {
  const onConfirm = jest.fn();
  render(<SellerWithdrawSheet {...base} onConfirm={onConfirm} />);
  for (const v of ['1.000', '49.999', '1,000,5']) {
    fireEvent.change(screen.getByLabelText('Valor do saque'), { target: { value: v } });
    expect(screen.getByText('Valor inválido. Use vírgula para os centavos, como 1000,00.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sacar/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Sacar/ }));
  }
  expect(onConfirm).not.toHaveBeenCalled();
});

test('duplo clique envia uma vez só', () => {
  const onConfirm = jest.fn();
  render(<SellerWithdrawSheet {...base} onConfirm={onConfirm} />);
  const btn = screen.getByRole('button', { name: 'Sacar R$ 1.842,60' });
  fireEvent.click(btn);
  fireEvent.click(btn);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('enviando: botão desligado; sem mínimo conhecido o front não bloqueia', () => {
  const onConfirm = jest.fn();
  const { rerender } = render(<SellerWithdrawSheet {...base} minimum={null} onConfirm={onConfirm} />);
  fireEvent.change(screen.getByLabelText('Valor do saque'), { target: { value: '1' } });
  expect(screen.getByRole('button', { name: /^Sacar/ })).toBeEnabled();
  expect(screen.queryByText(/Mínimo de/)).not.toBeInTheDocument();
  rerender(<SellerWithdrawSheet {...base} minimum={null} submitting onConfirm={onConfirm} />);
  fireEvent.click(screen.getByRole('button', { name: /^Sacar/ }));
  expect(onConfirm).not.toHaveBeenCalled();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'SellerWithdrawSheet.module.css'), 'utf8'))).toEqual([]);
});
