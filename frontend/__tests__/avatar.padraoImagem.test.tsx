// frontend/__tests__/avatar.padraoImagem.test.tsx
/** Foto de perfil (avatar 1:1, 400 × 400): recorte obrigatório em /foto-perfil e em Dados pessoais. */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';
import FotoPerfilPage from '../pages/foto-perfil';
import { PersonalData } from '../components/drop/PersonalData';
import { mockCanvas, mockImageSize, imageFile } from './helpers/imageMocks';

const mockPush = jest.fn();
const mockSetUser = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/foto-perfil' }) }));
jest.mock('../hooks/useClienteRedirect', () => ({ useClienteRedirect: () => undefined }));
jest.mock('../components/OnboardingProgress', () => ({ __esModule: true, default: () => null }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { activeRole: 'motoboy' }, loading: false, setUser: mockSetUser }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn(), post: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: { name: 'Ana', email: 'ana@email.com', verification: {} } });
  (api.post as jest.Mock).mockResolvedValue({ data: { photo: '/p.jpg' } });
});

describe('/foto-perfil', () => {
  it('foto pequena: aviso na tela, sem recorte e sem envio', async () => {
    mockImageSize(300, 500);
    render(<FotoPerfilPage />);
    fireEvent.change(screen.getByLabelText('Selecionar foto de perfil'), { target: { files: [imageFile('eu.png')] } });
    expect(await screen.findByText('Imagem pequena demais: precisa de pelo menos 400 × 400 px (a sua tem 300 × 500).')).toBeInTheDocument();
    expect(screen.queryByText('Enquadrar foto de perfil')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('foto boa: "Enquadrar foto de perfil", "Usar foto" e salva o JPEG 400 × 400', async () => {
    mockImageSize(1200, 900);
    const { drawImage } = mockCanvas();
    render(<FotoPerfilPage />);
    fireEvent.change(screen.getByLabelText('Selecionar foto de perfil'), { target: { files: [imageFile('eu.png')] } });
    expect(await screen.findByText('Enquadrar foto de perfil')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Usar foto' }));
    await waitFor(() => expect(screen.queryByText('Enquadrar foto de perfil')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/user/me/photo', expect.any(FormData), expect.anything()));
    expect(((api.post as jest.Mock).mock.calls[0][1] as FormData).get('photo')).toHaveProperty('type', 'image/jpeg');
    expect(drawImage.mock.calls[0].slice(-2)).toEqual([400, 400]);
  });
  it('recorte válido depois de uma recusa: o aviso antigo some', async () => {
    mockImageSize(300, 300);
    mockCanvas();
    render(<FotoPerfilPage />);
    fireEvent.change(screen.getByLabelText('Selecionar foto de perfil'), { target: { files: [imageFile('eu.png')] } });
    expect(await screen.findByText(/Imagem pequena demais/)).toBeInTheDocument();
    mockImageSize(1000, 1000);
    fireEvent.change(screen.getByLabelText('Selecionar foto de perfil'), { target: { files: [imageFile('eu.png')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Usar foto' }));
    await waitFor(() => expect(screen.queryByText('Enquadrar foto de perfil')).not.toBeInTheDocument());
    expect(screen.queryByText(/Imagem pequena demais/)).not.toBeInTheDocument();
  });

  it('"Selecione uma foto" some quando a foto é escolhida', async () => {
    mockImageSize(1000, 1000);
    mockCanvas();
    render(<FotoPerfilPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
    expect(screen.getByText('Selecione uma foto para continuar.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Selecionar foto de perfil'), { target: { files: [imageFile('eu.png')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Usar foto' }));
    await waitFor(() => expect(screen.queryByText('Selecione uma foto para continuar.')).not.toBeInTheDocument());
  });
});

describe('Dados pessoais', () => {
  it('foto pequena: Alert com a mensagem e sem envio', async () => {
    mockImageSize(200, 200);
    render(<PersonalData />);
    fireEvent.change(await screen.findByLabelText('Foto de perfil'), { target: { files: [imageFile('eu.png')] } });
    expect(await screen.findByText('Imagem pequena demais: precisa de pelo menos 400 × 400 px (a sua tem 200 × 200).')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('foto boa passa pelo recorte e sobe; recusa do servidor mostra a mensagem dele', async () => {
    mockImageSize(800, 800);
    mockCanvas();
    (api.post as jest.Mock).mockRejectedValueOnce({ response: { status: 422, data: { error: 'A imagem precisa ter pelo menos 400 × 400 px, na proporção 1:1.', code: 'IMAGE_SIZE_INVALID' } } });
    render(<PersonalData />);
    fireEvent.change(await screen.findByLabelText('Foto de perfil'), { target: { files: [imageFile('eu.png')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Usar foto' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/user/me/photo', expect.any(FormData), expect.anything()));
    expect(await screen.findByText('A imagem precisa ter pelo menos 400 × 400 px, na proporção 1:1.')).toBeInTheDocument();
  });
});
