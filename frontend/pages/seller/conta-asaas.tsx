// frontend/pages/seller/conta-asaas.tsx
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { KeyRound } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import ModeGate from '../../components/ModeGate';
import SellerShell from '../../components/seller/panel/SellerShell';
import { AsaasTermsKeyForm } from '../../components/seller/asaas/AsaasTermsKeyForm';
import { AsaasChecklist } from '../../components/seller/asaas/AsaasChecklist';
import { AsaasNewTerms } from '../../components/seller/asaas/AsaasNewTerms';
import { useAsaasTerms } from '../../components/seller/asaas/useAsaasTerms';
import { asaasConsentState, fmtDateTime, type AsaasStatus } from '../../components/seller/asaas/asaasShared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import api from '../../lib/api';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import { apiErrorMessage } from '../../lib/sellerApi';
import blocks from '../../components/panel/PanelBlocks.module.css';

function KeyCard({ status, onSwap }: { status: AsaasStatus; onSwap: () => void }) {
  const ok = status.status === 'valid';
  const label = ok ? 'Chave válida' : status.status === 'invalid' ? 'Chave inválida' : 'Não conectada';
  const env = status.environment === 'sandbox' ? 'Sandbox' : status.environment === 'production' ? 'Produção' : '';
  const consent = status.consent ? `termo aceito em ${fmtDateTime(status.consent.acceptedAt).split(' às ')[0]}` : 'termo não aceito';
  return (
    <section className={[blocks.blk, blocks.blkRow].join(' ')} aria-label="Chave do Asaas">
      <span className={[blocks.ico, ok ? blocks.icoOk : blocks.icoErr].join(' ')} aria-hidden="true"><KeyRound size={20} /></span>
      <span className={blocks.tx}>
        <b>{status.apiKeyLast4 ? `Chave ••••${status.apiKeyLast4}` : 'Chave do Asaas'}</b>
        <span>{[env, consent].filter(Boolean).join(' · ')}</span>
      </span>
      <span className={[blocks.tag, ok ? blocks.tagOk : blocks.tagErr].join(' ')}>{label}</span>
      <button type="button" className={blocks.link} onClick={onSwap}>Trocar</button>
    </section>
  );
}

function ContaAsaasInner() {
  const router = useRouter();
  const onboarding = router.query.onboarding === '1';
  const terms = useAsaasTerms();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [egressIp, setEgressIp] = useState<string | null>(null);
  const [status, setStatus] = useState<AsaasStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [swapKey, setSwapKey] = useState(false);

  // V12: no painel, a loja vem do SellerPanelProvider (espera ele carregar); fora, o GET próprio.
  const panel = useSellerPanel();
  const inPanel = panel?.inPanel === true;
  const panelWaiting = inPanel && panel.loading;
  const panelStore = inPanel ? panel.store : null;

  useEffect(() => {
    if (panelWaiting) return undefined;
    let cancelled = false;
    (async () => {
      const dash = inPanel
        ? { store: panelStore }
        : await api.get('/stores/dashboard').then((r) => r.data).catch(() => null);
      const id = dash?.store?._id || dash?._id;
      if (cancelled) return;
      if (id) setStoreId(String(id));
      else setLoadError('Crie a loja antes de conectar a conta Asaas.');
      const saas = await api.get('/settings/saas').then((r) => r.data).catch(() => null);
      if (!cancelled) setEgressIp(saas?.egressIp ?? null);
    })();
    return () => { cancelled = true; };
  }, [panelWaiting]); // eslint-disable-line react-hooks/exhaustive-deps

  const apiBase = storeId ? `/stores/${storeId}/asaas` : null;
  const load = useCallback(async () => {
    if (!apiBase) return;
    try {
      const r = await api.get(apiBase);
      setStatus(r.data?.data ?? null);
      setLoadError('');
    } catch (e) {
      setLoadError(apiErrorMessage(e, 'Não foi possível carregar a sua conta Asaas.'));
    }
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const update = (s: AsaasStatus | null) => { if (s) setStatus(s); };
  const connected = !!status && status.status !== 'none';
  // Fail closed: sem aceite válido os pedidos Pix ficam bloqueados; aceite de versão antiga só avisa.
  const { blocking, outdated } = asaasConsentState(status);
  const c = status?.checklist;
  const allDone = status?.status === 'valid' && !blocking && !!c && c.apiKey && c.paymentWebhook && c.ipWhitelistConfirmed && c.authWebhookConfirmed;
  // O termo e a chave e o novo termo usam o mesmo useAsaasTerms, cada um com o seu aceite: nunca os dois na tela.
  const showKeyForm = !connected || swapKey || status?.status === 'invalid';
  const showNewTerms = !showKeyForm && (blocking || outdated);

  if (loadError && !status) {
    return (
      <div className={blocks.body}>
        <Alert tone="error" title={loadError} action={storeId ? { label: 'Tentar de novo', onClick: () => { load(); } } : undefined} />
      </div>
    );
  }
  if (!status || !apiBase || !storeId) {
    return (
      <div className={blocks.body}>
        <Skeleton height={96} radius="var(--radius-lg)" />
        <Skeleton height={240} radius="var(--radius-lg)" />
      </div>
    );
  }

  return (
    <div className={blocks.body}>
      {connected && <KeyCard status={status} onSwap={() => setSwapKey(true)} />}
      {showKeyForm && (
        <AsaasTermsKeyForm
          apiBase={apiBase}
          terms={terms}
          connected={connected}
          onConnected={(s) => { update(s); setSwapKey(false); }}
          onCancel={connected && status.status !== 'invalid' ? () => setSwapKey(false) : undefined}
        />
      )}
      {showNewTerms && (
        <AsaasNewTerms apiBase={apiBase} terms={terms} status={status} blocking={blocking} onStatus={update} />
      )}
      {!swapKey && status.status === 'valid' && (
        <AsaasChecklist apiBase={apiBase} storeId={storeId} status={status} egressIp={egressIp} onStatus={update} />
      )}
      {onboarding && allDone && (
        <Button onClick={() => router.push('/seller/abrir')}>Voltar para Abrir a loja</Button>
      )}
    </div>
  );
}

export default function SellerContaAsaas() {
  const router = useRouter();
  const onboarding = router.query.onboarding === '1';
  return (
    <ProtectedRoute required_role="lojista">
      <ModeGate mode="direto">
        <SellerShell title="Conta Asaas" back={onboarding ? '/seller/abrir' : '/seller/loja'}>
          <ContaAsaasInner />
        </SellerShell>
      </ModeGate>
    </ProtectedRoute>
  );
}
