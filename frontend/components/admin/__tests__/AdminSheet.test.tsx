import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { AdminSheet } from '../AdminSheet';

describe('AdminSheet', () => {
  it('fechada não monta nada', () => {
    render(<AdminSheet open={false} title="Bloquear repasse" onClose={jest.fn()}>x</AdminSheet>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('aberta: diálogo com título, apresentação lateral, foco dentro e "Cancelar" fecha', () => {
    const onClose = jest.fn();
    render(<AdminSheet open title="Bloquear repasse" onClose={onClose} primary={{ label: 'Bloquear', onClick: jest.fn() }}>Motivo</AdminSheet>);
    const dialog = screen.getByRole('dialog', { name: 'Bloquear repasse' });
    expect(dialog.className).toContain('side');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc fecha quando não está enviando', () => {
    const onClose = jest.fn();
    render(<AdminSheet open title="Excluir ticket" onClose={onClose}>x</AdminSheet>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('foco preso: Tab no último volta ao primeiro', () => {
    render(<AdminSheet open title="Recusar" onClose={jest.fn()} primary={{ label: 'Recusar', onClick: jest.fn() }}>x</AdminSheet>);
    const dialog = screen.getByRole('dialog');
    const buttons = within(dialog).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(buttons[0]).toHaveFocus();
  });

  it('enviando: botão principal travado com "Enviando…", e nada fecha até a Promise terminar', async () => {
    const onClose = jest.fn();
    let resolve!: () => void;
    const onClick = jest.fn(() => new Promise<void>((r) => { resolve = r; }));
    render(<AdminSheet open title="Liberar repasse" onClose={onClose} primary={{ label: 'Liberar', onClick }}>x</AdminSheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Liberar' }));
    const busy = screen.getByRole('button', { name: 'Enviando…' });
    expect(busy).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    fireEvent.click(busy);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { resolve(); });
    expect(screen.getByRole('button', { name: 'Liberar' })).toBeEnabled();
  });

  it('dois cliques no mesmo tick (sem render entre eles): onClick roda uma vez e o botão segue travado', async () => {
    let resolve!: () => void;
    const onClick = jest.fn(() => new Promise<void>((r) => { resolve = r; }));
    render(<AdminSheet open title="Liberar repasse" onClose={jest.fn()} primary={{ label: 'Liberar', onClick }}>x</AdminSheet>);
    const btn = screen.getByRole('button', { name: 'Liberar' });
    const propsKey = Object.keys(btn).find((k) => k.startsWith('__reactProps')) as string;
    const handler = (btn as unknown as Record<string, { onClick: () => void }>)[propsKey].onClick;
    await act(async () => {
      handler();
      handler();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
    await act(async () => { resolve(); });
    expect(screen.getByRole('button', { name: 'Liberar' })).toBeEnabled();
  });

  it('erro: a mensagem do servidor aparece dentro e o botão volta', async () => {
    const onClose = jest.fn();
    const onClick = jest.fn().mockRejectedValue({ response: { status: 409, data: { error: 'Repasse já liberado' } } });
    render(<AdminSheet open title="Liberar repasse" onClose={onClose} primary={{ label: 'Liberar', onClick }}>x</AdminSheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Liberar' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Repasse já liberado');
    expect(screen.getByRole('button', { name: 'Liberar' })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('403: "Você não tem permissão para isso"', async () => {
    const onClick = jest.fn().mockRejectedValue({ response: { status: 403, data: { error: 'Permissão negada' } } });
    render(<AdminSheet open title="Aprovar" onClose={jest.fn()} primary={{ label: 'Aprovar', onClick }}>x</AdminSheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão para isso');
  });

  it('o erro some ao reabrir', async () => {
    const onClick = jest.fn().mockRejectedValue({ response: { status: 500, data: { error: 'Falhou' } } });
    const props = { title: 'Aprovar', onClose: jest.fn(), primary: { label: 'Aprovar', onClick } };
    const { rerender } = render(<AdminSheet open {...props}>x</AdminSheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
    rerender(<AdminSheet open={false} {...props}>x</AdminSheet>);
    rerender(<AdminSheet open {...props}>x</AdminSheet>);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tom de perigo, botão desabilitado e rótulo secundário próprio', () => {
    const onClick = jest.fn();
    render(
      <AdminSheet open title="Desconectar loja" onClose={jest.fn()} secondaryLabel="Voltar"
        primary={{ label: 'Desconectar', onClick, tone: 'danger', disabled: true }}>x</AdminSheet>,
    );
    const btn = screen.getByRole('button', { name: 'Desconectar' });
    expect(btn.className).toContain('danger');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
  });
});
