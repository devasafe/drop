import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerCoupons, { couponState, suggestCode } from '../pages/seller/coupons';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/seller/coupons' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));

const future = new Date(Date.now() + 20 * 86400000).toISOString();
const past = new Date(Date.now() - 5 * 86400000).toISOString();
const C1 = { _id: 'c1', code: 'VOLTA10', discountType: 'percent', discountValue: 10, minOrderValue: 80, maxUses: 50, usedCount: 23, validFrom: past, validUntil: future, isActive: true, isPublic: true, endedAt: null };
const C2 = { _id: 'c2', code: 'PRIMEIRA15', discountType: 'percent', discountValue: 15, minOrderValue: null, maxUses: null, usedCount: 41, validFrom: past, validUntil: future, isActive: false, isPublic: false, endedAt: past };
let mockList: any[];

beforeEach(() => {
  jest.clearAllMocks();
  mockList = [C1, C2];
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/coupons') return Promise.resolve({ data: mockList });
    if (url === '/coupons/c1/results') return Promise.resolve({ data: { success: true, data: { uses: 23, ordersPaid: 20, salesTotal: 2180, discountTotal: 218 } } });
    return Promise.resolve({ data: {} });
  });
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true } });
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true } });
});

const renderPage = () => render(<ToastProvider><SellerCoupons /></ToastProvider>);

test('ativos com switch e selo; encerrados sem switch', async () => {
  renderPage();
  const card = await screen.findByRole('article', { name: 'Cupom VOLTA10' });
  expect(within(card).getByRole('switch', { name: 'Ativo' })).toHaveAttribute('aria-checked', 'true');
  expect(within(card).getByText('Público')).toBeInTheDocument();
  expect(within(card).getByText('23 de 50 usos')).toBeInTheDocument();
  const encerrados = screen.getByRole('region', { name: 'Encerrados' });
  expect(within(encerrados).getByText('PRIMEIRA15')).toBeInTheDocument();
  expect(within(encerrados).queryByRole('switch')).not.toBeInTheDocument();
  expect(within(encerrados).getByText(/41 usos/)).toBeInTheDocument();
});

test('criar: código sugerido, público e corpo do contrato', async () => {
  renderPage();
  await screen.findByRole('article', { name: 'Cupom VOLTA10' });
  fireEvent.click(screen.getByText('Criar'));
  fireEvent.change(screen.getByLabelText('Valor do desconto'), { target: { value: '15' } });
  expect((screen.getByLabelText('Código') as HTMLInputElement).value).toBe('VOLTA15');
  fireEvent.click(screen.getByRole('switch', { name: 'Mostrar na página da loja' }));
  fireEvent.click(screen.getByText('Criar cupom'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/coupons', expect.objectContaining({
    code: 'VOLTA15', type: 'store', discountType: 'percent', discountValue: 15, isPublic: true,
  })));
});

test('valor ambíguo (falha fechado): não envia', async () => {
  renderPage();
  await screen.findByRole('article', { name: 'Cupom VOLTA10' });
  fireEvent.click(screen.getByText('Criar'));
  fireEvent.click(screen.getByText('R$ de desconto'));
  fireEvent.change(screen.getByLabelText('Valor do desconto'), { target: { value: '1.000' } });
  fireEvent.click(screen.getByText('Criar cupom'));
  expect(await screen.findByText('Informe um desconto válido, maior que zero.')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('código repetido: erro no campo, sem fechar', async () => {
  (api.post as jest.Mock).mockRejectedValue({ response: { status: 409, data: { error: 'Código de cupom já existe' } } });
  renderPage();
  await screen.findByRole('article', { name: 'Cupom VOLTA10' });
  fireEvent.click(screen.getByText('Criar'));
  fireEvent.change(screen.getByLabelText('Valor do desconto'), { target: { value: '10' } });
  fireEvent.click(screen.getByText('Criar cupom'));
  expect(await screen.findByText('Esse código já está em uso. Tente outro.')).toBeInTheDocument();
  expect(screen.getByText('Criar cupom')).toBeInTheDocument();
});

test('encerrar pede confirmação e chama POST /coupons/:id/end', async () => {
  renderPage();
  const card = await screen.findByRole('article', { name: 'Cupom VOLTA10' });
  fireEvent.click(within(card).getByText('Encerrar'));
  expect(screen.getByText('Encerrar o cupom VOLTA10?')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Encerrar cupom'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/coupons/c1/end'));
});

test('switch em cupom encerrado no servidor: 409 COUPON_ENDED vira aviso', async () => {
  (api.put as jest.Mock).mockRejectedValue({ response: { status: 409, data: { success: false, error: { message: 'x', statusCode: 409, code: 'COUPON_ENDED' } } } });
  renderPage();
  const card = await screen.findByRole('article', { name: 'Cupom VOLTA10' });
  fireEvent.click(within(card).getByRole('switch', { name: 'Ativo' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/coupons/c1/toggle'));
  expect(await screen.findByText('Este cupom foi encerrado e não pode voltar.')).toBeInTheDocument();
});

test('resultados mostram vendas e desconto', async () => {
  renderPage();
  const card = await screen.findByRole('article', { name: 'Cupom VOLTA10' });
  fireEvent.click(within(card).getByText('Resultados'));
  expect(await screen.findByText('R$ 2.180,00')).toBeInTheDocument();
  expect(screen.getByText('R$ 218,00')).toBeInTheDocument();
});

test('lista vazia', async () => {
  mockList = [];
  renderPage();
  expect(await screen.findByText('Cupom traz o cliente de volta')).toBeInTheDocument();
});

test('regras puras e página sem style inline', () => {
  expect(couponState({ ...C1 } as any)).toBe('ativo');
  expect(couponState({ ...C1, isActive: false } as any)).toBe('pausado');
  expect(couponState({ ...C2 } as any)).toBe('encerrado');
  expect(couponState({ ...C1, validUntil: past } as any)).toBe('encerrado');
  expect(suggestCode('percent', '12')).toBe('VOLTA12');
  expect(suggestCode('fixed', '20')).toBe('DESCONTO20');
  const src = fs.readFileSync(path.join(__dirname, '../pages/seller/coupons.tsx'), 'utf8');
  expect(src).not.toMatch(/style=\{\{/);
});
