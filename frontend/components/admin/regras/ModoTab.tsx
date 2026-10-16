import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/api';
import { adminErrorMessage } from '../../../lib/adminErrors';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { SettlementModeCard } from './SettlementModeCard';
import { SaasFeeCard } from './SaasFeeCard';
import type { SwitchesState } from './switches';
import blocks from '../AdminBlocks.module.css';

/**
 * Regras e taxas · Modo da plataforma (D3a, tela 26; aba só do CEO). Lê GET /admin/switches;
 * sem leitura, nenhum modo é presumido (D2): erro com "Tentar de novo".
 */
export function ModoTab() {
  const [state, setState] = useState<SwitchesState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get('/admin/switches');
      setState(r.data);
    } catch (err) {
      setError(adminErrorMessage(err, 'Não deu para ler o modo da plataforma.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className={blocks.block}>
        <p className={blocks.errText} role="alert">{error}</p>
        <div><Button variant="secondary" onClick={load}>Tentar de novo</Button></div>
      </div>
    );
  }
  if (!state) {
    return (
      <div className={blocks.block} aria-busy="true" aria-label="Carregando">
        <Skeleton height={96} />
        <Skeleton height={96} />
      </div>
    );
  }

  return (
    <div className={blocks.grid2}>
      {state.settlementMode && (
        <SettlementModeCard
          mode={state.settlementMode}
          onChanged={(m) => setState((prev) => (prev ? { ...prev, settlementMode: m } : prev))}
        />
      )}
      {state.saasMonthlyFee !== undefined && <SaasFeeCard initial={state} onSaved={setState} />}
    </div>
  );
}

export default ModoTab;
