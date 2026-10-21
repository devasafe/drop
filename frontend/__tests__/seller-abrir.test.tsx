import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SellerAbrir from '../pages/seller/abrir';
import { loadStoreOnboarding } from '../lib/storeOnboarding';
import api from '../lib/api';

const mockPush = jest.fn();
let mockQuery: any = {};
let mockMode = 'custodia';
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: mockQuery, pathname: '/seller/abrir' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, back, actions, children }: any) => <div>{back && <button type="button" onClick={() => mockPush(back)}>Voltar</button>}<h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: mockMode, directCardEnabled: false, loading: false }) }));
jest.mock('../components/drop/IdentityCheck', () => ({
  // Só com o texto da loja (audience="loja") o botão tem o nome que os testes procuram.
  IdentityCheck: ({ onDone, audience }: any) => <button type="button" onClick={onDone}>{audience === 'loja' ? 'Concluir identidade' : 'texto de cliente'}</button>,
}));
// As etapas embutidas têm testes próprios (components/seller/abrir, components/onboarding); aqui só a costura.
jest.mock('../components/seller/abrir/DadosLojaStep', () => ({
  DadosLojaStep: ({ store, cnpjRequired, onDone }: any) => <button type="button" onClick={onDone}>{`etapa loja ${store ? 'edição' : 'nova'} ${cnpjRequired ? 'cnpj obrigatório' : 'cnpj opcional'}`}</button>,
}));
jest.mock('../components/seller/abrir/DocumentosStep', () => ({
  DocumentosStep: ({ storeId, onChanged }: any) => <button type="button" onClick={onChanged}>{`etapa documentos ${storeId}`}</button>,
}));
jest.mock('../components/onboarding/RecebimentoForm', () => ({
  RecebimentoForm: ({ onSaved }: any) => <button type="button" onClick={onSaved}>etapa recebimento</button>,
}));
jest.mock('../components/seller/abrir/PlanoStep', () => ({
  PlanoStep: ({ onDone }: any) => <button type="button" onClick={onDone}>etapa plano</button>,
}));
jest.mock('../lib/storeOnboarding', () => {
  const actual = jest.requireActual('../lib/storeOnboarding');
  return { ...actual, loadStoreOnboarding: jest.fn() };
});
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
// V12: fora do painel por padrão (como nos testes antigos); os testes do painel trocam o valor.
const outOfPanel = () => ({ inPanel: false, store: null, products: [], loading: false, error: null, refresh: jest.fn(() => Promise.resolve()) });
let mockPanel: any = outOfPanel();
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));

const step = (key: string, label: string, state: string, extra: any = {}) => ({ key, label, path: `/${key}`, href: `/href-${key}`, state, detail: `detalhe ${key}`, ...extra });
const store = { _id: 's1', name: 'Eletro Center', operatingHours: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockPanel = outOfPanel();
  mockQuery = {};
  mockMode = 'custodia';
  (api.get as jest.Mock).mockResolvedValue({ data: { settlementMode: 'direto', saasMonthlyFee: 149, saasTrialDays: 14 } });
});

test('checklist: etapa atual em destaque e aberta DENTRO da tela (sem mandar para outra rota)', async () => {
  const steps = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done'), step('lojaVerif', 'Verificar loja', 'todo'), step('pix', 'Recebimento (PIX)', 'todo'), step('plano', 'Plano', 'todo')];
  (loadStoreOnboarding as jest.Mock).mockResolvedValue({ mode: 'custodia', store, productsCount: 0, steps, current: steps[2], allSubmitted: false, approved: false });
  render(<SellerAbrir />);
  expect(await screen.findByText('2 de 5')).toBeInTheDocument();
  expect(screen.getByText('agora')).toBeInTheDocument();
  expect(screen.getByText('etapa documentos s1')).toBeInTheDocument();
  // título do protótipo, uma vez só (sem repetir no bloco de progresso)
  expect(screen.getAllByText('Abrir sua loja')).toHaveLength(1);
  expect(screen.queryByText('Abrir a loja')).not.toBeInTheDocument();
  expect(screen.queryByText('Continuar: Verificar loja')).not.toBeInTheDocument();
  expect(screen.queryByText('etapa recebimento')).not.toBeInTheDocument();
  // tocar numa etapa leva para ela (dentro de /seller/abrir, pelo href da etapa)
  fireEvent.click(screen.getByText('Recebimento (PIX)'));
  expect(mockPush).toHaveBeenCalledWith('/href-pix');
});

test('etapa concluída embutida: relê o checklist sem sair da tela', async () => {
  const steps = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done'), step('lojaVerif', 'Verificar loja', 'done'), step('pix', 'Recebimento (PIX)', 'todo'), step('plano', 'Plano', 'todo')];
  const next = steps.map((s) => (s.key === 'pix' ? { ...s, state: 'done' } : s));
  (loadStoreOnboarding as jest.Mock)
    .mockResolvedValueOnce({ mode: 'custodia', store, productsCount: 0, steps, current: steps[3], allSubmitted: false, approved: false })
    .mockResolvedValueOnce({ mode: 'custodia', store, productsCount: 0, steps: next, current: next[4], allSubmitted: false, approved: false });
  render(<SellerAbrir />);
  fireEvent.click(await screen.findByText('etapa recebimento'));
  expect(await screen.findByText('etapa plano')).toBeInTheDocument();
  expect(loadStoreOnboarding).toHaveBeenCalledTimes(2);
  expect(mockPush).not.toHaveBeenCalled();
});

test('?etapa= abre aquela etapa embutida, com voltar para o checklist e "Continuar" para a atual', async () => {
  mockQuery = { etapa: 'loja' };
  const steps = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done'), step('lojaVerif', 'Verificar loja', 'todo'), step('pix', 'Recebimento (PIX)', 'todo'), step('plano', 'Plano', 'todo')];
  (loadStoreOnboarding as jest.Mock).mockResolvedValue({ mode: 'custodia', store, productsCount: 0, steps, current: steps[2], allSubmitted: false, approved: false });
  render(<SellerAbrir />);
  // loja já criada → modo edição, não um formulário de criação de novo
  expect(await screen.findByText('etapa loja edição cnpj obrigatório')).toBeInTheDocument();
  expect(screen.queryByText('etapa documentos s1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Continuar: Verificar loja'));
  expect(mockPush).toHaveBeenCalledWith('/href-lojaVerif');
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  expect(mockPush).toHaveBeenCalledWith('/seller/abrir');
  // salvar a etapa aberta por ?etapa= volta ao checklist (que relê tudo ao trocar a rota)
  mockPush.mockClear();
  fireEvent.click(screen.getByText('etapa loja edição cnpj obrigatório'));
  expect(mockPush).toHaveBeenCalledWith('/seller/abrir');
});

test('a etapa da loja concluída mostra "Editar"; a identidade atual também abre embutida', async () => {
  const steps = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'todo')];
  (loadStoreOnboarding as jest.Mock).mockResolvedValue({ mode: 'custodia', store, productsCount: 0, steps, current: steps[1], allSubmitted: false, approved: false });
  render(<SellerAbrir />);
  expect(await screen.findByText('Editar')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Concluir identidade'));
  await waitFor(() => expect(loadStoreOnboarding).toHaveBeenCalledTimes(2));
});

test('etapa recusada mostra o motivo no checklist', async () => {
  const steps = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'rejected', { reason: 'Documento ilegível' }), step('lojaVerif', 'Verificar loja', 'todo'), step('pix', 'Recebimento (PIX)', 'todo'), step('plano', 'Plano', 'todo')];
  (loadStoreOnboarding as jest.Mock).mockResolvedValue({ mode: 'custodia', store, productsCount: 0, steps, current: steps[1], allSubmitted: false, approved: false });
  render(<SellerAbrir />);
  expect(await screen.findByText('Recusado: Documento ilegível')).toBeInTheDocument();
});

test('em análise: item recusado com motivo e "Reenviar"; "Enquanto isso" com produtos', async () => {
  const items = [
    { key: 'facial', label: 'Foto do rosto', state: 'done' },
    { key: 'cnpj', label: 'CNPJ', state: 'review' },
    { key: 'address', label: 'Comprovante de endereço', state: 'rejected', reason: 'Foto cortada' },
  ];
  const steps = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done'), step('lojaVerif', 'Verificar loja', 'rejected', { items, reason: 'Foto cortada' }), step('pix', 'Recebimento (PIX)', 'done'), step('plano', 'Plano', 'done')];
  (loadStoreOnboarding as jest.Mock).mockResolvedValue({ mode: 'custodia', store, productsCount: 3, steps, current: steps[2], allSubmitted: false, approved: false });
  render(<SellerAbrir />);
  expect(await screen.findByText('Quase lá')).toBeInTheDocument();
  expect(screen.getByText('Recusado: Foto cortada')).toBeInTheDocument();
  expect(screen.getByText('Em análise')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Reenviar'));
  expect(mockPush).toHaveBeenCalledWith('/href-lojaVerif');
  expect(screen.getByText('3 cadastrados · aparecem quando a loja for aprovada')).toBeInTheDocument();
});

test('aprovada: leva para Agora', async () => {
  const steps = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done')];
  (loadStoreOnboarding as jest.Mock).mockResolvedValue({ mode: 'custodia', store, productsCount: 0, steps, current: null, allSubmitted: true, approved: true });
  render(<SellerAbrir />);
  fireEvent.click(await screen.findByText('Ir para Agora'));
  expect(mockPush).toHaveBeenCalledWith('/seller/dashboard');
});

test('modo SaaS: 3 etapas, mensalidade e dias grátis do servidor', async () => {
  mockMode = 'direto';
  const steps = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done'), step('asaas', 'Conta Asaas', 'todo')];
  (loadStoreOnboarding as jest.Mock).mockResolvedValue({ mode: 'direto', store, productsCount: 0, steps, current: steps[2], allSubmitted: false, approved: false });
  render(<SellerAbrir />);
  expect(await screen.findByText('Falta 1 passo para vender')).toBeInTheDocument();
  expect(await screen.findByText(/R\$ 149,00/)).toBeInTheDocument();
  expect(screen.getByText(/14 dias grátis/)).toBeInTheDocument();
  expect(screen.getByText('Você pulou 2 etapas')).toBeInTheDocument();
  expect(loadStoreOnboarding).toHaveBeenCalledWith('direto');
  // Conta Asaas não abre embutida: "Continuar" leva para a tela dela
  fireEvent.click(screen.getByText('Continuar: Conta Asaas'));
  expect(mockPush).toHaveBeenCalledWith('/href-asaas');
});

test('modo SaaS: a fórmula do frete do motoboy vem do servidor', async () => {
  mockMode = 'direto';
  (api.get as jest.Mock).mockImplementation((url: string) => Promise.resolve({ data: url === '/settings/platform-config'
    ? { motoboyCutPerDelivery: 5, motoboyCutPerKm: 1 }
    : { saasMonthlyFee: 149, saasTrialDays: 14 } }));
  const steps = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done'), step('asaas', 'Conta Asaas', 'todo')];
  (loadStoreOnboarding as jest.Mock).mockResolvedValue({ mode: 'direto', store, productsCount: 0, steps, current: steps[2], allSubmitted: false, approved: false });
  render(<SellerAbrir />);
  expect(await screen.findByText(/R\$ 5,00 \+ R\$ 1,00 por km/)).toBeInTheDocument();
});

test('modo SaaS com mensalidade zero: "Grátis no lançamento"', async () => {
  mockMode = 'direto';
  (api.get as jest.Mock).mockResolvedValue({ data: { saasMonthlyFee: 0, saasTrialDays: 14 } });
  const steps = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done'), step('asaas', 'Conta Asaas', 'todo')];
  (loadStoreOnboarding as jest.Mock).mockResolvedValue({ mode: 'direto', store, productsCount: 0, steps, current: steps[2], allSubmitted: false, approved: false });
  render(<SellerAbrir />);
  expect(await screen.findByText(/Grátis no lançamento/)).toBeInTheDocument();
});

test('identidade abre dentro da tela e volta ao checklist', async () => {
  mockQuery = { etapa: 'identidade' };
  render(<SellerAbrir />);
  fireEvent.click(screen.getByText('Concluir identidade'));
  expect(mockPush).toHaveBeenCalledWith('/seller/abrir');
  expect(loadStoreOnboarding).not.toHaveBeenCalled();
});

test('erro ao carregar: "Tentar de novo" recarrega', async () => {
  const steps = [step('loja', 'Criar loja', 'todo')];
  (loadStoreOnboarding as jest.Mock)
    .mockRejectedValueOnce(new Error('rede'))
    .mockResolvedValueOnce({ mode: 'custodia', store: null, productsCount: 0, steps, current: steps[0], allSubmitted: false, approved: false });
  render(<SellerAbrir />);
  fireEvent.click(await screen.findByText('Tentar de novo'));
  expect(await screen.findByText('etapa loja nova cnpj obrigatório')).toBeInTheDocument();
});

test('etapa que não deu para conferir: aviso, "Tentar de novo" recarrega e não entra em "Quase lá"', async () => {
  const steps = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done'), step('lojaVerif', 'Verificar loja', 'done'), step('pix', 'Recebimento (PIX)', 'unknown'), step('plano', 'Plano', 'done')];
  const again = [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done'), step('lojaVerif', 'Verificar loja', 'done'), step('pix', 'Recebimento (PIX)', 'done'), step('plano', 'Plano', 'done')];
  (loadStoreOnboarding as jest.Mock)
    .mockResolvedValueOnce({ mode: 'custodia', store, productsCount: 0, steps, current: steps[3], allSubmitted: false, approved: false })
    .mockResolvedValueOnce({ mode: 'custodia', store, productsCount: 0, steps: again, current: null, allSubmitted: true, approved: false });
  render(<SellerAbrir />);
  expect(await screen.findByText('Não conseguimos conferir tudo')).toBeInTheDocument();
  expect(screen.getByText('Não deu para conferir agora')).toBeInTheDocument();
  expect(screen.queryByText('Quase lá')).not.toBeInTheDocument();
  // fail closed: etapa que não deu para conferir não abre embutida como "a fazer", nem vira "Continuar"
  expect(screen.queryByText('etapa recebimento')).not.toBeInTheDocument();
  expect(screen.queryByText(/^Continuar/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Tentar de novo'));
  expect(await screen.findByText('Quase lá')).toBeInTheDocument();
  expect(loadStoreOnboarding).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Não conseguimos conferir tudo')).not.toBeInTheDocument();
});

describe('V12: Abrir a loja usa a leitura do painel', () => {
  const steps = () => [step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done'), step('lojaVerif', 'Verificar loja', 'todo')];
  const onbData = () => ({ mode: 'custodia', store, productsCount: 0, steps: steps(), current: steps()[2], allSubmitted: false, approved: false });

  test('painel carregado: o checklist recebe loja e produtos do painel', async () => {
    mockPanel = { ...outOfPanel(), inPanel: true, store, products: [{ _id: 'p1' }] };
    (loadStoreOnboarding as jest.Mock).mockResolvedValue(onbData());
    render(<SellerAbrir />);
    expect(await screen.findByText('etapa documentos s1')).toBeInTheDocument();
    expect(loadStoreOnboarding).toHaveBeenCalledWith('custodia', { store, products: [{ _id: 'p1' }] });
  });

  test('painel carregando: espera, sem ler o checklist', async () => {
    mockPanel = { ...outOfPanel(), inPanel: true, loading: true };
    (loadStoreOnboarding as jest.Mock).mockResolvedValue(onbData());
    render(<SellerAbrir />);
    await new Promise((r) => setTimeout(r, 20));
    expect(loadStoreOnboarding).not.toHaveBeenCalled();
  });

  test('painel com erro: o checklist faz a própria leitura', async () => {
    mockPanel = { ...outOfPanel(), inPanel: true, error: 'falhou' };
    (loadStoreOnboarding as jest.Mock).mockResolvedValue(onbData());
    render(<SellerAbrir />);
    await waitFor(() => expect(loadStoreOnboarding).toHaveBeenCalledWith('custodia'));
  });

  test('etapa salva por ?etapa=: recarrega o painel antes de voltar ao checklist (a loja nova aparece)', async () => {
    mockQuery = { etapa: 'loja' };
    mockPanel = { ...outOfPanel(), inPanel: true, store, products: [] };
    (loadStoreOnboarding as jest.Mock).mockResolvedValue(onbData());
    render(<SellerAbrir />);
    fireEvent.click(await screen.findByText('etapa loja edição cnpj obrigatório'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/seller/abrir'));
    expect(mockPanel.refresh).toHaveBeenCalled();
  });
});

test('D3b-2b: item recusado com reenvio pedido mostra "Reenvie: …" no checklist', async () => {
  const items = [
    { key: 'facial', label: 'Foto do rosto', state: 'done' },
    { key: 'cnpj', label: 'CNPJ', state: 'review' },
    { key: 'address', label: 'Comprovante de endereço', state: 'rejected', reason: 'Comprovante de endereço não aceito', resend: true },
  ];
  const steps = [
    step('loja', 'Criar loja', 'done'), step('identidade', 'Sua identidade', 'done'),
    step('lojaVerif', 'Verificar loja', 'rejected', { items, reason: 'Comprovante de endereço não aceito', resend: true }),
    step('pix', 'Recebimento (PIX)', 'done'), step('plano', 'Plano', 'done'),
  ];
  (loadStoreOnboarding as jest.Mock).mockResolvedValue({ mode: 'custodia', store, productsCount: 3, steps, current: steps[2], allSubmitted: false, approved: false });
  render(<SellerAbrir />);
  expect(await screen.findByText('Reenvie: Comprovante de endereço não aceito')).toBeInTheDocument();
});
