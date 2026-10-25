import { render, screen, fireEvent } from '@testing-library/react';
import { TicketChat } from '../TicketChat';

const msgs = [
  { _id: 'm1', senderId: 'c9', senderName: 'Lia', text: 'Chegou só o fone.', createdAt: '2026-10-03T14:51:00' },
  { _id: 'm2', senderId: 'u1', senderName: 'Marina', text: 'Já vi o pedido.', createdAt: '2026-10-03T14:55:00' },
];

/** Conversa do chamado no admin (DS v2, claro): bolhas do DS no lugar do ChatPanel escuro. */
test('mostra as mensagens, as minhas do meu lado', () => {
  render(<TicketChat messages={msgs} userId="u1" onSendMessage={jest.fn()} recipientName="Lia" />);
  expect(screen.getByText('Chegou só o fone.')).toBeInTheDocument();
  expect(screen.getByText('Já vi o pedido.')).toBeInTheDocument();
  expect(screen.getByLabelText('Escrever para Lia')).toBeInTheDocument();
});

test('enviar limpa o campo e chama onSendMessage com o texto', () => {
  const onSend = jest.fn();
  render(<TicketChat messages={[]} userId="u1" onSendMessage={onSend} recipientName="Lia" />);
  fireEvent.change(screen.getByLabelText('Escrever para Lia'), { target: { value: '  Oi, Lia  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
  expect(onSend).toHaveBeenCalledWith('Oi, Lia');
  expect(screen.getByLabelText('Escrever para Lia')).toHaveValue('');
});

test('fechado: troca o campo pelo aviso', () => {
  render(<TicketChat messages={msgs} userId="u1" onSendMessage={jest.fn()} isFinalized finalizedMessage="Assuma o chamado para poder responder." />);
  expect(screen.getByText('Assuma o chamado para poder responder.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument();
});

test('carregando e vazio', () => {
  const { rerender } = render(<TicketChat messages={[]} userId="u1" onSendMessage={jest.fn()} isLoading />);
  expect(screen.getByLabelText('Carregando conversa')).toBeInTheDocument();
  rerender(<TicketChat messages={[]} userId="u1" onSendMessage={jest.fn()} />);
  expect(screen.getByText('Nenhuma mensagem ainda.')).toBeInTheDocument();
});

test('só mostra as mensagens desta conversa (o atendente recebe as de todos os chamados que assumiu)', () => {
  const mixed = [
    { ...msgs[0], conversationId: 'cv1' },
    { _id: 'x1', conversationId: 'cv2', senderId: 'z', text: 'De outro chamado', createdAt: '2026-10-03T14:52:00' },
    { _id: 'h1', senderId: 'c9', text: 'Histórico sem conversationId', createdAt: '2026-10-03T14:50:00' },
  ];
  render(<TicketChat conversationId="cv1" messages={mixed} userId="u1" onSendMessage={jest.fn()} />);
  expect(screen.getByText('Chegou só o fone.')).toBeInTheDocument();
  expect(screen.getByText('Histórico sem conversationId')).toBeInTheDocument();
  expect(screen.queryByText('De outro chamado')).not.toBeInTheDocument();
});
