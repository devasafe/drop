import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Bike, CalendarDays, Clock, ListChecks, Package, QrCode } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { NavRow } from '../../components/seller/ui/NavRow';
import { STEP_ICON_CLASS, stepStateIcon, stepSubText } from '../../components/seller/abrir/stepView';
import { IdentityCheck } from '../../components/drop/IdentityCheck';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Skeleton } from '../../components/ui/Skeleton';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import api from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { payload } from '../../lib/sellerApi';
import { summarizeHours } from '../../lib/sellerHours';
import { loadStoreOnboarding, type ChecklistStep, type StepState, type StoreOnboarding } from '../../lib/storeOnboarding';
import { DadosLojaStep } from '../../components/seller/abrir/DadosLojaStep';
import { DocumentosStep } from '../../components/seller/abrir/DocumentosStep';
import { PlanoStep } from '../../components/seller/abrir/PlanoStep';
import { RecebimentoForm } from '../../components/onboarding/RecebimentoForm';
import blocks from '../../components/seller/ui/SellerBlocks.module.css';

const ICON_CLASS = STEP_ICON_CLASS;
const stateIcon = stepStateIcon;
const stepSub = stepSubText;

function ComoFunciona({ fee, trialDays, freight }: { fee: number | null; trialDays: number | null; freight: { base: number; perKm: number } | null }) {
  const feeText = fee == null ? null : fee > 0
    ? `Mensalidade fixa de ${formatMoney(fee)}${trialDays ? `, com ${trialDays} dias grátis` : ''}. Nenhuma comissão por venda.`
    : 'Grátis no lançamento. Nenhuma comissão por venda.';
  return (
    <section className={blocks.blk} aria-label="Como funciona">
      <div className={blocks.head}>
        <h2 className={blocks.headTitle}>Como funciona</h2>
        <span className={[blocks.tag, blocks.tagInfo].join(' ')}>modo SaaS</span>
      </div>
      <div className={[blocks.blkRow, blocks.row].join(' ')}>
        <span className={[blocks.ico, blocks.icoBrand].join(' ')} aria-hidden="true"><QrCode size={18} /></span>
        <p className={blocks.sub}>O cliente paga por Pix e o valor cai na sua conta Asaas. Não tem saque nem espera.</p>
      </div>
      <div className={[blocks.blkRow, blocks.row].join(' ')}>
        <span className={[blocks.ico, blocks.icoBrand].join(' ')} aria-hidden="true"><Bike size={18} /></span>
        <p className={blocks.sub}>
          {freight
            ? `Na entrega, a sua conta paga o motoboy por Pix sozinha: ${formatMoney(freight.base)} + ${formatMoney(freight.perKm)} por km, que o cliente já pagou no frete.`
            : 'Na entrega, a sua conta paga o motoboy por Pix sozinha, com a taxa que o cliente já pagou no frete.'}
        </p>
      </div>
      {feeText && (
        <div className={[blocks.blkRow, blocks.row].join(' ')}>
          <span className={[blocks.ico, blocks.icoBrand].join(' ')} aria-hidden="true"><CalendarDays size={18} /></span>
          <p className={blocks.sub}>{feeText}</p>
        </div>
      )}
    </section>
  );
}

/** Etapas que abrem DENTRO do checklist (protótipo 8). A Conta Asaas (direto) tem tela própria. */
const EMBEDDED = new Set(['loja', 'identidade', 'lojaVerif', 'pix', 'plano']);

export default function SellerAbrir() {
  const router = useRouter();
  const { settlementMode, loading: modeLoading } = useSaasConfig();
  const etapa = typeof router.query.etapa === 'string' ? router.query.etapa : null;
  const [data, setData] = useState<StoreOnboarding | null>(null);
  const [failed, setFailed] = useState(false);
  const [saas, setSaas] = useState<{ saasMonthlyFee?: number; saasTrialDays?: number } | null>(null);
  const [freight, setFreight] = useState<{ base: number; perKm: number } | null>(null);

  const load = useCallback(() => {
    if (modeLoading || etapa === 'identidade') return;
    setFailed(false);
    setData(null);
    loadStoreOnboarding(settlementMode).then(setData).catch(() => setFailed(true));
  }, [modeLoading, settlementMode, etapa]);
  useEffect(() => { load(); }, [load]);

  // Depois de uma etapa embutida: relê sem trocar a tela por esqueleto (a próxima etapa abre sozinha).
  const refresh = useCallback(() => {
    if (modeLoading) return;
    loadStoreOnboarding(settlementMode).then(setData).catch(() => setFailed(true));
  }, [modeLoading, settlementMode]);

  useEffect(() => {
    if (settlementMode !== 'direto') return;
    api.get('/settings/saas').then((r) => setSaas(r.data ?? null)).catch(() => setSaas(null));
    // Fórmula do frete (a mesma do deliveryQuote): base por entrega + valor por km. Sem ela, texto genérico.
    api.get('/settings/platform-config')
      .then((r) => {
        const cfg = payload<any>(r);
        const base = Number(cfg?.motoboyCutPerDelivery);
        const perKm = Number(cfg?.motoboyCutPerKm);
        setFreight(Number.isFinite(base) && Number.isFinite(perKm) && base > 0 ? { base, perKm } : null);
      })
      .catch(() => setFreight(null));
  }, [settlementMode]);

  if (etapa === 'identidade') {
    const email = router.query.email === 'ok' || router.query.email === 'erro' ? router.query.email : null;
    return (
      <ProtectedRoute required_role="lojista">
        <SellerShell title="Sua identidade" back="/seller/abrir">
          <div className={blocks.body}>
            <p className={blocks.sub}>Confirmamos o e-mail e o documento do dono uma vez só.</p>
            <IdentityCheck emailResult={email} onDone={() => router.push('/seller/abrir')} />
          </div>
        </SellerShell>
      </ProtectedRoute>
    );
  }

  const direto = settlementMode === 'direto';
  const hasUnknown = !!data && data.steps.some((s) => s.state === 'unknown');
  const fee = saas?.saasMonthlyFee != null ? Number(saas.saasMonthlyFee) : null;
  const trialDays = saas?.saasTrialDays != null ? Number(saas.saasTrialDays) : null;

  const unknownAlert = hasUnknown ? (
    <Alert tone="warning" title="Não conseguimos conferir tudo" action={{ label: 'Tentar de novo', onClick: load }}>
      Alguma etapa não carregou agora. Isso não quer dizer que falta algo: tente de novo em instantes.
    </Alert>
  ) : null;

  // Etapa aberta: a de ?etapa= (se existir neste fluxo) ou a atual.
  const askedStep = etapa && data ? data.steps.find((s) => s.key === etapa) ?? null : null;
  // Com ?etapa=, voltar ao checklist já relê tudo (o efeito de carga depende da etapa).
  const stepDone = () => { if (etapa) router.push('/seller/abrir'); else refresh(); };

  const embedded = (s: ChecklistStep | null): JSX.Element | null => {
    if (!s || !data || !EMBEDDED.has(s.key)) return null;
    const storeId = data.store?._id ? String(data.store._id) : null;
    let body: JSX.Element;
    if (s.key === 'loja') {
      body = <DadosLojaStep store={data.store} cnpjRequired={!direto} onDone={stepDone} />;
    } else if (s.key === 'identidade') {
      body = <IdentityCheck onDone={stepDone} />;
    } else if (!storeId) {
      body = (
        <Alert tone="info" title="Crie a loja primeiro" action={{ label: 'Criar a loja', onClick: () => router.push('/seller/abrir?etapa=loja') }}>
          Esta etapa precisa da loja já criada.
        </Alert>
      );
    } else if (s.key === 'lojaVerif') {
      body = (
        <DocumentosStep
          storeId={storeId}
          storeCnpj={data.store?.cnpj}
          onChanged={refresh}
          onEditStore={() => router.push('/seller/abrir?etapa=loja')}
          onOwner={() => router.push('/seller/abrir?etapa=identidade')}
        />
      );
    } else if (s.key === 'pix') {
      body = <RecebimentoForm direct={direto} store onSaved={stepDone} />;
    } else {
      body = <PlanoStep onDone={stepDone} />;
    }
    return (
      <section className={blocks.stack} aria-label={`Etapa: ${s.label}`} data-etapa={s.key}>
        <h2 className={blocks.cap}>{s.label}</h2>
        {body}
      </section>
    );
  };

  let content: JSX.Element;
  if (failed) {
    content = <EmptyState variant="error" icon={<ListChecks />} title="Não carregamos o seu cadastro" onRetry={load} />;
  } else if (!data) {
    content = (
      <>
        <Skeleton height={120} radius="var(--radius-lg)" />
        <Skeleton height={240} radius="var(--radius-lg)" />
      </>
    );
  } else if (data.approved) {
    content = (
      <section className={[blocks.blk, blocks.blkSuccess].join(' ')} aria-label="Loja aprovada">
        <h2 className={blocks.headTitle}>Sua loja está aprovada</h2>
        <p className={blocks.sub}>Abra quando quiser. Os pedidos chegam na aba Agora.</p>
        <Button onClick={() => router.push('/seller/dashboard')}>Ir para Agora</Button>
      </section>
    );
  } else if (data.mode === 'custodia' && data.store && data.steps.every((s) => s.state !== 'todo' && s.state !== 'unknown')) {
    // Em análise: tudo enviado; pode haver item recusado para reenviar.
    const done = data.steps.filter((s) => s.state === 'done').length;
    const rejected = data.steps.find((s) => s.state === 'rejected') || null;
    const rows: Array<{ key: string; label: string; state: StepState; reason?: string; step: ChecklistStep }> = [];
    for (const s of data.steps) {
      if (s.items && s.items.length) for (const it of s.items) rows.push({ key: `${s.key}-${it.key}`, label: it.label, state: it.state, reason: it.reason, step: s });
      else rows.push({ key: s.key, label: s.label, state: s.state, reason: s.reason, step: s });
    }
    content = (
      <>
        {unknownAlert}
        <section className={[blocks.blk, blocks.blkBrand].join(' ')} aria-label="Em análise">
          <h2 className={blocks.headTitle}>Quase lá</h2>
          <p className={blocks.sub}>O DROP confere seus documentos em até 1 dia útil.</p>
          <ProgressBar value={done} max={data.steps.length} label="Etapas aprovadas" valueText={`${done} de ${data.steps.length}`} />
        </section>
        <ul className={blocks.list}>
          {rows.map((r, i) => (
            <li key={r.key} className={[blocks.row, r.state === 'rejected' && blocks.rowCurrent].filter(Boolean).join(' ')}>
              <span className={[blocks.ico, ICON_CLASS[r.state]].filter(Boolean).join(' ')} aria-hidden="true">{stateIcon(r.state, i)}</span>
              <span className={blocks.tx}>
                <b>{r.label}</b>
                <span className={r.state === 'rejected' ? blocks.warn : undefined}>{stepSub(r, 'Aprovado')}</span>
              </span>
              {r.state === 'rejected' && <Button size="sm" onClick={() => router.push(r.step.href)}>Reenviar</Button>}
            </li>
          ))}
        </ul>
        {embedded(askedStep)}
        <h2 className={blocks.cap}>Enquanto isso</h2>
        <ul className={blocks.list}>
          <NavRow
            icon={<Package size={20} />}
            iconClassName={blocks.icoBrand}
            label="Cadastre seus produtos"
            sub={`${data.productsCount} cadastrados · aparecem quando a loja for aprovada`}
            onClick={() => router.push('/seller/create-product')}
          />
          <NavRow icon={<Clock size={20} />} label="Defina seus horários" sub={summarizeHours(data.store?.operatingHours)} onClick={() => router.push('/seller/horarios')} />
        </ul>
        <div className={blocks.bar}>
          {rejected && <Button onClick={() => router.push(rejected.href)}>{`Reenviar: ${rejected.label}`}</Button>}
          <small>Avisamos por e-mail e notificação quando a loja for aprovada.</small>
        </div>
      </>
    );
  } else {
    const total = data.steps.length;
    const done = data.steps.filter((s) => s.state === 'done').length;
    const left = total - done;
    const open = askedStep ?? data.current;
    const openSection = embedded(open);
    content = (
      <>
        {unknownAlert}
        <section className={[blocks.blk, blocks.blkBrand].join(' ')} aria-label="Progresso">
          <div className={blocks.head}>
            <h2 className={blocks.headTitle}>
              {direto ? (left === 1 ? 'Falta 1 passo para vender' : `Faltam ${left} passos para vender`) : 'Abrir sua loja'}
            </h2>
            <span className={blocks.meta}>{`${done} de ${total}`}</span>
          </div>
          <ProgressBar value={done} max={total} label="Etapas concluídas" valueText={`${done} de ${total}`} />
          <p className={blocks.sub}>Dá para parar e continuar depois. Salvamos cada etapa.</p>
        </section>
        <ul className={blocks.list}>
          {data.steps.map((s, i) => {
            const isCurrent = data.current?.key === s.key;
            return (
              <NavRow
                key={s.key}
                icon={stateIcon(s.state, i)}
                iconClassName={isCurrent && s.state === 'todo' ? blocks.icoBrand : ICON_CLASS[s.state]}
                label={s.label}
                sub={stepSub(s)}
                current={isCurrent}
                end={isCurrent
                  ? <span className={[blocks.tag, blocks.tagBrand].join(' ')}>agora</span>
                  : s.key === 'loja' && s.state === 'done' ? <span className={blocks.link}>Editar</span> : undefined}
                onClick={() => router.push(s.href)}
              />
            );
          })}
        </ul>
        {openSection}
        {direto ? (
          <>
            <ComoFunciona fee={fee} trialDays={trialDays} freight={freight} />
            <Alert tone="info" title="Você pulou 2 etapas">
              No modo SaaS não pedimos verificação da loja, chave Pix nem escolha de plano: quem é verificado é o dono.
            </Alert>
          </>
        ) : (
          <Alert tone="info">A análise leva até 1 dia útil. Você já pode cadastrar produtos enquanto isso.</Alert>
        )}
        {data.current && !(openSection && open?.key === data.current.key) && (
          <div className={blocks.bar}>
            <Button onClick={() => router.push(data.current!.href)}>{`Continuar: ${data.current.label}`}</Button>
            {direto && data.current.key === 'asaas' && <small>Leva uns 5 minutos com o Asaas aberto.</small>}
          </div>
        )}
      </>
    );
  }

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Abrir a loja" back={etapa ? '/seller/abrir' : '/seller/loja'}>
        <div className={blocks.body}>{content}</div>
      </SellerShell>
    </ProtectedRoute>
  );
}
