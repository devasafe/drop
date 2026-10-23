import { useRouter } from 'next/router';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { TaxasTab } from '../../components/admin/regras/TaxasTab';
import { RankingTab } from '../../components/admin/regras/RankingTab';
import { ModoTab } from '../../components/admin/regras/ModoTab';
import { HistoricoTab } from '../../components/admin/regras/HistoricoTab';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Regras e taxas (D3a, telas 22 e 26). Abas por ?aba=:
 * - Taxas e tempos: can('settings:manage');
 * - Ranking (antes a página ranking-config): can('ranking:manage');
 * - Modo da plataforma: só o CEO (D4);
 * - Histórico (D3b-4a): can('settings:manage'), quem mudou cada regra e taxa.
 * D1: o portão aceita QUALQUER UMA das permissões das páginas fundidas; cada aba exige a sua.
 * Aba pedida sem permissão cai na primeira aba permitida.
 */
type RegrasAba = 'taxas' | 'ranking' | 'modo' | 'historico';

const TITLES: Record<RegrasAba, string> = {
  taxas: 'Regras e taxas · Taxas e tempos',
  ranking: 'Regras e taxas · Ranking',
  modo: 'Regras e taxas · Modo da plataforma',
  historico: 'Regras e taxas · Histórico',
};

export default function AdminRegras() {
  return (
    <ProtectedRoute required_permission={['settings:manage', 'ranking:manage']}>
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
  if (can('ranking:manage')) allowed.push('ranking');
  if (isCeo) allowed.push('modo');
  if (can('settings:manage')) allowed.push('historico');

  const requested = typeof router.query.aba === 'string' ? router.query.aba : 'taxas';
  const aba: RegrasAba | undefined = allowed.find((a) => a === requested) ?? allowed[0];
  if (!aba) return null;

  return (
    <AdminShell title={TITLES[aba]} tabs="regras">
      {aba === 'taxas' && <TaxasTab />}
      {aba === 'ranking' && <RankingTab />}
      {aba === 'modo' && <ModoTab />}
      {aba === 'historico' && <HistoricoTab />}
    </AdminShell>
  );
}
