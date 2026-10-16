import { useRouter } from 'next/router';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { TaxasTab } from '../../components/admin/regras/TaxasTab';
import { ModoTab } from '../../components/admin/regras/ModoTab';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Regras e taxas (D3a, telas 22 e 26). Abas por ?aba=: Taxas e tempos (settings:manage) e
 * Modo da plataforma (só o CEO, D4). Aba pedida sem permissão cai na primeira aba permitida.
 */
type RegrasAba = 'taxas' | 'modo';

const TITLES: Record<RegrasAba, string> = {
  taxas: 'Regras e taxas · Taxas e tempos',
  modo: 'Regras e taxas · Modo da plataforma',
};

export default function AdminRegras() {
  return (
    <ProtectedRoute required_permission="settings:manage">
      <RegrasBody />
    </ProtectedRoute>
  );
}

function RegrasBody() {
  const router = useRouter();
  const { user, can } = useAuth();
  const isCeo = (user?.activeRole || user?.role) === 'ceo';

  const allowed: RegrasAba[] = [];
  if (can('settings:manage')) allowed.push('taxas');
  if (isCeo) allowed.push('modo');

  const requested = typeof router.query.aba === 'string' ? router.query.aba : 'taxas';
  const aba: RegrasAba | undefined = allowed.find((a) => a === requested) ?? allowed[0];
  if (!aba) return null;

  return (
    <AdminShell title={TITLES[aba]} tabs="regras">
      {aba === 'taxas' && <TaxasTab />}
      {aba === 'modo' && <ModoTab />}
    </AdminShell>
  );
}
