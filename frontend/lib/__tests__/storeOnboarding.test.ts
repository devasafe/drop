import { loadStoreOnboarding, STEP_HREF } from '../storeOnboarding';
import api from '../api';

jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const notFound = () => Object.assign(new Error('404'), { response: { status: 404 } });
function mockApi(map: Record<string, any>) {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (!(url in map)) return Promise.reject(notFound());
    const v = map[url];
    return v instanceof Error ? Promise.reject(v) : Promise.resolve({ data: v });
  });
}
const me = { verification: { email: { status: 'verified' }, document: { status: 'approved' } } };
const store = { _id: 's1', name: 'Eletro Center', street: 'Rua Augusta', number: '1200', isVerified: false };

beforeEach(() => jest.clearAllMocks());

test('custódia sem loja: começa por "Criar loja" e mantém a ordem do onboardingFlow', async () => {
  mockApi({ '/verification/me': me });
  const r = await loadStoreOnboarding('custodia');
  expect(r.steps.map((s) => s.key)).toEqual(['loja', 'identidade', 'lojaVerif', 'pix', 'plano']);
  expect(r.store).toBeNull();
  expect(r.current?.key).toBe('loja');
  expect(r.current?.href).toBe('/seller/abrir?etapa=loja');
  expect(r.approved).toBe(false);
});

test('custódia com item recusado: motivo por item e etapa atual = verificação da loja', async () => {
  mockApi({
    '/stores/dashboard': { store, products: [{}, {}, {}] },
    '/verification/me': me,
    '/verification/store/s1': {
      facial: { status: 'rejected', rejectionReason: 'Foto escura' },
      cnpj: { status: 'pending', razaoSocial: 'ELETRO CENTER LTDA' },
      address: { status: 'none' },
    },
    '/onboarding/status': { hasPixKey: true, pixKey: '***.456.789-**' },
    '/settings/store-subscription': { currentPlan: 'plan2' },
  });
  const r = await loadStoreOnboarding('custodia');
  const byKey = Object.fromEntries(r.steps.map((s) => [s.key, s]));
  expect(byKey.loja.state).toBe('done');
  expect(byKey.loja.detail).toBe('Eletro Center · Rua Augusta, 1200');
  expect(byKey.identidade.state).toBe('done');
  expect(byKey.lojaVerif.state).toBe('rejected');
  expect(byKey.lojaVerif.reason).toBe('Foto escura');
  expect(byKey.lojaVerif.items?.find((i) => i.key === 'cnpj')?.state).toBe('review');
  expect(byKey.pix.state).toBe('done');
  expect(byKey.pix.detail).toBe('Chave ***.456.789-**');
  expect(byKey.plano.detail).toBe('Pool de motoboys');
  expect(r.current?.key).toBe('lojaVerif');
  expect(r.productsCount).toBe(3);
});

test('custódia com tudo enviado e em análise: allSubmitted sem aprovação', async () => {
  mockApi({
    '/stores/dashboard': { store, products: [] },
    '/verification/me': me,
    '/verification/store/s1': { facial: { status: 'pending' }, cnpj: { status: 'pending' }, address: { status: 'approved' } },
    '/onboarding/status': { hasPixKey: true, pixKey: 'a***@x.com' },
    '/settings/store-subscription': { currentPlan: 'plan1' },
  });
  const r = await loadStoreOnboarding('custodia');
  expect(r.allSubmitted).toBe(true);
  expect(r.approved).toBe(false);
  expect(r.current).toBeNull();
});

test('direto: 3 etapas; conta Asaas válida com aceite fecha o cadastro', async () => {
  mockApi({
    '/stores/dashboard': { store, products: [] },
    '/verification/me': me,
    '/stores/s1/asaas': { success: true, data: { status: 'valid', consent: { version: 'v1', acceptedAt: 'x' }, apiKeyLast4: '8F2A' } },
  });
  const r = await loadStoreOnboarding('direto');
  expect(r.steps.map((s) => s.key)).toEqual(['loja', 'identidade', 'asaas']);
  expect(r.steps[2].state).toBe('done');
  expect(r.steps[2].href).toBe('/seller/conta-asaas?onboarding=1');
  expect(r.approved).toBe(true);
  expect(api.get).not.toHaveBeenCalledWith('/onboarding/status');
});

test('direto: chave recusada pelo Asaas', async () => {
  mockApi({
    '/stores/dashboard': { store, products: [] },
    '/verification/me': me,
    '/stores/s1/asaas': { success: true, data: { status: 'invalid', consent: null } },
  });
  const r = await loadStoreOnboarding('direto');
  expect(r.steps[2].state).toBe('rejected');
  expect(r.steps[2].reason).toBe('Chave recusada pelo Asaas');
});

test('falha que não é 404 no painel: a promessa rejeita (a tela mostra "Tentar de novo")', async () => {
  mockApi({ '/stores/dashboard': Object.assign(new Error('500'), { response: { status: 500 } }), '/verification/me': me });
  await expect(loadStoreOnboarding('custodia')).rejects.toBeTruthy();
});

test('a identidade abre dentro de /seller/abrir', () => {
  expect(STEP_HREF.identidade).toBe('/seller/abrir?etapa=identidade');
});

test('V8: as etapas da custódia também abrem dentro de /seller/abrir; a Conta Asaas tem tela própria', () => {
  expect(STEP_HREF.loja).toBe('/seller/abrir?etapa=loja');
  expect(STEP_HREF.lojaVerif).toBe('/seller/abrir?etapa=lojaVerif');
  expect(STEP_HREF.pix).toBe('/seller/abrir?etapa=pix');
  expect(STEP_HREF.plano).toBe('/seller/abrir?etapa=plano');
  expect(STEP_HREF.asaas).toBe('/seller/conta-asaas?onboarding=1');
});

// Fail closed: leitura que falha = "não sabemos", nunca "concluída" nem "a fazer".
describe('falha de leitura = unknown', () => {
  const full = {
    '/stores/dashboard': { store: { ...store, isVerified: true }, products: [] },
    '/verification/me': me,
    '/verification/store/s1': { facial: { status: 'approved' }, cnpj: { status: 'approved' }, address: { status: 'approved' } },
    '/onboarding/status': { hasPixKey: true, pixKey: '***' },
    '/settings/store-subscription': { currentPlan: 'plan2' },
  };

  test('tudo lido: custódia aprovada', async () => {
    mockApi(full);
    const r = await loadStoreOnboarding('custodia');
    expect(r.approved).toBe(true);
  });

  test.each([
    ['/verification/me', 'identidade'],
    ['/verification/store/s1', 'lojaVerif'],
    ['/onboarding/status', 'pix'],
    ['/settings/store-subscription', 'plano'],
  ])('%s falha: etapa %s fica unknown e nada fecha', async (url, key) => {
    const { [url]: _drop, ...rest } = full as any;
    mockApi(rest);
    const r = await loadStoreOnboarding('custodia');
    expect(r.steps.find((s) => s.key === key)?.state).toBe('unknown');
    expect(r.approved).toBe(false);
    expect(r.allSubmitted).toBe(false);
    expect(r.current?.key).toBe(key);
  });

  test('direto: leitura do Asaas falha = unknown', async () => {
    mockApi({ '/stores/dashboard': { store, products: [] }, '/verification/me': me });
    const r = await loadStoreOnboarding('direto');
    expect(r.steps[2].state).toBe('unknown');
    expect(r.approved).toBe(false);
  });

  test('pix: nunca confunde chave mascarada com real (só exibe o texto recebido)', async () => {
    mockApi({ ...full, '/onboarding/status': { hasPixKey: false } });
    const r = await loadStoreOnboarding('custodia');
    expect(r.steps.find((s) => s.key === 'pix')?.state).toBe('todo');
  });
});
