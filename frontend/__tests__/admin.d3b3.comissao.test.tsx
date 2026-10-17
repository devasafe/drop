/**
 * D3b-3 · P4.8 — Regras e taxas · comissão por plano (spec 6): salvar com a comissão alterada abre o impacto
 * de cada plano e pede "Manter as especiais" ou "Igualar todas"; o PUT leva commissionSync; o 409
 * COMMISSION_SYNC_CHOICE_REQUIRED abre ou completa a folha; o aviso antigo "salvar iguala todas" saiu.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import api from '../lib/api';
import AdminSettings from '../pages/admin/settings';

const mockRouter = { pathname: '/admin/settings', asPath: '/admin/settings', push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => ({ ...mockRouter, query: {} }) }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const put = api.put as jest.Mock;

const CONFIG = {
  _id: 'cfg', commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5,
  motoboyCutPerDelivery: 5, motoboyCutPerKm: 1, motoboyMinimumWithdraw: 10, storeMinimumWithdraw: 10,
  motoboyCommissionPercent: 20, cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10,
  storeAcceptTimeoutMin: 10, poolTimeoutMin: 15, customerAbsentWaitMin: 15, updatedAt: '2026-09-22T12:00:00.000Z',
};
const GERENTE = adminAuth('gerente_geral', ['settings:manage']);
const IMPACT: Record<string, unknown> = {
  '/settings/commission-impact?plan=plan2&value=12': {
    oldValue: 15, newValue: 12, atOldValue: 4, special: [{ storeId: 's9', storeName: 'Loja Especial', rate: 10 }],
  },
  '/settings/commission-impact?plan=plan1&value=9': { oldValue: 10, newValue: 9, atOldValue: 3, special: [] },
  '/settings/commission-impact?plan=plan1&value=10': { oldValue: 11, newValue: 10, atOldValue: 2, special: [] },
  '/settings/commission-impact?plan=plan3&value=5': { oldValue: 6, newValue: 5, atOldValue: 1, special: [] },
};
const saved = (config: Record<string, unknown>, sync: unknown[] = []) => ({
  data: { config, commissionSync: sync, message: 'ok' },
});

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url: string) => {
    if (url === '/settings/platform-config') return Promise.resolve({ data: CONFIG });
    if (url in IMPACT) return Promise.resolve({ data: IMPACT[url] });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  put.mockResolvedValue(saved(CONFIG));
});

const changePlan = async (label: string, value: string) => {
  fireEvent.change(await screen.findByLabelText(label), { target: { value } });
};
const sheet = () => screen.findByRole('dialog', { name: 'Comissão alterada: e as lojas?' });

it('o aviso antigo "salvar iguala todas" saiu', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  await screen.findByLabelText('Plano 2 · com motoboys (%)');
  expect(screen.queryByText(/inclusive às que tinham uma especial/)).toBeNull();
});

it('salvar sem mudar comissão: PUT da config inteira, sem commissionSync e sem ler impacto', async () => {
  put.mockResolvedValue({ data: { config: { ...CONFIG, motoboyCutPerKm: 2 }, message: 'ok' } });
  renderAdminPage(<AdminSettings />, GERENTE);
  await changePlan('Por km de rota (R$)', '2');
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
  await waitFor(() => expect(put).toHaveBeenCalledWith('/settings/platform-config', { ...CONFIG, motoboyCutPerKm: 2 }));
  expect(get.mock.calls.some(([u]) => String(u).startsWith('/settings/commission-impact'))).toBe(false);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mockToast).toHaveBeenCalledWith('Regras salvas', 'success');
});

it('Plano 2 alterado: mostra o impacto, exige a escolha e salva com "Manter as especiais"', async () => {
  put.mockResolvedValue(saved({ ...CONFIG, commissionPlan2: 12 }, [{ plan: 'plan2', oldValue: 15, newValue: 12, choice: 'keep_special', storesUpdated: 4 }]));
  renderAdminPage(<AdminSettings />, GERENTE);
  await changePlan('Plano 2 · com motoboys (%)', '12');
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
  const s = await sheet();
  expect(get).toHaveBeenCalledWith('/settings/commission-impact?plan=plan2&value=12');
  expect(await within(s).findByText('Plano 2: 15% → 12%')).toBeInTheDocument();
  expect(within(s).getByText('4 lojas no valor do plano passam para 12%.')).toBeInTheDocument();
  expect(within(s).getByText('1 loja com comissão especial:')).toBeInTheDocument();
  expect(within(s).getByText('Loja Especial · 10%')).toBeInTheDocument();
  const ok = within(s).getByRole('button', { name: 'Salvar e aplicar' });
  expect(ok).toBeDisabled();
  expect(put).not.toHaveBeenCalled();
  fireEvent.click(within(s).getByRole('radio', { name: /Manter as especiais/ }));
  expect(ok).toBeEnabled();
  fireEvent.click(ok);
  await waitFor(() => expect(put).toHaveBeenCalledWith('/settings/platform-config', {
    ...CONFIG, commissionPlan2: 12, commissionSync: { plan2: 'keep_special' },
  }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(mockToast).toHaveBeenCalledWith('Regras salvas · 4 lojas atualizadas', 'success');
  expect(screen.getByRole('button', { name: 'Nenhuma mudança' })).toBeDisabled();
});

it('"Igualar todas" vai como all', async () => {
  put.mockResolvedValue(saved({ ...CONFIG, commissionPlan2: 12 }, [{ plan: 'plan2', oldValue: 15, newValue: 12, choice: 'all', storesUpdated: 5 }]));
  renderAdminPage(<AdminSettings />, GERENTE);
  await changePlan('Plano 2 · com motoboys (%)', '12');
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
  const s = await sheet();
  fireEvent.click(await within(s).findByRole('radio', { name: /Igualar todas/ }));
  expect(within(s).getByText('As 5 lojas do plano passam para 12%.')).toBeInTheDocument();
  fireEvent.click(within(s).getByRole('button', { name: 'Salvar e aplicar' }));
  await waitFor(() => expect(put).toHaveBeenCalledWith('/settings/platform-config', expect.objectContaining({
    commissionSync: { plan2: 'all' },
  })));
  expect(mockToast).toHaveBeenCalledWith('Regras salvas · 5 lojas atualizadas', 'success');
});

it('dois planos: o sem especiais não pede escolha; o outro pede', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  await changePlan('Plano 1 · vitrine (%)', '9');
  await changePlan('Plano 2 · com motoboys (%)', '12');
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 2 mudanças' }));
  const s = await sheet();
  const plano1 = await within(s).findByRole('region', { name: 'Plano 1' });
  expect(await within(plano1).findByText('Nenhuma loja tem comissão especial neste plano.')).toBeInTheDocument();
  expect(within(plano1).queryByRole('radio')).toBeNull();
  const ok = within(s).getByRole('button', { name: 'Salvar e aplicar' });
  await within(s).findByText('Loja Especial · 10%');
  expect(ok).toBeDisabled();
  fireEvent.click(within(s).getByRole('radio', { name: /Igualar todas/ }));
  fireEvent.click(ok);
  await waitFor(() => expect(put).toHaveBeenCalledWith('/settings/platform-config', {
    ...CONFIG, commissionPlan1: 9, commissionPlan2: 12, commissionSync: { plan1: 'keep_special', plan2: 'all' },
  }));
});

it('impacto que não carrega: erro com "Tentar de novo" e nada é salvo', async () => {
  let fails = true;
  get.mockImplementation((url: string) => {
    if (url === '/settings/platform-config') return Promise.resolve({ data: CONFIG });
    if (url === '/settings/commission-impact?plan=plan2&value=12') {
      return fails
        ? Promise.reject({ response: { status: 500, data: { error: 'Erro ao calcular o impacto' } } })
        : Promise.resolve({ data: IMPACT[url] });
    }
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  renderAdminPage(<AdminSettings />, GERENTE);
  await changePlan('Plano 2 · com motoboys (%)', '12');
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
  const s = await sheet();
  expect(await within(s).findByText('Erro ao calcular o impacto')).toBeInTheDocument();
  expect(within(s).getByRole('button', { name: 'Salvar e aplicar' })).toBeDisabled();
  fails = false;
  fireEvent.click(within(s).getByRole('button', { name: 'Tentar de novo' }));
  expect(await within(s).findByText('Plano 2: 15% → 12%')).toBeInTheDocument();
  expect(put).not.toHaveBeenCalled();
});

it('fechar a folha não salva e mantém a edição', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  await changePlan('Plano 2 · com motoboys (%)', '12');
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
  const s = await sheet();
  fireEvent.click(within(s).getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(put).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Salvar 1 mudança' })).toBeEnabled();
});

it('409 COMMISSION_SYNC_CHOICE_REQUIRED num salvar sem comissão local: abre a folha com o plano que o servidor apontou', async () => {
  put
    .mockRejectedValueOnce({ response: { status: 409, data: { error: 'Escolha o que fazer com as lojas dos planos com comissão alterada', code: 'COMMISSION_SYNC_CHOICE_REQUIRED', plans: ['plan1'] } } })
    .mockResolvedValueOnce(saved({ ...CONFIG, motoboyCutPerKm: 2 }, [{ plan: 'plan1', oldValue: 11, newValue: 10, choice: 'keep_special', storesUpdated: 2 }]));
  renderAdminPage(<AdminSettings />, GERENTE);
  await changePlan('Por km de rota (R$)', '2');
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
  const s = await sheet();
  expect(await within(s).findByText('Plano 1: 11% → 10%')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/settings/commission-impact?plan=plan1&value=10');
  fireEvent.click(within(s).getByRole('button', { name: 'Salvar e aplicar' }));
  await waitFor(() => expect(put).toHaveBeenLastCalledWith('/settings/platform-config', {
    ...CONFIG, motoboyCutPerKm: 2, commissionSync: { plan1: 'keep_special' },
  }));
  expect(mockToast).toHaveBeenCalledWith('Regras salvas · 2 lojas atualizadas', 'success');
});

it('409 com mais um plano dentro da folha: avisa, acrescenta o plano e o próximo salvar leva os dois', async () => {
  put
    .mockRejectedValueOnce({ response: { status: 409, data: { error: 'x', code: 'COMMISSION_SYNC_CHOICE_REQUIRED', plans: ['plan2', 'plan3'] } } })
    .mockResolvedValueOnce(saved({ ...CONFIG, commissionPlan2: 12 }, [
      { plan: 'plan2', oldValue: 15, newValue: 12, choice: 'keep_special', storesUpdated: 4 },
      { plan: 'plan3', oldValue: 6, newValue: 5, choice: 'keep_special', storesUpdated: 1 },
    ]));
  renderAdminPage(<AdminSettings />, GERENTE);
  await changePlan('Plano 2 · com motoboys (%)', '12');
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
  const s = await sheet();
  fireEvent.click(await within(s).findByRole('radio', { name: /Manter as especiais/ }));
  fireEvent.click(within(s).getByRole('button', { name: 'Salvar e aplicar' }));
  expect(await within(s).findByText('A comissão também mudou no servidor: Plano 3. Escolha abaixo e salve de novo.')).toBeInTheDocument();
  expect(await within(s).findByText('Plano 3: 6% → 5%')).toBeInTheDocument();
  fireEvent.click(within(s).getByRole('button', { name: 'Salvar e aplicar' }));
  await waitFor(() => expect(put).toHaveBeenLastCalledWith('/settings/platform-config', {
    ...CONFIG, commissionPlan2: 12, commissionSync: { plan2: 'keep_special', plan3: 'keep_special' },
  }));
  expect(mockToast).toHaveBeenCalledWith('Regras salvas · 5 lojas atualizadas', 'success');
});

it('comissão 8,5 → 8,50 (mesmos centavos): salva sem abrir a folha e sem commissionSync', async () => {
  const cfg = { ...CONFIG, commissionPlan1: 8.5 };
  get.mockImplementation((url: string) => (url === '/settings/platform-config' ? Promise.resolve({ data: cfg }) : Promise.reject(new Error(url))));
  put.mockResolvedValue(saved({ ...cfg, motoboyCutPerKm: 2 }));
  renderAdminPage(<AdminSettings />, GERENTE);
  await changePlan('Por km de rota (R$)', '2');
  await changePlan('Plano 1 · vitrine (%)', '8.50');
  fireEvent.click(screen.getByRole('button', { name: /Salvar \d mudança/ }));
  await waitFor(() => expect(put).toHaveBeenCalledWith('/settings/platform-config', expect.not.objectContaining({ commissionSync: expect.anything() })));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('clique duplo em "Salvar e aplicar": um PUT só', async () => {
  let release: (v: unknown) => void = () => {};
  put.mockReturnValue(new Promise((r) => { release = r; }));
  renderAdminPage(<AdminSettings />, GERENTE);
  await changePlan('Plano 2 · com motoboys (%)', '12');
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
  const s = await sheet();
  fireEvent.click(await within(s).findByRole('radio', { name: /Manter as especiais/ }));
  const ok = within(s).getByRole('button', { name: 'Salvar e aplicar' });
  fireEvent.click(ok);
  fireEvent.click(ok);
  expect(put).toHaveBeenCalledTimes(1);
  release(saved({ ...CONFIG, commissionPlan2: 12 }, []));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(put).toHaveBeenCalledTimes(1);
});

it('409 só com planos já mostrados: relê o impacto e pede a escolha de novo', async () => {
  let reads = 0;
  get.mockImplementation((url: string) => {
    if (url === '/settings/platform-config') return Promise.resolve({ data: CONFIG });
    if (url === '/settings/commission-impact?plan=plan2&value=12') {
      reads += 1;
      return Promise.resolve({ data: reads === 1 ? IMPACT[url] : { oldValue: 14, newValue: 12, atOldValue: 2, special: [{ storeId: 's9', storeName: 'Loja Especial', rate: 10 }] } });
    }
    return Promise.reject(new Error(url));
  });
  put
    .mockRejectedValueOnce({ response: { status: 409, data: { error: 'x', code: 'COMMISSION_SYNC_CHOICE_REQUIRED', plans: ['plan2'] } } })
    .mockResolvedValueOnce(saved({ ...CONFIG, commissionPlan2: 12 }, []));
  renderAdminPage(<AdminSettings />, GERENTE);
  await changePlan('Plano 2 · com motoboys (%)', '12');
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 mudança' }));
  const s = await sheet();
  fireEvent.click(await within(s).findByRole('radio', { name: /Manter as especiais/ }));
  fireEvent.click(within(s).getByRole('button', { name: 'Salvar e aplicar' }));
  expect(await within(s).findByText(/A comissão mudou no servidor\. Conferimos o impacto de novo/)).toBeInTheDocument();
  expect(await within(s).findByText('Plano 2: 14% → 12%')).toBeInTheDocument();
  expect(within(s).getByRole('button', { name: 'Salvar e aplicar' })).toBeDisabled();
  fireEvent.click(within(s).getByRole('radio', { name: /Igualar todas/ }));
  fireEvent.click(within(s).getByRole('button', { name: 'Salvar e aplicar' }));
  await waitFor(() => expect(put).toHaveBeenLastCalledWith('/settings/platform-config', expect.objectContaining({ commissionSync: { plan2: 'all' } })));
});
