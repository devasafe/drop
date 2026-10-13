import { ChangeEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Bell, Camera, ChartColumn, CirclePause, Clock, Image as ImageIcon, KeyRound, ListChecks, LogOut, Pencil, Plug, QrCode, Receipt, Star, Store, Ticket, Wallet,
} from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import { PauseSheet, isPaused, pausedUntilLabel, resumeStore } from '../../components/seller/loja/PauseSheet';
import { IdentitySheet, uploadStoreImage, MAX_IMAGE_BYTES } from '../../components/seller/loja/IdentitySheet';
import { NavRow } from '../../components/seller/ui/NavRow';
import PushEnableBanner from '../../components/PushEnableBanner';
import StoreQRCode from '../../components/StoreQRCode';
import Icon from '../../components/Icon';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { formatRating } from '../../components/ui/Rating';
import { useAuth } from '../../contexts/AuthContext';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import api from '../../lib/api';
import { imageUrl } from '../../lib/config';
import { storeAnalytics, type StoreOverview } from '../../lib/analyticsApi';
import { ROLE_AREAS, ROLE_HOME } from '../../lib/navConfig';
import { openStatus } from '../../lib/storeHours';
import { summarizeHours } from '../../lib/sellerHours';
import { payload, apiErrorMessage } from '../../lib/sellerApi';
import blocks from '../../components/seller/ui/SellerBlocks.module.css';
import styles from './SellerLoja.module.css';

const PLAN_NAME: Record<number, string> = { 1: 'Vitrine', 2: 'Pool de motoboys', 3: 'Premium' };
const pct = (n: number) => `${(Number(n) || 0).toFixed(1).replace('.', ',')}%`;
const initials = (name?: string) => (name || 'Loja').split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

export default function SellerLoja() {
  const router = useRouter();
  const { user, logout, switchRole } = useAuth() || ({} as any);
  const { store, orders, refresh } = useSellerPanel();
  const { settlementMode } = useSaasConfig();
  const direto = settlementMode === 'direto';
  const { showToast } = useToast();

  const storeId = store?._id ? String(store._id) : null;
  const [ratings, setRatings] = useState<any[] | null>(null);
  const [ratingsFailed, setRatingsFailed] = useState(false);
  const [overview, setOverview] = useState<StoreOverview | null>(null);
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [featuredBusy, setFeaturedBusy] = useState(false);
  const [resuming, setResuming] = useState(false);

  useEffect(() => { setPausedUntil(store?.pausedUntil ?? null); }, [store?.pausedUntil]);

  const loadRatings = useCallback(() => {
    if (!storeId) return;
    setRatingsFailed(false);
    api.get(`/stores/${storeId}/ratings`)
      .then((r) => { const list = payload<any[]>(r); setRatings(Array.isArray(list) ? list : []); })
      .catch(() => setRatingsFailed(true));
  }, [storeId]);
  const loadOverview = useCallback(() => {
    setOverviewFailed(false);
    storeAnalytics.overview('30d').then(setOverview).catch(() => setOverviewFailed(true));
  }, []);

  useEffect(() => { loadRatings(); }, [loadRatings]);
  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => {
    if (direto) return;
    api.get('/settings/platform-config').then((r) => setConfig(payload(r))).catch(() => setConfig(null));
  }, [direto]);

  // Troca de perfil: mesma regra de /conta. O backend decide; se recusar, não navega.
  const activeRole = user?.activeRole || user?.role || 'lojista';
  const roles: string[] = user?.roles || (user?.role ? [user.role] : []);
  const otherAreas = roles.length > 1 ? ROLE_AREAS.filter((a) => roles.includes(a.role) && a.role !== activeRole) : [];
  const goToArea = async (role: string) => {
    try { await switchRole(role); } catch { return; }
    router.push(ROLE_HOME[role as keyof typeof ROLE_HOME]);
  };

  const ratingCount = ratings?.length ?? 0;
  const ratingAvg = ratingCount ? ratings!.reduce((s, r) => s + Number(r.storeRating || 0), 0) / ratingCount : 0;
  const latest = useMemo(() => (ratings || []).filter((r) => r.storeComment).slice(0, 2), [ratings]);
  const activeOrders = (orders || []).filter((o: any) => o?.status === 'pago').length;

  const plan = Number(store?.plan || 1);
  const custom = store?.customCommissionRate != null ? Number(store.customCommissionRate) : null;
  const planCommission = config ? Number(config[`commissionPlan${plan}`]) : null;
  const commission = custom ?? planCommission;

  const paused = isPaused(pausedUntil);
  const st = store ? openStatus(store) : null;

  // Capa: todos os planos. Banner da Home (featured): só Premium; quem decide é o servidor.
  const pickImage = (type: 'cover' | 'featured') => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !storeId) return;
    if (file.size > MAX_IMAGE_BYTES) { showToast('A imagem pode ter até 5 MB.', 'error'); return; }
    const setBusy = type === 'cover' ? setCoverBusy : setFeaturedBusy;
    setBusy(true);
    try {
      await uploadStoreImage(storeId, type, file);
      showToast(type === 'cover' ? 'Capa atualizada' : 'Banner da Home atualizado', 'success');
      refresh();
    } catch (err) {
      showToast(apiErrorMessage(err, type === 'cover'
        ? 'Não foi possível enviar a capa. Tente de novo.'
        : 'Não foi possível enviar o banner. Tente de novo.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (!storeId) return;
    setResuming(true);
    try {
      await resumeStore(storeId);
      setPausedUntil(null);
      refresh();
      showToast('Loja reaberta', 'success');
    } catch (err) {
      showToast(apiErrorMessage(err, 'Não foi possível reabrir agora. Tente de novo.'), 'error');
    } finally {
      setResuming(false);
    }
  };

  const go = (path: string) => () => router.push(path);

  if (!store) {
    return (
      <ProtectedRoute required_role="lojista">
        <SellerShell title="Loja">
          <div className={blocks.body}>
            <Skeleton height={180} radius="var(--radius-lg)" />
            <Skeleton height={96} radius="var(--radius-lg)" />
            <Skeleton height={240} radius="var(--radius-lg)" />
          </div>
        </SellerShell>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell
        title={store.name || 'Loja'}
        actions={<a className={blocks.link} href={`/loja/${store.slug || store._id}`}>Ver como cliente</a>}
      >
        <div className={blocks.body}>
          <section className={blocks.blk} aria-label="Cara da loja">
            <div className={blocks.head}>
              <h2 className={blocks.headTitle}>Cara da loja</h2>
              <span className={blocks.meta}>é o que o cliente vê</span>
            </div>
            <div className={styles.cover}>
              {store.coverBannerUrl
                ? <img src={imageUrl(store.coverBannerUrl)} alt="Capa da loja" />
                : <span className={blocks.meta}>Sem capa ainda</span>}
            </div>
            <div className={styles.identity}>
              <span className={styles.logo} aria-hidden="true">
                {store.logoUrl ? <img src={imageUrl(store.logoUrl)} alt="" /> : initials(store.name)}
              </span>
              <span className={blocks.tx}>
                <b>{store.name}</b>
                <span>{store.tagline || 'Sem frase ainda'}</span>
              </span>
            </div>
            <div className={blocks.actions}>
              <label className={blocks.fileBtn}>
                <Camera size={16} aria-hidden="true" /> {coverBusy ? 'Enviando…' : 'Trocar capa'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className={blocks.hiddenInput} aria-label="Escolher a capa da loja" disabled={coverBusy} onChange={pickImage('cover')} />
              </label>
              <Button size="sm" variant="secondary" leftIcon={<Pencil size={16} />} onClick={() => setIdentityOpen(true)}>Frase e logo</Button>
            </div>
            <span className={blocks.meta}>Capa 1200 × 400 · logo quadrado · até 5 MB</span>
            {plan === 3 && (
              <div className={blocks.actions}>
                <label className={blocks.fileBtn}>
                  <ImageIcon size={16} aria-hidden="true" /> {featuredBusy ? 'Enviando…' : 'Banner da Home'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className={blocks.hiddenInput} aria-label="Escolher o banner da Home" disabled={featuredBusy} onChange={pickImage('featured')} />
                </label>
                <span className={blocks.meta}>Destaque na Home do app · Premium</span>
              </div>
            )}
          </section>

          <div className={[blocks.blk, blocks.blkRow].join(' ')}>
            <span className={[blocks.ico, paused ? blocks.icoWarn : st?.open ? blocks.icoOk : ''].filter(Boolean).join(' ')} aria-hidden="true"><Store size={20} /></span>
            <span className={blocks.tx}>
              <b>{paused ? pausedUntilLabel(pausedUntil as string) : st?.open ? 'Aberta agora' : 'Fechada agora'}</b>
              <span>{paused ? 'Reabre sozinha nesse horário' : 'Pausa rápida num aperto, com hora de volta'}</span>
            </span>
            {paused
              ? <Button size="sm" variant="secondary" loading={resuming} onClick={resume}>Reabrir agora</Button>
              : <Button size="sm" variant="secondary" leftIcon={<CirclePause size={16} />} onClick={() => setPauseOpen(true)}>Pausar</Button>}
          </div>

          <div className={blocks.kpis}>
            <div className={blocks.kpi}>
              <small>Avaliação</small>
              {ratingsFailed ? (
                <button type="button" className={blocks.link} onClick={loadRatings}>Tentar de novo</button>
              ) : ratings == null ? (
                <Skeleton height={24} width={80} />
              ) : (
                <>
                  <b>{ratingCount ? `★ ${formatRating(ratingAvg)}` : '—'}</b>
                  <em>{ratingCount === 1 ? '1 avaliação' : `${ratingCount} avaliações`}</em>
                </>
              )}
            </div>
            <div className={blocks.kpi}>
              <small>Cancelamentos (30 dias)</small>
              {overviewFailed ? (
                <button type="button" className={blocks.link} onClick={loadOverview}>Tentar de novo</button>
              ) : !overview ? (
                <Skeleton height={24} width={80} />
              ) : (
                <>
                  <b>{pct(overview.current.cancellationRate)}</b>
                  {overview.platformCancellationRate == null ? (
                    <em>últimos 30 dias</em>
                  ) : overview.current.cancellationRate <= overview.platformCancellationRate ? (
                    <em className={blocks.ok}>abaixo da média do DROP</em>
                  ) : (
                    <em className={blocks.warn}>acima da média do DROP</em>
                  )}
                </>
              )}
            </div>
          </div>

          <section className={blocks.blk} aria-label="O que dizem">
            <div className={blocks.head}>
              <h2 className={blocks.headTitle}>O que dizem</h2>
              <button type="button" className={blocks.link} onClick={go('/seller/avaliacoes')}>Ver todas</button>
            </div>
            {ratings && ratings.length === 0 && <p className={blocks.meta}>Suas primeiras avaliações aparecem aqui depois das entregas.</p>}
            {latest.map((r) => (
              <p key={r.orderId || r.createdAt} className={styles.quote}>
                <Star size={14} aria-hidden="true" className={styles.star} /> <b>{r.storeRating}</b> · “{r.storeComment}”
              </p>
            ))}
          </section>

          {!direto && (
            <section className={blocks.blk} aria-label="Plano">
              <div className={blocks.head}>
                <h2 className={blocks.headTitle}>{`Plano ${plan} · ${PLAN_NAME[plan] || 'Vitrine'}`}</h2>
                <span className={[blocks.tag, blocks.tagOk].join(' ')}>ativo</span>
              </div>
              {commission != null && (
                <p className={blocks.sub}>{`Comissão de ${commission}% por venda${custom != null ? ' · condição especial' : ''}`}</p>
              )}
            </section>
          )}

          <PushEnableBanner title="Avisos de pedido novo" description="Som e aviso no celular, mesmo com o app fechado." />

          <section aria-label="Sua loja" className={blocks.stack}>
            <h2 className={blocks.cap}>Sua loja</h2>
            <ul className={blocks.list}>
              <NavRow icon={<Clock size={20} />} label="Horários" sub={summarizeHours(store.operatingHours)} onClick={go('/seller/horarios')} />
              <NavRow icon={<Bell size={20} />} label="Notificações" sub="Pedidos, dinheiro e avisos do DROP" onClick={go('/seller/notificacoes')} />
              <NavRow icon={<QrCode size={20} />} label="QR code da loja" sub="Imprima para o balcão" onClick={() => setQrOpen(true)} />
              <NavRow icon={<ListChecks size={20} />} label="Cadastro e verificação" sub="Dados, documentos e etapas" onClick={go('/seller/abrir')} />
            </ul>
          </section>

          <section aria-label="Crescer" className={blocks.stack}>
            <h2 className={blocks.cap}>Crescer</h2>
            <ul className={blocks.list}>
              <NavRow icon={<ChartColumn size={20} />} label="Desempenho" sub="Vendas, picos e mais vendidos" onClick={go('/seller/analytics')} />
              <NavRow icon={<Star size={20} />} label="Avaliações" sub="Leia e responda os clientes" onClick={go('/seller/avaliacoes')} />
              <NavRow icon={<Ticket size={20} />} label="Cupons" sub="Crie e acompanhe" onClick={go('/seller/coupons')} />
              <NavRow icon={<Plug size={20} />} label="Integrações" sub="API, webhook e planilha" onClick={go('/seller/integrations')} />
            </ul>
          </section>

          <section aria-label="Conta e plano" className={blocks.stack}>
            <h2 className={blocks.cap}>Conta e plano</h2>
            <ul className={blocks.list}>
              {direto ? (
                <>
                  <NavRow icon={<Receipt size={20} />} label="Assinatura" sub="Mensalidade e faturas" onClick={go('/seller/assinatura')} />
                  <NavRow icon={<KeyRound size={20} />} label="Conta Asaas" sub="Termo, chave e ajustes" onClick={go('/seller/conta-asaas')} />
                </>
              ) : (
                <NavRow icon={<Wallet size={20} />} label="Plano e comissão" sub="Compare e peça troca" onClick={go('/seller/plano')} />
              )}
            </ul>
          </section>

          {otherAreas.length > 0 && (
            <section aria-label="Suas áreas" className={blocks.stack}>
              <h2 className={blocks.cap}>Suas áreas</h2>
              <ul className={blocks.list}>
                {otherAreas.map((a) => (
                  <Fragment key={a.role}>
                    <NavRow icon={<Icon name={a.icon} size={20} />} label={a.label} sub={a.description} onClick={() => goToArea(a.role)} />
                  </Fragment>
                ))}
              </ul>
            </section>
          )}

          <button type="button" className={styles.logout} onClick={() => logout?.()}>
            <LogOut size={20} aria-hidden="true" /> Sair
          </button>
        </div>

        <PauseSheet open={pauseOpen} onClose={() => setPauseOpen(false)} storeId={storeId} activeOrders={activeOrders} onChanged={(u) => { setPausedUntil(u); refresh(); }} />
        <IdentitySheet open={identityOpen} onClose={() => setIdentityOpen(false)} storeId={storeId} logoUrl={store.logoUrl} tagline={store.tagline} storeName={store.name} onSaved={refresh} />
        <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title="QR code da loja" presentation="bottom">
          <StoreQRCode storeRef={String(store.slug || store._id)} storeName={store.name} />
        </Sheet>
      </SellerShell>
    </ProtectedRoute>
  );
}
