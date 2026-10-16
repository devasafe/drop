import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { TicketsView, type TicketFilter } from '../../components/admin/suporte/TicketsView';
import { ConversasView } from '../../components/admin/suporte/ConversasView';
import { Chip } from '../../components/ui/Chip';
import { useAuth } from '../../contexts/AuthContext';
import styles from '../../components/admin/suporte/Suporte.module.css';

/**
 * Suporte (D3a, tela 19). Junta /admin/suporte (chamados) e a antiga página conversas (filtro "Conversas entre usuários",
 * somente leitura). D1: o portão aceita support:attend OU conversations:view_all; os filtros de chamados exigem
 * can('support:attend') e o de conversas, can('conversations:view_all'). ?filtro=conversas abre direto nas conversas.
 */
type Filtro = TicketFilter | 'conversas';

const FILTERS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'aberto', label: 'Abertos' },
  { id: 'em_atendimento', label: 'Em atendimento' },
  { id: 'comigo', label: 'Comigo' },
  { id: 'resolvido', label: 'Resolvidos' },
  { id: 'conversas', label: 'Conversas entre usuários' },
];

export default function AdminSuporte() {
  return (
    <ProtectedRoute required_permission={['support:attend', 'conversations:view_all']}>
      <AdminShell title="Suporte">
        <SuporteBody />
      </AdminShell>
    </ProtectedRoute>
  );
}

function SuporteBody() {
  const router = useRouter();
  const { can } = useAuth();
  const canTickets = can('support:attend');
  const canConversas = can('conversations:view_all');
  const visible = FILTERS.filter((f) => (f.id === 'conversas' ? canConversas : canTickets));
  const wanted: Filtro = router.query.filtro === 'conversas' ? 'conversas' : 'todos';
  const pick = (want: Filtro): Filtro => (visible.some((f) => f.id === want) ? want : visible[0]?.id ?? 'todos');
  const [filtro, setFiltro] = useState<Filtro>(() => pick(wanted));

  useEffect(() => {
    setFiltro(pick(wanted));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, canTickets, canConversas]);

  if (visible.length === 0) return null;

  return (
    <div className={styles.page}>
      <div className={styles.filters} role="group" aria-label="Filtro do suporte">
        {visible.map((f) => (
          <Chip key={f.id} label={f.label} active={filtro === f.id} onClick={() => setFiltro(f.id)} />
        ))}
      </div>
      {filtro === 'conversas' ? <ConversasView /> : <TicketsView filter={filtro} />}
    </div>
  );
}
