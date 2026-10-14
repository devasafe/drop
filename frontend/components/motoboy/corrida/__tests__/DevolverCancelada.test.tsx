import { render, screen, fireEvent } from '@testing-library/react';
jest.mock('../../../map/RouteThumbnail', () => ({ __esModule: true, RouteThumbnail: () => <div data-testid="mapa" />, default: () => null }));
import { DevolverView, DevolucaoConfirmada } from '../DevolverView';
import { CanceladaView } from '../CanceladaView';

const ride = {
  _id: 'd1', orderId: 'ord0000004836', status: 'cancelled', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '631500',
  storeLatitude: -23.56, storeLongitude: -46.68, storeAddress: 'R. dos Pinheiros, 870, Pinheiros',
  storeObj: { _id: 's1', name: 'Eletro Center', telefone: '1133334444' },
};

describe('Devolver na loja', () => {
  test('código de devolução, loja e mapa', () => {
    render(<DevolverView ride={ride} self={null} compensation={null} />);
    expect(screen.getByText('Código de devolução')).toBeInTheDocument();
    expect(screen.getByTestId('pin-devolucao')).toHaveTextContent('631500');
    expect(screen.getByText('A loja digita este código ao receber o pacote de volta.')).toBeInTheDocument();
    expect(screen.getByText('Eletro Center')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir no mapa/ })).toBeInTheDocument();
    expect(screen.queryByText('Sua corrida está garantida')).not.toBeInTheDocument();
  });
  test('com compensação do servidor: corrida garantida com o valor', () => {
    render(<DevolverView ride={ride} self={null} compensation={9.6} />);
    expect(screen.getByText('Sua corrida está garantida')).toBeInTheDocument();
    expect(screen.getByText(/R\$ 9,60/)).toBeInTheDocument();
  });
  test('compensação zero não aparece', () => {
    render(<DevolverView ride={ride} self={null} compensation={0} />);
    expect(screen.queryByText('Sua corrida está garantida')).not.toBeInTheDocument();
  });
  test('devolução confirmada', () => {
    const onNext = jest.fn();
    render(<DevolucaoConfirmada onNext={onNext} />);
    expect(screen.getByText('Devolução confirmada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Procurar próxima corrida' }));
    expect(onNext).toHaveBeenCalled();
  });
});

describe('Corrida cancelada', () => {
  const cancelled = { ...ride, statusDevolucao: null, pinDevolucao: null, pickedAt: null, cancellationCompensation: null };
  test('motivo do evento, a caminho da loja e compensação do evento', () => {
    const onNext = jest.fn();
    render(<CanceladaView ride={cancelled} cancelInfo={{ reason: 'Comprei errado', compensation: 2.84 }} onNext={onNext} />);
    expect(screen.getByText('A corrida foi cancelada')).toBeInTheDocument();
    expect(screen.getByText('Pedido #004836.')).toBeInTheDocument();
    expect(screen.getByText('"Comprei errado"')).toBeInTheDocument();
    expect(screen.getByText('a caminho da loja')).toBeInTheDocument();
    expect(screen.getByText('R$ 2,84')).toBeInTheDocument();
    expect(screen.getByText('Ainda não pegou o pacote')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Procurar próxima corrida' }));
    expect(onNext).toHaveBeenCalled();
  });
  test('sem evento (tela reaberta): compensação vem do GET; sem motivo, sem linha de motivo', () => {
    render(<CanceladaView ride={{ ...cancelled, pickedAt: '2026-10-14T14:20:00Z', cancellationCompensation: 4.8 }} cancelInfo={null} onNext={jest.fn()} />);
    expect(screen.queryByText('Motivo')).not.toBeInTheDocument();
    expect(screen.getByText('com o pacote')).toBeInTheDocument();
    expect(screen.getByText('R$ 4,80')).toBeInTheDocument();
    expect(screen.queryByText('Ainda não pegou o pacote')).not.toBeInTheDocument();
  });
  test('sem compensação: sem a linha "Você recebe"', () => {
    render(<CanceladaView ride={cancelled} cancelInfo={{ reason: null, compensation: null }} onNext={jest.fn()} />);
    expect(screen.queryByText('Você recebe')).not.toBeInTheDocument();
  });
});

describe('Corrida cancelada: precedência evento/GET', () => {
  const base = { _id: 'd1', orderId: 'ord0000004836', status: 'cancelled', pickedAt: null };
  test('objeto vazio do evento não esconde a compensação e o motivo do GET', () => {
    render(<CanceladaView ride={{ ...base, cancellationCompensation: 3.5, cancelReason: 'Loja fechou' }} cancelInfo={{ reason: null, compensation: null }} onNext={jest.fn()} />);
    expect(screen.getByText('R$ 3,50')).toBeInTheDocument();
    expect(screen.getByText('"Loja fechou"')).toBeInTheDocument();
  });
  test('nenhuma fonte: sem linha de compensação nem R$ 0,00', () => {
    render(<CanceladaView ride={{ ...base, cancellationCompensation: null }} cancelInfo={{ reason: null, compensation: null }} onNext={jest.fn()} />);
    expect(screen.queryByText('Você recebe')).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$ 0,00/)).not.toBeInTheDocument();
  });
});
