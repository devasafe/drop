import { render, screen, fireEvent, renderHook, waitFor } from '@testing-library/react';
import api from '../../../../lib/api';

const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
import { courierState, useCourierStatus } from '../useCourierStatus';
import { EmAnalise } from '../EmAnalise';
const get = api.get as jest.Mock;
beforeEach(() => jest.clearAllMocks());

describe('courierState', () => {
  const v = (doc: string) => ({ verification: { document: { status: doc } } });
  it('aprovado', () => expect(courierState({ verified: true, missing: [] }, null)).toBe('verified'));
  it('tudo enviado, esperando a equipe', () => {
    expect(courierState({ verified: false, missing: ['document', 'courier'], courier: { status: 'pending' }, facial: { status: 'approved' } }, v('pending'))).toBe('review');
  });
  it('falta enviar ou foi recusado', () => {
    expect(courierState({ verified: false, missing: ['courier'], courier: { status: 'none' }, facial: { status: 'approved' } }, v('approved'))).toBe('incomplete');
    expect(courierState({ verified: false, missing: ['facial'], courier: { status: 'pending' }, facial: { status: 'rejected' } }, v('approved'))).toBe('incomplete');
    expect(courierState({ verified: false, missing: ['document'], courier: { status: 'pending' }, facial: { status: 'pending' } }, v('none'))).toBe('incomplete');
    expect(courierState({ verified: false, missing: ['email'], courier: { status: 'pending' }, facial: { status: 'pending' } }, v('pending'))).toBe('incomplete');
  });
  it('sem o status do documento conta como enviado (o cadastro mostra a verdade)', () => {
    expect(courierState({ verified: false, missing: ['document'], courier: { status: 'pending' }, facial: { status: 'pending' } }, null)).toBe('review');
  });
  it('corpo inválido é erro', () => expect(courierState(null, null)).toBe('error'));
});

test('hook: lê as duas rotas; erro vira "error" (informativo, não bloqueia)', async () => {
  get.mockImplementation((u: string) => (u === '/verification/motoboy/me'
    ? Promise.resolve({ data: { verified: false, missing: ['courier'], courier: { status: 'pending' }, facial: { status: 'approved' } } })
    : Promise.resolve({ data: { verification: { document: { status: 'approved' } } } })));
  const { result } = renderHook(() => useCourierStatus());
  expect(result.current.state).toBe('loading');
  await waitFor(() => expect(result.current.state).toBe('review'));
  get.mockRejectedValue(new Error('x'));
  const b = renderHook(() => useCourierStatus());
  await waitFor(() => expect(b.result.current.state).toBe('error'));
});

test('hook: falha só em /verification/me não derruba a leitura', async () => {
  get.mockImplementation((u: string) => (u === '/verification/motoboy/me'
    ? Promise.resolve({ data: { verified: false, missing: ['document'], courier: { status: 'pending' }, facial: { status: 'approved' } } })
    : Promise.reject(new Error('x'))));
  const { result } = renderHook(() => useCourierStatus());
  await waitFor(() => expect(result.current.state).toBe('review'));
});

test('Em análise: linha do tempo, sem prazo, e Enquanto isso', () => {
  render(<EmAnalise state="review" />);
  expect(screen.getByText('Estamos conferindo seus documentos')).toBeInTheDocument();
  for (const t of ['Conta criada', 'Documentos enviados', 'Análise da equipe', 'Liberado para corridas']) expect(screen.getByText(t)).toBeInTheDocument();
  expect(screen.queryByText(/dia útil|horas/i)).toBeNull();
  expect(screen.getByText('Enquanto isso')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Como calculamos seus ganhos/ }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/ganhos/como-calculamos');
  fireEvent.click(screen.getByRole('button', { name: /Chave Pix/ }));
  expect(mockPush).toHaveBeenCalledWith('/dados-recebimento');
});

test('Falta terminar: leva ao cadastro', () => {
  render(<EmAnalise state="incomplete" />);
  expect(screen.getByText('Falta terminar seu cadastro')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar cadastro' }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/cadastro');
});
