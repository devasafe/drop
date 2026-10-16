import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';
import api from '../lib/api';
import AdminBroadcasts from '../pages/admin/broadcasts';
import AdminAvisos from '../pages/admin/avisos';

const mockRouter = { pathname: '/admin/broadcasts', asPath: '/admin/broadcasts', query: {}, push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const HISTORY = [{
  _id: 'b1', title: 'Frete grátis', body: 'No fim de semana', targetRoles: ['cliente', 'gerente_geral'],
  deliveryCount: 3912, sentAt: '2026-10-02T12:00:00.000Z', createdBy: { name: 'Asafe' },
}];
const BANNERS = [
  { _id: 'b1', imageUrl: '/uploads/a.jpg', linkUrl: '/produtos', title: 'Semana Tech', active: true, sortOrder: 0 },
  { _id: 'b2', imageUrl: '/uploads/b.jpg', linkUrl: null, title: null, active: false, sortOrder: 1 },
];
const MARKETING = adminAuth('marketing', ['broadcast:send']);

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/broadcasts') return Promise.resolve({ data: { broadcasts: HISTORY } });
    if (url === '/banners/all') return Promise.resolve({ data: BANNERS });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  (api.post as jest.Mock).mockResolvedValue({ data: { deliveryCount: 97 } });
  (api.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
  (api.patch as jest.Mock).mockResolvedValue({ data: {} });
});

describe('Broadcasts', () => {
  it('título da área e enviados com o nome dos grupos', async () => {
    renderAdminPage(<AdminBroadcasts />, MARKETING);
    expect(screen.getByRole('heading', { name: 'Avisos e broadcasts · Broadcasts' })).toBeInTheDocument();
    const sent = await screen.findByRole('region', { name: 'Enviados' });
    expect(await within(sent).findByText(/Clientes, Gerentes Gerais/)).toBeInTheDocument();
    expect(within(sent).getByText(/3912 usuários/)).toBeInTheDocument();
  });

  it('faltando campo: aviso na tela, sem sheet e sem POST', async () => {
    renderAdminPage(<AdminBroadcasts />, MARKETING);
    await screen.findByText('Frete grátis');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar agora' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Preencha título, mensagem e selecione pelo menos um grupo.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('a prévia acompanha o texto e os grupos', async () => {
    renderAdminPage(<AdminBroadcasts />, MARKETING);
    await screen.findByText('Frete grátis');
    const preview = screen.getByRole('region', { name: 'Prévia no celular' });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Pico de sexta' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Fica online das 18h às 21h' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Motoboys' }));
    expect(within(preview).getByText('DROP · Pico de sexta')).toBeInTheDocument();
    expect(within(preview).getByText('Fica online das 18h às 21h')).toBeInTheDocument();
    expect(within(preview).getByText('Vai para: Motoboys')).toBeInTheDocument();
  });

  it('"Todos" marca os 8 grupos e "Limpar" desmarca', async () => {
    renderAdminPage(<AdminBroadcasts />, MARKETING);
    await screen.findByText('Frete grátis');
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)).toHaveLength(0);
  });

  it('enviar: resumo na sheet, toast com o total entregue e formulário limpo', async () => {
    renderAdminPage(<AdminBroadcasts />, MARKETING);
    await screen.findByText('Frete grátis');
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Pico de sexta' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Fica online' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Motoboys' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar agora' }));
    const dialog = screen.getByRole('dialog', { name: 'Enviar para 1 grupo?' });
    expect(within(dialog).getByText('Motoboys')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar agora' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Enviado para 97 usuários!', 'success'));
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('erro ao enviar aparece dentro da sheet', async () => {
    (api.post as jest.Mock).mockRejectedValue({ response: { status: 400, data: { error: 'Grupo inválido' } } });
    renderAdminPage(<AdminBroadcasts />, MARKETING);
    await screen.findByText('Frete grátis');
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'B' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clientes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar agora' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar agora' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Grupo inválido');
  });

  it('apagar é só do CEO', async () => {
    renderAdminPage(<AdminBroadcasts />, MARKETING);
    await screen.findByText('Frete grátis');
    expect(screen.queryByRole('button', { name: 'Apagar Frete grátis' })).toBeNull();
  });

  it('CEO apaga pela sheet, que diz quantas notificações somem, e o item sai da lista', async () => {
    renderAdminPage(<AdminBroadcasts />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar Frete grátis' }));
    const dialog = screen.getByRole('dialog', { name: 'Apagar este broadcast?' });
    expect(within(dialog).getByText(/3912 usuários/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(screen.queryByText('Frete grátis')).toBeNull());
    expect(api.delete).toHaveBeenCalledWith('/broadcasts/b1');
  });

  it('enviados ilegíveis: "Tentar de novo" (nunca "nenhum enviado")', async () => {
    (api.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro interno' } } });
    renderAdminPage(<AdminBroadcasts />, MARKETING);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
    expect(screen.queryByText('Nenhum anúncio enviado ainda.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Frete grátis')).toBeInTheDocument();
  });

  it('portão: sem broadcast:send sai da tela e nada é lido', async () => {
    renderAdminPage(<AdminBroadcasts />, adminAuth('marketing', ['theme:edit']));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(api.get).not.toHaveBeenCalled();
  });

  it('celular: formulário, prévia e enviados (fumaça, não cobre layout)', async () => {
    setViewportWidth(360);
    renderAdminPage(<AdminBroadcasts />, MARKETING);
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Prévia no celular' })).toBeInTheDocument();
    expect(await screen.findByText('Frete grátis')).toBeInTheDocument();
  });
});

describe('Avisos da home', () => {
  it('só o CEO abre (como hoje): outro papel, mesmo com "*", sai e nada é lido', async () => {
    renderAdminPage(<AdminAvisos />, adminAuth('gerente_geral', ['*']));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(api.get).not.toHaveBeenCalled();
  });

  it('cartões na ordem do carrossel, com situação e interruptor', async () => {
    renderAdminPage(<AdminAvisos />);
    expect(screen.getByRole('heading', { name: 'Avisos e broadcasts · Avisos da home' })).toBeInTheDocument();
    expect(await screen.findByText('1º · ativo')).toBeInTheDocument();
    expect(screen.getByText('2º · pausado')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Mostrar Semana Tech na home' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Mostrar o aviso 2 na home' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getAllByRole('button', { name: 'Subir' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Descer' })[1]).toBeDisabled();
  });

  it('interruptor com erro: volta ao que o servidor tem e avisa', async () => {
    (api.patch as jest.Mock).mockRejectedValue({ response: { status: 500, data: { error: 'Erro ao salvar' } } });
    renderAdminPage(<AdminAvisos />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Mostrar Semana Tech na home' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Erro ao salvar', 'error'));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it('remover: erro do servidor dentro da sheet e o aviso continua na lista', async () => {
    (api.delete as jest.Mock).mockRejectedValue({ response: { status: 500, data: { error: 'Erro ao remover' } } });
    renderAdminPage(<AdminAvisos />);
    await screen.findByText('1º · ativo');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Remover este aviso?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Erro ao remover');
    expect(screen.getByText('Semana Tech')).toBeInTheDocument();
  });

  it('upload com erro: toast; a prévia mostra a imagem enviada', async () => {
    (api.post as jest.Mock).mockRejectedValueOnce(new Error('falhou'));
    const { container } = renderAdminPage(<AdminAvisos />);
    await screen.findByText('1º · ativo');
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Falha no upload da imagem', 'error'));
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { imageUrl: '/uploads/novo.jpg' } });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(['x'], 'b.jpg', { type: 'image/jpeg' })] } });
    const preview = screen.getByRole('region', { name: 'Prévia na home' });
    expect(await within(preview).findByRole('img')).toBeInTheDocument();
  });

  it('lista ilegível: "Tentar de novo" e não deixa publicar (a ordem depende da lista)', async () => {
    (api.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro interno' } } });
    renderAdminPage(<AdminAvisos />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
    expect(screen.getByRole('button', { name: 'Publicar aviso' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('1º · ativo')).toBeInTheDocument();
  });

  it('celular: formulário e cartões (fumaça, não cobre layout)', async () => {
    setViewportWidth(360);
    renderAdminPage(<AdminAvisos />);
    expect(await screen.findByText('1º · ativo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar aviso' })).toBeInTheDocument();
  });
});
