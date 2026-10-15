// frontend/components/motoboy/ganhos/weekSummary.ts
import { unwrap } from '../../../lib/sellerApi';

/** "Esta semana" do servidor (GET /deliveries/summary → week). K35: a tela nunca soma no cliente. */
export interface Week { earnings: number; count: number }

/** Lê `week` do corpo do resumo; formato estranho → null (a tela mostra erro, nunca um número inventado). */
export const toWeek = (d: any): Week | null => {
  const w = d?.week;
  return w && Number.isFinite(w.earnings) && Number.isFinite(w.count) ? { earnings: w.earnings, count: w.count } : null;
};

/** Mesmo que toWeek, a partir da resposta do axios ({ data } ou { success, data }). */
export const weekFromResponse = (res: any): Week | null => toWeek(unwrap<any>(res));
