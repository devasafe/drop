/**
 * D3b-2b · P3.5 — "Reenvie: …" × "Recusado: …" nas telas da pessoa (ruling 3). O item recusado vem inteiro de
 * GET /verification/me, /verification/store/:id e /verification/motoboy/me, com `resendRequested`:
 * - loja: Documentos e o checklist do Abrir/Agora;
 * - motoboy: cadastro e perfil;
 * - identidade (IdentityCheck) e /verificacao.
 */
import { render, screen } from '@testing-library/react';
import api from '../lib/api';
import { rejectionLine } from '../lib/verificationRejection';
import { kycItems } from '../lib/motoboyCadastro';
import { loadStoreOnboarding } from '../lib/storeOnboarding';
import { stepSubText } from '../components/seller/abrir/stepView';
import { DocumentosStep } from '../components/seller/abrir/DocumentosStep';
import { VerificacaoStep } from '../components/motoboy/cadastro/VerificacaoStep';
import { PerfilScreen } from '../components/motoboy/perfil/PerfilScreen';
import { IdentityCheck } from '../components/drop/IdentityCheck';
import VerificacaoPage from '../pages/verificacao';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/x', asPath: '/x', isReady: true }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'm1', _id: 'm1', name: 'Carlos Lima', email: 'carlos@x.com', role: 'motoboy', activeRole: 'motoboy' },
    loading: false,
    logout: jest.fn(),
  }),
}));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, children }: any) => <div><h1>{title}</h1>{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../components/MotoboyRatingsBlock', () => ({ __esModule: true, default: () => null }));
jest.mock('../hooks/useClienteRedirect', () => ({ useClienteRedirect: () => undefined }));
jest.mock('../hooks/useLojistaRedirect', () => ({ useLojistaRedirect: () => undefined }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));

const get = api.get as jest.Mock;
let data: Record<string, unknown> = {};

beforeEach(() => {
  jest.clearAllMocks();
  data = {};
  get.mockImplementation((url: string) =>
    (url in data ? Promise.resolve({ data: data[url] }) : Promise.reject(new Error(`GET inesperado: ${url}`))));
});

it('rejectionLine: "Reenvie: …" com reenvio pedido; senão "Recusado"/"Recusada"; sem motivo, o texto de apoio', () => {
  expect(rejectionLine('Foto ilegível', true, { fallback: 'envie de novo' })).toBe('Reenvie: Foto ilegível');
  expect(rejectionLine('Foto ilegível', false, { fallback: 'envie de novo' })).toBe('Recusado: Foto ilegível');
  expect(rejectionLine('Foto ilegível', undefined, { word: 'Recusada', fallback: 'envie de novo' })).toBe('Recusada: Foto ilegível');
  expect(rejectionLine('  ', true, { fallback: 'envie de novo' })).toBe('Reenvie: envie de novo');
  expect(rejectionLine(null, null, { fallback: 'veja o que corrigir' })).toBe('Recusado: veja o que corrigir');
});

it('motoboy (kycItems) e loja (checklist) levam o pedido de reenvio do item e da etapa', async () => {
  const items = kycItems(
    { verification: { email: { status: 'verified' }, document: { status: 'rejected', rejectionReason: 'Documento vencido', resendRequested: true } } },
    { facial: { status: 'rejected', rejectionReason: 'Foto ilegível' }, courier: { status: 'none' } },
  );
  expect(items.map((i) => [i.key, i.resend])).toEqual([['email', undefined], ['document', true], ['facial', undefined], ['courier', undefined]]);

  data = {
    '/stores/dashboard': { store: { _id: 's1', name: 'Eletro Center', isVerified: false }, products: [] },
    '/verification/me': { verification: { email: { status: 'verified' }, document: { status: 'approved' } } },
    '/verification/store/s1': {
      facial: { status: 'approved' },
      cnpj: { status: 'rejected', rejectionReason: 'CNPJ inválido ou inativo', resendRequested: true },
      address: { status: 'pending' },
    },
    '/onboarding/status': { hasPixKey: true },
    '/settings/store-subscription': { currentPlan: 'plan2' },
  };
  const r = await loadStoreOnboarding('custodia');
  const verif = r.steps.find((s) => s.key === 'lojaVerif');
  expect(verif?.resend).toBe(true);
  expect(verif?.items?.find((i) => i.key === 'cnpj')?.resend).toBe(true);
  expect(stepSubText(verif!)).toBe('Reenvie: CNPJ inválido ou inativo');
  expect(stepSubText({ state: 'rejected', reason: 'Foto cortada' })).toBe('Recusado: Foto cortada');
});

it('loja (Documentos): "Reenvie" no item com reenvio pedido e "Recusado" no outro', async () => {
  data['/verification/store/s1'] = {
    isVerified: false,
    missing: [],
    facial: { status: 'rejected', rejectionReason: 'Selfie não confere com o documento', resendRequested: true },
    cnpj: { status: 'rejected', rejectionReason: 'CNPJ inválido ou inativo', resendRequested: false },
    address: { status: 'pending' },
  };
  render(<DocumentosStep storeId="s1" storeCnpj="12345678000190" onEditStore={jest.fn()} />);
  expect(await screen.findByText('Reenvie: Selfie não confere com o documento')).toBeInTheDocument();
  expect(screen.getByText('Recusado: CNPJ inválido ou inativo')).toBeInTheDocument();
});

it('motoboy (cadastro): "Reenvie" no documento com reenvio pedido; "Recusada" na selfie sem', async () => {
  data = {
    '/verification/me': {
      verification: { email: { status: 'verified' }, document: { status: 'rejected', rejectionReason: 'Documento vencido', resendRequested: true } },
    },
    '/verification/motoboy/me': { verified: false, facial: { status: 'rejected', rejectionReason: 'Foto ilegível' }, courier: { status: 'none' } },
    '/user/me': { email: 'carlos@x.com', cpf: '38741255607', rg: '' },
  };
  render(<VerificacaoStep onChanged={jest.fn()} />);
  expect(await screen.findByText('Reenvie: Documento vencido')).toBeInTheDocument();
  expect(screen.getByText('Recusada: Foto ilegível')).toBeInTheDocument();
});

it('motoboy (perfil): CNH e placa com reenvio pedido', async () => {
  data = {
    '/verification/me': { verification: { email: { status: 'verified' }, document: { status: 'approved' } } },
    '/verification/motoboy/me': {
      verified: false,
      facial: { status: 'approved' },
      courier: { status: 'rejected', plate: 'FKR2D19', rejectionReason: 'Foto ilegível', resendRequested: true },
    },
    '/onboarding/status': { hasPixKey: true, pixKey: '***.412.***-07' },
    '/user/me': { createdAt: '2026-07-03T15:00:00Z' },
    '/deliveries/motoboy/m1/ratings': [],
  };
  render(<PerfilScreen />);
  // a linha da CNH e o resumo da verificação dizem o mesmo (Correção 1)
  expect(await screen.findAllByText('Reenvie: Foto ilegível')).toHaveLength(2);
  expect(screen.getByText('Reenvie a CNH e a placa')).toBeInTheDocument();
});

it('identidade (IdentityCheck): título "Reenvie o documento" quando o DROP pediu reenvio', async () => {
  data = {
    '/verification/me': {
      verification: { email: { status: 'verified' }, document: { status: 'rejected', rejectionReason: 'Foto ilegível', resendRequested: true } },
    },
    '/user/me': { cpf: '' },
  };
  render(<IdentityCheck />);
  expect(await screen.findByText('Reenvie o documento')).toBeInTheDocument();
  expect(screen.getByText('Foto ilegível')).toBeInTheDocument();
});

it('/verificacao: "Reenvie: …" no documento com reenvio pedido', async () => {
  data = {
    '/verification/me': {
      verification: {
        email: { status: 'verified' }, phone: { status: 'none' },
        document: { status: 'rejected', rejectionReason: 'Foto ilegível', resendRequested: true },
      },
    },
    '/user/me': { cpf: '', rg: '' },
  };
  render(<VerificacaoPage />);
  expect(await screen.findByText('Reenvie: Foto ilegível')).toBeInTheDocument();
});

it('identidade (IdentityCheck): o selo também diz "Reenvie" quando o DROP pediu reenvio; sem pedido, "Recusado"', async () => {
  data = {
    '/verification/me': {
      verification: { email: { status: 'verified' }, document: { status: 'rejected', rejectionReason: 'Foto ilegível', resendRequested: true } },
    },
    '/user/me': { cpf: '' },
  };
  const a = render(<IdentityCheck />);
  expect(await screen.findByText('Reenvie')).toBeInTheDocument();
  a.unmount();
  data['/verification/me'] = {
    verification: { email: { status: 'verified' }, document: { status: 'rejected', rejectionReason: 'Foto ilegível' } },
  };
  render(<IdentityCheck />);
  expect(await screen.findByText('Documento recusado')).toBeInTheDocument();
  expect(screen.getByText('Recusado')).toBeInTheDocument();
});
