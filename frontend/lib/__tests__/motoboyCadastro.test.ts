// frontend/lib/__tests__/motoboyCadastro.test.ts
import api from '../api';
import { cadastroStateFrom, etapaAtual, kycItems, kycSummary, loadCadastroState, proximoItemAberto } from '../motoboyCadastro';

jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;

const VER = (email: string, doc: string, reason?: string) => ({ verification: { email: { status: email }, document: { status: doc, rejectionReason: reason } } });
const MB = (facial: string, courier: string, verified = false, extra: any = {}) => ({ verified, facial: { status: facial, rejectionReason: extra.facialReason }, courier: { status: courier, plate: 'FKR2D19', rejectionReason: extra.courierReason } });

test('kycItems traduz os quatro status', () => {
  expect(kycItems(VER('verified', 'pending'), MB('rejected', 'none', false, { facialReason: 'rosto com sombra' }))).toEqual([
    { key: 'email', label: 'E-mail', state: 'done' },
    { key: 'document', label: 'Documento', state: 'pending', reason: undefined },
    { key: 'facial', label: 'Selfie', state: 'rejected', reason: 'rosto com sombra' },
    { key: 'courier', label: 'CNH e placa', state: 'todo', reason: undefined },
  ]);
  expect(kycItems(undefined, undefined).map((i) => i.state)).toEqual(['todo', 'todo', 'todo', 'todo']);
});

describe('etapaAtual (retomada pelo estado do servidor)', () => {
  const st = (v: any, m: any, o: any) => cadastroStateFrom(v, m, o);
  it('falta enviar ou foi recusado → verificação', () => {
    expect(etapaAtual(st(VER('pending', 'approved'), MB('approved', 'approved'), { hasPixKey: true }))).toBe('verificacao');
    expect(etapaAtual(st(VER('verified', 'approved'), MB('rejected', 'approved'), { hasPixKey: true }))).toBe('verificacao');
  });
  it('tudo enviado e sem chave → recebimento', () => {
    expect(etapaAtual(st(VER('verified', 'pending'), MB('pending', 'pending'), { hasPixKey: false }))).toBe('recebimento');
  });
  it('tudo enviado, com chave e não aprovado → análise', () => {
    expect(etapaAtual(st(VER('verified', 'pending'), MB('pending', 'pending'), { hasPixKey: true, pixKey: '***.412.***-07' }))).toBe('analise');
  });
  it('aprovado e com chave → pronto', () => {
    expect(etapaAtual(st(VER('verified', 'approved'), MB('approved', 'approved', true), { hasPixKey: true }))).toBe('pronto');
  });
  it('chave mascarada sem hasPixKey também conta como cadastrada', () => {
    expect(cadastroStateFrom(VER('verified', 'approved'), MB('approved', 'approved', true), { pixKey: '***' }).hasPixKey).toBe(true);
  });
});

test('proximoItemAberto: recusado primeiro, depois o primeiro que falta', () => {
  expect(proximoItemAberto(kycItems(VER('pending', 'approved'), MB('rejected', 'none')))).toBe('facial');
  expect(proximoItemAberto(kycItems(VER('pending', 'approved'), MB('approved', 'none')))).toBe('email');
  expect(proximoItemAberto(kycItems(VER('verified', 'approved'), MB('approved', 'pending')))).toBeNull();
});

test('kycSummary: completa, recusada, pendente e em análise', () => {
  expect(kycSummary(kycItems(VER('verified', 'approved'), MB('approved', 'approved')), true)).toMatchObject({ tone: 'ok', title: 'Verificação completa', action: null });
  expect(kycSummary(kycItems(VER('verified', 'approved'), MB('approved', 'rejected', false, { courierReason: 'Placa ilegível' })), false))
    .toEqual({ tone: 'err', title: 'Verificação recusada', sub: 'CNH e placa: Placa ilegível', action: 'refazer' });
  expect(kycSummary(kycItems(VER('verified', 'approved'), MB('none', 'none')), false))
    .toEqual({ tone: 'warn', title: 'Verificação pendente', sub: 'Falta: selfie, CNH e placa', action: 'continuar' });
  expect(kycSummary(kycItems(VER('verified', 'pending'), MB('pending', 'pending')), false)).toMatchObject({ tone: 'warn', title: 'Verificação em análise', action: null }); // em análise = amarelo (pedido do usuário, 22/10)
});

test('loadCadastroState lê as três rotas e falha fechado se qualquer uma falhar', async () => {
  get.mockImplementation((url: string) => {
    if (url === '/verification/me') return Promise.resolve({ data: VER('verified', 'pending') });
    if (url === '/verification/motoboy/me') return Promise.resolve({ data: MB('pending', 'pending') });
    if (url === '/onboarding/status') return Promise.resolve({ data: { hasPixKey: true, pixKey: '***' } });
    return Promise.reject(new Error(url));
  });
  await expect(loadCadastroState()).resolves.toMatchObject({ verified: false, hasPixKey: true, pixKey: '***' });
  get.mockImplementation((url: string) => (url === '/onboarding/status' ? Promise.reject(new Error('rede')) : Promise.resolve({ data: {} })));
  await expect(loadCadastroState()).rejects.toThrow();
});

test('kycSummary: item recusado com reenvio pedido vira "Reenvie …"; sem reenvio, como antes', () => {
  const com = kycItems(
    { verification: { email: { status: 'verified' }, document: { status: 'rejected', rejectionReason: 'Documento vencido', resendRequested: true } } },
    { facial: { status: 'approved' }, courier: { status: 'none' } },
  );
  expect(kycSummary(com, false)).toEqual({ tone: 'err', title: 'Reenvie o documento', sub: 'Reenvie: Documento vencido', action: 'refazer' });
  const sem = kycItems(
    { verification: { email: { status: 'verified' }, document: { status: 'rejected', rejectionReason: 'Documento vencido' } } },
    { facial: { status: 'approved' }, courier: { status: 'none' } },
  );
  expect(kycSummary(sem, false)).toEqual({ tone: 'err', title: 'Verificação recusada', sub: 'Documento: Documento vencido', action: 'refazer' });
});
