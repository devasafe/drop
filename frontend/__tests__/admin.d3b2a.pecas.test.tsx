/**
 * D3b-2a · P3.1 — ReasonSheet (motivo obrigatório de 5 a 500, ou opcional; erro dentro da folha; abre limpa) e
 * Timeline (rótulo, autor, data e texto de cada linha; nota no topo só com canWrite; "Carregar mais" só com
 * onLoadMore; erros com a mensagem em português).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ReasonSheet } from '../components/admin/accounts/ReasonSheet';
import { Timeline } from '../components/admin/accounts/Timeline';
import { spDateTime } from '../lib/adminMoney';

const sheetProps = (over: Record<string, unknown> = {}) => ({
  open: true,
  title: 'Bloquear conta',
  description: <p>Ana Souza sai na hora.</p>,
  confirmLabel: 'Bloquear',
  required: true,
  onConfirm: jest.fn().mockResolvedValue(undefined),
  onClose: jest.fn(),
  ...over,
});

describe('ReasonSheet', () => {
  it('obrigatório: confirmar só com 5 a 500 caracteres sem as pontas, e manda o motivo aparado', async () => {
    const p = sheetProps({ tone: 'danger' });
    render(<ReasonSheet {...p} />);
    const dialog = screen.getByRole('dialog', { name: 'Bloquear conta' });
    expect(within(dialog).getByText('Ana Souza sai na hora.')).toBeInTheDocument();
    const ok = within(dialog).getByRole('button', { name: 'Bloquear' });
    expect(ok).toBeDisabled();
    expect(ok.className).toContain('danger');
    const campo = within(dialog).getByLabelText('Motivo (obrigatório)');
    fireEvent.change(campo, { target: { value: '   abcd   ' } });
    expect(ok).toBeDisabled();
    fireEvent.change(campo, { target: { value: 'x'.repeat(501) } });
    expect(ok).toBeDisabled();
    fireEvent.change(campo, { target: { value: '  Fraude no cupom  ' } });
    expect(ok).toBeEnabled();
    fireEvent.click(ok);
    await waitFor(() => expect(p.onConfirm).toHaveBeenCalledWith('Fraude no cupom'));
  });

  it('opcional: confirma vazio (motivo "") e o campo diz que é opcional', async () => {
    const p = sheetProps({ title: 'Desbloquear conta', confirmLabel: 'Desbloquear', required: false });
    render(<ReasonSheet {...p} />);
    const dialog = screen.getByRole('dialog', { name: 'Desbloquear conta' });
    expect(within(dialog).getByLabelText('Motivo (opcional)')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(p.onConfirm).toHaveBeenCalledWith(''));
  });

  it('erro do onConfirm aparece dentro da folha, que continua aberta', async () => {
    const p = sheetProps({
      onConfirm: jest.fn().mockRejectedValue({ response: { status: 409, data: { error: 'Esta dívida não está mais pendente.' } } }),
    });
    render(<ReasonSheet {...p} />);
    const dialog = screen.getByRole('dialog', { name: 'Bloquear conta' });
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: 'Fraude no cupom' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Esta dívida não está mais pendente.');
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('abrir de novo começa sem motivo', () => {
    const p = sheetProps();
    const { rerender } = render(<ReasonSheet {...p} />);
    fireEvent.change(screen.getByLabelText('Motivo (obrigatório)'), { target: { value: 'Fraude no cupom' } });
    rerender(<ReasonSheet {...p} open={false} />);
    rerender(<ReasonSheet {...p} open />);
    expect((screen.getByLabelText('Motivo (obrigatório)') as HTMLTextAreaElement).value).toBe('');
  });
});

const ITEMS = [
  { id: 't3', type: 'note', reason: 'Ligou reclamando do motoboy', meta: null, createdAt: '2026-10-20T13:00:00.000Z', actor: { id: 'a1', name: 'Marina Rocha', role: 'ceo' } },
  { id: 't2', type: 'roles_change', reason: null, meta: { before: ['cliente'], after: ['cliente', 'motoboy'] }, createdAt: '2026-10-10T13:00:00.000Z', actor: { id: 'a2', name: 'Gil Gerente', role: 'gerente_geral' } },
  { id: 't1', type: 'store_pause', reason: 'Mensalidade cancelada', meta: null, createdAt: '2026-10-01T13:00:00.000Z', actor: { id: 'system', name: null, role: 'system' } },
];

describe('Timeline', () => {
  it('cada linha com rótulo, data, autor e texto, na ordem do servidor', () => {
    render(<Timeline items={ITEMS} canWrite={false} onWriteNote={jest.fn()} />);
    const linhas = within(screen.getByRole('list', { name: 'Histórico' })).getAllByRole('listitem');
    expect(linhas).toHaveLength(3);
    expect(within(linhas[0]).getByText('Nota')).toBeInTheDocument();
    expect(within(linhas[0]).getByText('Ligou reclamando do motoboy')).toBeInTheDocument();
    expect(within(linhas[0]).getByText('Marina Rocha · CEO')).toBeInTheDocument();
    expect(linhas[0]).toHaveTextContent(spDateTime('2026-10-20T13:00:00.000Z'));
    expect(within(linhas[1]).getByText('Papéis alterados')).toBeInTheDocument();
    expect(within(linhas[1]).getByText('Cliente → Motoboy')).toBeInTheDocument();
    expect(within(linhas[2]).getByText('Sistema')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nota interna')).toBeNull();
  });

  it('vazio: avisa, sem lista', () => {
    render(<Timeline items={[]} canWrite onWriteNote={jest.fn()} />);
    expect(screen.getByText('Nada no histórico ainda.')).toBeInTheDocument();
  });

  it('nota no topo: salvar só com texto; manda aparado e limpa o campo', async () => {
    const onWriteNote = jest.fn().mockResolvedValue(undefined);
    render(<Timeline items={ITEMS} canWrite onWriteNote={onWriteNote} />);
    const campo = screen.getByLabelText('Nota interna');
    expect(campo.compareDocumentPosition(screen.getByRole('list', { name: 'Histórico' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const salvar = screen.getByRole('button', { name: 'Salvar nota' });
    expect(salvar).toBeDisabled();
    fireEvent.change(campo, { target: { value: '  Pediu retorno depois das 18h  ' } });
    fireEvent.click(salvar);
    await waitFor(() => expect(onWriteNote).toHaveBeenCalledWith('Pediu retorno depois das 18h'));
    await waitFor(() => expect((campo as HTMLTextAreaElement).value).toBe(''));
  });

  it('nota recusada: mensagem em português e o texto fica no campo', async () => {
    const onWriteNote = jest.fn().mockRejectedValue({ response: { status: 400, data: { error: 'Nota inválida', code: 'NOTE_INVALID' } } });
    render(<Timeline items={[]} canWrite onWriteNote={onWriteNote} />);
    fireEvent.change(screen.getByLabelText('Nota interna'), { target: { value: 'Texto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A nota precisa ter de 1 a 2000 caracteres.');
    expect((screen.getByLabelText('Nota interna') as HTMLTextAreaElement).value).toBe('Texto');
  });

  it('"Carregar mais" só com onLoadMore; erro vira aviso e "Tentar de novo"', async () => {
    const { rerender } = render(<Timeline items={ITEMS} canWrite={false} onWriteNote={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
    const onLoadMore = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
    rerender(<Timeline items={ITEMS} canWrite={false} onWriteNote={jest.fn()} onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar mais.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });
});
