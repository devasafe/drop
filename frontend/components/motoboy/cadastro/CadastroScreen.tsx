// frontend/components/motoboy/cadastro/CadastroScreen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { ListChecks } from 'lucide-react';
import MotoboyShell from '../panel/MotoboyShell';
import { MotoboyRecebimento } from '../recebimento/MotoboyRecebimento';
import blocks from '../../panel/PanelBlocks.module.css';
import { Alert } from '../../ui/Alert';
import { EmptyState } from '../../ui/EmptyState';
import { ProgressBar } from '../../ui/ProgressBar';
import { Skeleton } from '../../ui/Skeleton';
import { useAuth } from '../../../contexts/AuthContext';
import { useMotoboyRules } from '../../../hooks/useMotoboyRules';
import { formatMoney } from '../../../lib/money';
import { ETAPA_NUMERO, etapaAtual, loadCadastroState, type CadastroState } from '../../../lib/motoboyCadastro';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import { ROUTES } from '../../../lib/routes';
import { AnaliseStep } from './AnaliseStep';
import { ContaStep } from './ContaStep';
import { VerificacaoStep } from './VerificacaoStep';

type Etapa = 'conta' | 'verificacao' | 'recebimento' | 'analise';

/** Saque mínimo da custódia, da regra única (C4/K5). Regra com erro ou sem valor: nenhum número. */
function SaqueMinimo() {
  const { rules, failed } = useMotoboyRules();
  const minimo = !failed ? rules?.minimumWithdraw : undefined;
  if (minimo == null || !(minimo > 0)) return null;
  return (
    <Alert tone="info" title={`Saque mínimo: ${formatMoney(minimo)}`}>
      Abaixo disso o valor fica guardado em Ganhos até completar.
    </Alert>
  );
}

/** Cadastro do motoboy em 4 etapas numa rota (modelo: /seller/abrir). A etapa sai do servidor; ?etapa= abre uma de propósito. */
export function CadastroScreen() {
  const router = useRouter();
  const auth = useAuth() || ({} as any);
  const { user, loading: authLoading } = auth;
  const role = user?.activeRole || user?.role;
  const isMotoboy = !!user && role === 'motoboy';
  const q = router.query?.etapa;
  const pedida: Etapa | null = q === 'verificacao' || q === 'recebimento' ? q : null;
  const [state, setState] = useState<CadastroState | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  // Só a última leitura vale (onChanged/onSaved/retry podem disparar outra antes de a anterior voltar).
  const load = useCallback(() => {
    if (!isMotoboy) return;
    const my = ++seq.current;
    setFailed(false);
    loadCadastroState()
      .then((s) => { if (my === seq.current) setState(s); })
      .catch(() => { if (my === seq.current) { setState(null); setFailed(true); } });
  }, [isMotoboy]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { seq.current += 1; }, []);

  const atual = state ? etapaAtual(state) : null;
  useEffect(() => {
    if (atual === 'pronto' && !pedida) router.replace(MOTOBOY_ROUTES.corridas);
  }, [atual, pedida]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = pedida ? MOTOBOY_ROUTES.perfil : MOTOBOY_ROUTES.corridas;
  const loadingBody = <><Skeleton height={56} radius="var(--radius-lg)" /><Skeleton height={200} radius="var(--radius-lg)" /></>;
  const frame = (etapa: Etapa | null, title: string, body: JSX.Element, backTo: string) => {
    const n = etapa && etapa !== 'analise' ? ETAPA_NUMERO[etapa] : null;
    return (
      <MotoboyShell title={title} back={backTo} actions={n ? <span className={blocks.meta}>{`${n} de 4`}</span> : undefined}>
        <div className={blocks.body}>
          {n && <ProgressBar value={n} max={4} label="Etapas do cadastro" valueText={`${n} de 4`} />}
          {body}
        </div>
      </MotoboyShell>
    );
  };

  if (authLoading) return frame(null, 'Entregar com a DROP', loadingBody, ROUTES.inicio);
  if (!user) return frame('conta', 'Entregar com a DROP', <ContaStep />, ROUTES.inicio);
  if (!isMotoboy) {
    // O papel é do servidor: a tela não troca papel.
    return frame(null, 'Entregar com a DROP', (
      <Alert tone="warning" title="Esta conta não é de entregador" action={{ label: 'Sair desta conta', onClick: () => auth.logout?.() }}>
        Para entregar com a DROP, crie uma conta de entregador com outro e-mail.
      </Alert>
    ), ROUTES.inicio);
  }
  if (failed) {
    return frame(null, 'Seu cadastro', <EmptyState variant="error" icon={<ListChecks />} title="Não carregamos o seu cadastro" onRetry={load} />, back);
  }
  if (!state || (atual === 'pronto' && !pedida)) return frame(null, 'Seu cadastro', loadingBody, back);

  const etapa: Etapa = pedida ?? (atual as Etapa);

  if (etapa === 'verificacao') return frame('verificacao', 'Sua verificação', <VerificacaoStep onChanged={load} />, back);

  if (etapa === 'recebimento') {
    return frame('recebimento', 'Onde você recebe', (
      <MotoboyRecebimento
        onSaved={load}
        after={(mode) => (
          <>
            {mode === 'custodia' && <SaqueMinimo />}
            <p className={blocks.meta}>Você pode trocar depois em Perfil.</p>
          </>
        )}
      />
    ), back);
  }

  const first = String(user.name || '').trim().split(/\s+/)[0] || 'entregador';
  return frame('analise', `Olá, ${first}`, <AnaliseStep />, back);
}

export default CadastroScreen;
