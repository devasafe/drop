import { ROUTES } from './routes';
import { SELLER_ROUTES } from './sellerRoutes';
import { MOTOBOY_ROUTES } from './motoboyRoutes';

const STAFF = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];

/** Ajuda de cada perfil (dúvidas + chamados). A equipe vai para a fila de atendimento. */
export function helpRouteFor(role?: string | null): string {
  if (role === 'lojista') return SELLER_ROUTES.ajuda;
  if (role === 'motoboy') return MOTOBOY_ROUTES.perfilAjuda;
  if (role && STAFF.includes(role)) return '/admin/suporte';
  return ROUTES.ajuda;
}
