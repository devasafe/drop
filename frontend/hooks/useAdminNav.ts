import { useAuth } from '../contexts/AuthContext';
import { useSaasConfig } from './useSaasConfig';
import { useAdminCustodyOpen } from './useAdminCustodyOpen';
import { visibleAdminAreas, type AdminArea } from '../lib/adminNav';

export interface AdminNavState {
  /** Áreas do menu visíveis ao papel no modo atual, só com as abas visíveis. */
  areas: AdminArea[];
  /** Modo lido do servidor; null enquanto carrega ou quando a leitura falhou (nunca presume custódia). */
  settlementMode: 'custodia' | 'direto' | null;
  modeError: boolean;
  retryMode?: () => void;
  role?: string;
  isCeo: boolean;
}

/** Contexto do menu do admin: papel e permissões (AuthContext), modo de liquidação e custódia em aberto. */
export function useAdminNav(): AdminNavState {
  const { user, can } = useAuth();
  const saas = useSaasConfig();
  const custodyOpen = useAdminCustodyOpen();
  const role: string | undefined = user?.activeRole || user?.role;
  const isCeo = role === 'ceo';
  const settlementMode = saas.loading || saas.error ? null : saas.settlementMode;
  const areas = visibleAdminAreas({
    can: typeof can === 'function' ? can : () => false,
    isCeo,
    settlementMode,
    custodyOpen,
  });
  return { areas, settlementMode, modeError: !!saas.error, retryMode: saas.retry, role, isCeo };
}

export default useAdminNav;
