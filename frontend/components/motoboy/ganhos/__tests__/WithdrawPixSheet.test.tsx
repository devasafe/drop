// frontend/components/motoboy/ganhos/__tests__/WithdrawPixSheet.test.tsx
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { WithdrawPixSheet } from '../WithdrawPixSheet';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

const base = { open: true, onClose: jest.fn(), available: 318.4, minimum: 50 as number | null, pixLabel: '***.412.***-07' as string | null, onChangeKey: jest.fn(), onConfirm: jest.fn() };
const props = (o: Partial<typeof base> & Record<string, any> = {}) => ({ ...base, onClose: jest.fn(), onChangeKey: jest.fn(), onConfirm: jest.fn(), ...o });

test('abre com tudo: "Sacar R$ 318,40" envia "all"', () => {
  const p = props();
  render(<WithdrawPixSheet {...p} />);
  expect(screen.getByText('Tudo o que está disponível')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 318,40' }));
  expect(p.onConfirm).toHaveBeenCalledWith('all');
});

test('valores rápidos respeitam o mínimo e o disponível', () => {
  const p = props({ available: 150, minimum: 100 });
  render(<WithdrawPixSheet {...p} />);
  expect(screen.queryByRole('button', { name: 'R$ 50,00' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'R$ 200,00' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'R$ 100,00' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 100,00' }));
  expect(p.onConfirm).toHaveBeenCalledWith(100);
});

test('abaixo do mínimo: mensagem e botão desligado', () => {
  const p = props();
  render(<WithdrawPixSheet {...p} />);
  fireEvent.change(screen.getByLabelText('Valor do saque'), { target: { value: '30' } });
  expect(screen.getByText('O saque mínimo é R$ 50,00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sacar R$ 30,00' })).toBeDisabled();
});

test('acima do disponível: mensagem e botão desligado', () => {
  render(<WithdrawPixSheet {...props()} />);
  fireEvent.change(screen.getByLabelText('Valor do saque'), { target: { value: '400' } });
  expect(screen.getByText('Você tem R$ 318,40 para sacar.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sacar R$ 400,00' })).toBeDisabled();
});

test('saldo todo abaixo do mínimo: fica para a equipe resolver (decisão da D1)', () => {
  const p = props({ available: 30, minimum: 50 });
  render(<WithdrawPixSheet {...p} />);
  expect(screen.getByText('Saldo abaixo do mínimo')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sacar R$ 30,00' })).toBeDisabled();
});

test('saque em conferência (uncertain): só o aviso, sem botão de sacar', () => {
  render(<WithdrawPixSheet {...props({ blocked: 'Não peça de novo: estamos conferindo com o banco e avisamos aqui.' })} />);
  expect(screen.getByText('Saque em conferência')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Sacar R\$/ })).not.toBeInTheDocument();
});

test('um envio por toque; erro do servidor libera um novo envio', () => {
  const p = props();
  const { rerender } = render(<WithdrawPixSheet {...p} />);
  const btn = screen.getByRole('button', { name: 'Sacar R$ 318,40' });
  fireEvent.click(btn);
  fireEvent.click(btn);
  expect(p.onConfirm).toHaveBeenCalledTimes(1);
  rerender(<WithdrawPixSheet {...p} error="Falhou" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 318,40' }));
  expect(p.onConfirm).toHaveBeenCalledTimes(2);
});

test('chave mascarada e "Trocar"; sem chave, "Cadastrar"', () => {
  const p = props();
  const { rerender } = render(<WithdrawPixSheet {...p} />);
  expect(screen.getByText('Chave ***.412.***-07')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
  expect(p.onChangeKey).toHaveBeenCalled();
  rerender(<WithdrawPixSheet {...p} pixLabel={null} />);
  expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeInTheDocument();
});

test('o que fica de fora vem do servidor (a liberar + bloqueado)', () => {
  render(<WithdrawPixSheet {...props({ outside: { pending: 47.2, blocked: 12 } })} />);
  expect(screen.getByText('Não entra neste saque')).toBeInTheDocument();
  expect(screen.getByText('R$ 59,20')).toBeInTheDocument();
  expect(screen.getByText('R$ 47,20')).toBeInTheDocument();
  expect(screen.getByText('R$ 12,00')).toBeInTheDocument();
});

test('acima do limite diário: abre com R$ 8.000 e oferece o atalho', () => {
  render(<WithdrawPixSheet {...props({ available: 9000 })} />);
  expect((screen.getByLabelText('Valor do saque') as HTMLInputElement).value).toBe('8000,00');
  expect(screen.getByRole('button', { name: 'R$ 8.000,00' })).toBeInTheDocument();
});

test('quando cai: na hora ou depois da aprovação', () => {
  const { rerender } = render(<WithdrawPixSheet {...props({ instant: true })} />);
  expect(screen.getByText('Cai em minutos na sua chave Pix')).toBeInTheDocument();
  rerender(<WithdrawPixSheet {...props({ instant: false })} />);
  expect(screen.getByText('Cai na sua chave Pix depois da aprovação da equipe')).toBeInTheDocument();
});

test('regra da D1: "50.5" vale 50,50; valor ambíguo ("1.000") é erro e não envia', () => {
  const p = props();
  render(<WithdrawPixSheet {...p} />);
  const input = screen.getByLabelText('Valor do saque');
  fireEvent.change(input, { target: { value: '50.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 50,50' }));
  expect(p.onConfirm).toHaveBeenCalledWith(50.5);
  fireEvent.change(input, { target: { value: '1.000' } });
  expect(screen.getByText('Valor inválido. Use vírgula para os centavos, como 1000,00.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sacar R$ 0,00' })).toBeDisabled();
});

test('compara em centavos: "318,40" é tudo ("all"); "318,41" passa do disponível', () => {
  const p = props();
  render(<WithdrawPixSheet {...p} />);
  const input = screen.getByLabelText('Valor do saque');
  fireEvent.change(input, { target: { value: '318,41' } });
  expect(screen.getByRole('button', { name: 'Sacar R$ 318,41' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '318,40' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 318,40' }));
  expect(p.onConfirm).toHaveBeenCalledWith('all');
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'WithdrawPixSheet.module.css'), 'utf8'))).toEqual([]);
});
