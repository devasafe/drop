/**
 * D3b-2a · P3.3 — folha "Papéis" (porta de admin-users.papeis e admin-users.equipe, D3a): saiu da linha da lista
 * para a ficha, com as mesmas regras. Uma caixinha por papel; Cliente sempre marcado e travado; fora do CEO, os
 * papéis da equipe ficam travados; papel da equipe vem marcado; grava a lista completa na ordem da tela; 409
 * ROLE_HAS_OPEN_WORK fica na folha; outro erro mostra o texto do servidor.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import { RolesSheet } from '../components/admin/accounts/RolesSheet';

jest.mock('../lib/api', () => ({ __esModule: true, default: { put: jest.fn() } }));

const put = api.put as jest.Mock;
const dialog = () => screen.getByRole('dialog', { name: 'Papéis' });
const box = (label: string) =>
  within(dialog()).getByRole('checkbox', { name: new RegExp(`^${label}`) }) as HTMLInputElement;
const salvar = () => within(dialog()).getByRole('button', { name: 'Salvar' });

function renderSheet(roles: string[], isCeo = true) {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  render(<RolesSheet open user={{ id: 'p1', name: 'Ana Souza', email: 'ana@x.com', roles }} isCeo={isCeo} onClose={onClose} onSaved={onSaved} />);
  return { onSaved, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  put.mockResolvedValue({ data: {} });
});

describe('RolesSheet', () => {
  it('uma caixinha por papel; marcadas = papéis da pessoa + Cliente; Salvar só com mudança', () => {
    renderSheet(['lojista', 'motoboy']);
    expect(within(dialog()).getByText('Ana Souza (ana@x.com)')).toBeInTheDocument();
    expect(within(dialog()).getAllByRole('checkbox')).toHaveLength(9);
    expect(box('Lojista').checked).toBe(true);
    expect(box('Motoboy').checked).toBe(true);
    expect(box('Cliente').checked).toBe(true);
    expect(box('CEO').checked).toBe(false);
    expect(salvar()).toBeDisabled();
  });

  it('Cliente sempre marcado e travado, com a dica', () => {
    renderSheet(['cliente']);
    expect(box('Cliente').checked).toBe(true);
    expect(box('Cliente')).toBeDisabled();
    expect(within(dialog()).getByText('Todo mundo pode comprar')).toBeInTheDocument();
  });

  it('papel da equipe vem marcado (equipe com papel ativo cliente)', () => {
    renderSheet(['cliente', 'marketing']);
    expect(box('Marketing').checked).toBe(true);
    expect(salvar()).toBeDisabled();
  });

  it('fora do CEO: caixinhas da equipe travadas, papéis base livres', () => {
    renderSheet(['cliente'], false);
    for (const l of ['CEO', 'Marketing', 'Gerente geral', 'Gerente de clientes', 'Gerente de lojistas', 'Gerente de motoboys']) {
      expect(box(l)).toBeDisabled();
    }
    expect(box('Lojista')).toBeEnabled();
    expect(box('Motoboy')).toBeEnabled();
  });

  it('desmarcar e marcar de volta deixa "Salvar" desabilitado', () => {
    renderSheet(['cliente', 'lojista']);
    fireEvent.click(box('Lojista'));
    expect(salvar()).toBeEnabled();
    fireEvent.click(box('Lojista'));
    expect(salvar()).toBeDisabled();
  });

  it('envia a lista completa na ordem da tela e devolve as lojas fechadas', async () => {
    put.mockResolvedValue({ data: { storesClosed: 1 } });
    const { onSaved } = renderSheet(['cliente']);
    fireEvent.click(box('Lojista'));
    fireEvent.click(box('Gerente de lojistas'));
    fireEvent.click(salvar());
    await waitFor(() => expect(put).toHaveBeenCalledWith('/admin/users/p1/roles', { roles: ['gerente_lojistas', 'lojista', 'cliente'] }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(1));
  });

  it.each([
    ['lojista', 'Lojista', 3, 'Esta pessoa tem 3 pedido(s) em aberto na loja. Termine ou repasse antes de tirar o papel de Lojista.'],
    ['motoboy', 'Motoboy', 1, 'Esta pessoa tem 1 entrega(s) em andamento. Termine ou repasse antes de tirar o papel de Motoboy.'],
  ])('409 ROLE_HAS_OPEN_WORK (%s): mensagem na folha, que continua aberta', async (role, label, count, msg) => {
    put.mockRejectedValue({ response: { status: 409, data: { error: 'qualquer', code: 'ROLE_HAS_OPEN_WORK', role, count } } });
    const { onSaved, onClose } = renderSheet(['cliente', role]);
    fireEvent.click(box(label));
    fireEvent.click(salvar());
    expect(await within(dialog()).findByText(msg)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('outro erro: o texto do servidor dentro da folha', async () => {
    put.mockRejectedValue({ response: { status: 400, data: { error: 'Lista de papéis inválida', code: 'INVALID_ROLES' } } });
    renderSheet(['cliente']);
    fireEvent.click(box('Motoboy'));
    fireEvent.click(salvar());
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Lista de papéis inválida');
  });
});
