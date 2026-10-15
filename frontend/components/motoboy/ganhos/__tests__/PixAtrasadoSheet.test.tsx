import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { PixAtrasadoSheet } from '../PixAtrasadoSheet';
import { transferToMoney, transferView } from '../../../../lib/motoboyMoney';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

const t = (status: string) => transferToMoney({ id: 't1', orderId: 'ord0004821', amount: 12, status, createdAt: '2026-10-14T14:32:00-03:00' })!;
const setup = (status: string | null, blockHours: number | null = 24) => {
  const onClose = jest.fn();
  const onSupport = jest.fn();
  render(<PixAtrasadoSheet transfer={status ? t(status) : null} blockHours={blockHours} onClose={onClose} onSupport={onSupport} />);
  return { onClose, onSupport };
};

test('failed: rótulo e detail de transferView, com o prazo do bloqueio da loja', () => {
  setup('failed');
  expect(screen.getByRole('dialog')).toHaveTextContent('R$ 12,00 da loja');
  expect(screen.getByText('Entrega #004821 · 14/10 14:32')).toBeInTheDocument();
  expect(screen.getByText('Atrasado')).toBeInTheDocument();
  expect(screen.getByText('A loja vai tentar de novo.')).toBeInTheDocument();
  expect(screen.getByText(/Se o Pix não sair até 15\/10 14:32, a loja para de receber pedidos novos/)).toBeInTheDocument();
});

test('uncertain: detail de transferView, sem prazo de bloqueio da loja', () => {
  setup('uncertain');
  expect(screen.getByText('Atrasado')).toBeInTheDocument();
  expect(screen.getByText('Em conferência pela DROP.')).toBeInTheDocument();
  expect(screen.queryByText(/para de receber pedidos/)).not.toBeInTheDocument();
});

test('failed_final: detail de transferView (a DROP cuida do repasse), com prazo', () => {
  setup('failed_final');
  expect(screen.getByText('Atrasado')).toBeInTheDocument();
  expect(screen.getByText('As tentativas acabaram — a DROP está cuidando do seu repasse.')).toBeInTheDocument();
  expect(screen.getByText(/Se o Pix não sair até 15\/10 14:32/)).toBeInTheDocument();
});

test.each(['pending', 'requested'])('%s: a caminho, sem prazo', (s) => {
  setup(s);
  expect(screen.getByText('A caminho')).toBeInTheDocument();
  expect(screen.getByText('A caminho da sua conta.')).toBeInTheDocument();
  expect(screen.queryByText(/para de receber pedidos/)).not.toBeInTheDocument();
});

test.each(['failed', 'uncertain', 'failed_final', 'pending'])('%s: o texto vem de transferView (fonte única)', (s) => {
  setup(s);
  const v = transferView(s);
  expect(screen.getByText(v.label)).toBeInTheDocument();
  expect(screen.getByText(v.detail)).toBeInTheDocument();
});

test('só informativa: nenhum botão de reenviar, e a sheet não fala com a API nem tem mapa próprio', () => {
  setup('failed');
  expect(screen.queryByRole('button', { name: /tentar|reenviar/i })).not.toBeInTheDocument();
  const src = fs.readFileSync(path.join(__dirname, '..', 'PixAtrasadoSheet.tsx'), 'utf8');
  expect(src).not.toMatch(/lib\/api/);
  expect(src).not.toMatch(/\bSTATUS\b/);
  expect(src).toMatch(/transferView/);
});

test('Entendi fecha; Falar com o suporte chama o suporte', () => {
  const { onClose, onSupport } = setup('failed');
  fireEvent.click(screen.getByRole('button', { name: 'Falar com o suporte' }));
  expect(onSupport).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
  expect(onClose).toHaveBeenCalled();
});

test('sem prazo configurado: texto sem data', () => {
  setup('failed', null);
  expect(screen.getByText(/Se o Pix demorar, a loja para de receber pedidos novos/)).toBeInTheDocument();
});

test('sem transferência: fechada', () => {
  setup(null);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'PixAtrasadoSheet.module.css'), 'utf8'))).toEqual([]);
});
