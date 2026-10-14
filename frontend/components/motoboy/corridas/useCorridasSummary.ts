import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../lib/api';
import { unwrap } from '../../../lib/sellerApi';
import { useSocket } from '../../../contexts/SocketContext';

export interface CorridasSummary {
  today: { earnings: number; count: number };
  week: { earnings: number; count: number };
}

const isPart = (p: any) => p && Number.isFinite(p.earnings) && Number.isFinite(p.count);

/** KPIs do Corridas, calculados no servidor (fuso de São Paulo). Erro nunca vira R$ 0,00. */
export function useCorridasSummary(): { summary: CorridasSummary | null; error: boolean; retry: () => void } {
  const { on, onReconnect } = useSocket();
  const [summary, setSummary] = useState<CorridasSummary | null>(null);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  const load = useCallback(() => {
    const my = ++seq.current;
    api.get('/deliveries/summary')
      .then((r: any) => {
        if (my !== seq.current) return;
        const d = unwrap<any>(r);
        if (!isPart(d?.today) || !isPart(d?.week)) throw new Error('resumo malformado');
        setSummary({ today: { earnings: d.today.earnings, count: d.today.count }, week: { earnings: d.week.earnings, count: d.week.count } });
        setError(false);
      })
      .catch(() => { if (my === seq.current) { setSummary(null); setError(true); } });
  }, []);

  useEffect(() => {
    load();
    const offDone = on('delivery:completed', load);
    const offRe = onReconnect?.(load);
    return () => { offDone?.(); offRe?.(); };
  }, [on, onReconnect, load]);

  useEffect(() => () => { seq.current++; }, []);

  return { summary, error, retry: load };
}
