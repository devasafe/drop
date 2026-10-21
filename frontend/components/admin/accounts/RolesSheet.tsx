/**
 * Papéis da pessoa (D3a; da linha da lista para a ficha na D3b-2a): uma caixinha por papel; grava a lista
 * COMPLETA em PUT /admin/users/:id/roles. Cliente sempre marcado e travado; fora do CEO, os papéis da equipe
 * ficam travados (o servidor também recusa). 409 ROLE_HAS_OPEN_WORK: a mensagem fica na folha, que continua
 * aberta. Outro erro sobe para a AdminSheet, que mostra o texto do servidor.
 */
import { useEffect, useState } from 'react';
import { AdminSheet } from '../AdminSheet';
import blocks from '../AdminBlocks.module.css';
import form from '../pessoas/PessoasForm.module.css';
import { Checkbox } from '../../ui/Checkbox';
import { isConflictWithCode } from '../../../lib/adminErrors';
import { ROLE_OPTIONS, STAFF_ROLES, sameRoles, saveUserRoles, sortRoles, withCliente } from '../../../lib/adminAccounts';

export interface RolesSheetProps {
  open: boolean;
  user: { id: string; name: string; email: string; roles: string[] };
  /** Quem mexe é CEO: só o CEO marca ou desmarca papel da equipe. */
  isCeo: boolean;
  onClose: () => void;
  /** Gravou. `storesClosed` = lojas que o servidor fechou porque o papel Lojista saiu. */
  onSaved: (storesClosed: number) => void;
}

export function RolesSheet({ open, user, isCeo, onClose, onSaved }: RolesSheetProps) {
  const initial = withCliente(user.roles);
  const initialKey = initial.join(',');
  const [roles, setRoles] = useState<string[]>(initial);
  const [error, setError] = useState<string | null>(null);

  // Abrir (ou a ficha relida com outros papéis) volta para o que está gravado.
  useEffect(() => {
    if (!open) return;
    setRoles(initialKey.split(','));
    setError(null);
  }, [open, initialKey]);

  const toggle = (role: string, on: boolean) => {
    setError(null);
    setRoles((prev) => sortRoles(on ? [...prev, role] : prev.filter((r) => r !== role)));
  };

  const save = async () => {
    try {
      const { storesClosed } = await saveUserRoles(user.id, roles);
      onSaved(storesClosed);
    } catch (err) {
      if (!isConflictWithCode(err, 'ROLE_HAS_OPEN_WORK')) throw err;
      const data = (err as { response: { data: { role?: string; count?: number } } }).response.data;
      setError(data.role === 'motoboy'
        ? `Esta pessoa tem ${data.count} entrega(s) em andamento. Termine ou repasse antes de tirar o papel de Motoboy.`
        : `Esta pessoa tem ${data.count} pedido(s) em aberto na loja. Termine ou repasse antes de tirar o papel de Lojista.`);
    }
  };

  return (
    <AdminSheet
      open={open}
      title="Papéis"
      onClose={onClose}
      primary={{ label: 'Salvar', onClick: save, disabled: sameRoles(roles, initial) }}
    >
      <p className={form.lead}>{user.name} ({user.email})</p>
      <div role="group" aria-label="Papéis da pessoa" className={form.field}>
        {ROLE_OPTIONS.map((r) => (
          <Checkbox
            key={r.value}
            label={r.label}
            checked={r.value === 'cliente' || roles.includes(r.value)}
            disabled={r.value === 'cliente' || (!isCeo && STAFF_ROLES.includes(r.value))}
            description={r.value === 'cliente' ? 'Todo mundo pode comprar' : undefined}
            onChange={(on) => toggle(r.value, on)}
          />
        ))}
      </div>
      {error && <p className={blocks.errText} role="alert">{error}</p>}
      <p className={blocks.muted}>A sessão aberta da pessoa é desconectada para os papéis novos valerem.</p>
    </AdminSheet>
  );
}

export default RolesSheet;
