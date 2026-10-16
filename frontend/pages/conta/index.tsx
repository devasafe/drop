// pages/conta/index.tsx
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Bell, ChevronRight, HelpCircle, LogOut, MapPin, ShieldCheck, User, Wallet, Lock, Check } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { PersonalData } from '../../components/drop/PersonalData';
import { IdentityCheck } from '../../components/drop/IdentityCheck';
import AddressManager from '../../components/AddressManager';
import { Avatar } from '../../components/ui/Avatar';
import { Alert } from '../../components/ui/Alert';
import { useAuth } from '../../contexts/AuthContext';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import { useCustodyLeftover } from '../../hooks/useCustodyLeftover';
import api from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { getNavItems, ROLE_AREAS, ROLE_HOME } from '../../lib/navConfig';
import Icon from '../../components/Icon';
import { TEAM_AREA, teamRoleToOffer, enterTeamPanel } from '../../lib/teamPanel';
import { ScreenHeader } from '../../components/drop/ScreenHeader';
import { useAddresses } from '../../hooks/useSync';
import { ROUTES, safeNext, type ContaSecao } from '../../lib/routes';
import styles from './Conta.module.css';

const SECOES: ContaSecao[] = ['dados', 'verificacao', 'enderecos'];
const TITULO: Record<ContaSecao, string> = { dados: 'Dados pessoais', verificacao: 'Verificações e segurança', enderecos: 'Endereços' };

export default function ContaPage() {
  const router = useRouter();
  const { user, logout, switchRole } = useAuth() || ({} as any);
  const { settlementMode } = useSaasConfig();
  const custodyLeftover = useCustodyLeftover();
  const custodia = settlementMode !== 'direto';
  const [secao, setSecao] = useState<ContaSecao | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [debt, setDebt] = useState<{ amount: number; createdAt?: string } | null>(null);
  const { addresses } = useAddresses();
  const addressLabels = (addresses || []).map((a: any) => a.label).filter(Boolean).slice(0, 3).join(' · ');
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const s = router.query.secao;
    if (typeof s === 'string' && (SECOES as string[]).includes(s)) setSecao(s as ContaSecao);
  }, [router.query.secao]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    if (custodia) api.get('/wallets/my-wallet').then((r) => { if (!cancelled) setBalance(Number(r.data?.balance) || 0); }).catch(() => {});
    api.get('/debts/my-pending').then((r) => { if (!cancelled) setDebt(r.data?.debt ? { amount: Number(r.data.debt.amount), createdAt: r.data.debt.createdAt } : null); }).catch(() => {});
    api.get('/verification/me').then((r) => {
      if (cancelled) return;
      const v = r.data?.verification;
      setVerified(v?.email?.status === 'verified' && v?.document?.status === 'approved');
    }).catch(() => { if (!cancelled) setVerified(null); });
    return () => { cancelled = true; };
  }, [user, custodia]);

  // A regra P16 (Carteira só na custódia; "Saldo do modo anterior" no direto com saldo) vem do navConfig.
  const walletRows = useMemo(() => getNavItems('cliente', () => true, false, { settlementMode, custodyLeftover })
    .filter((i) => i.placement.includes('account')), [settlementMode, custodyLeftover]);

  // Conta com vários perfis: no celular a Nav antiga (AccountMenu) não aparece nas telas do
  // cliente, então a troca de área mora aqui. O backend decide; se recusar, não navega.
  const activeRole = user?.activeRole || user?.role || 'cliente';
  const roles: string[] = user?.roles || (user?.role ? [user.role] : []);
  const otherAreas = roles.length > 1 ? ROLE_AREAS.filter((a) => roles.includes(a.role) && a.role !== activeRole) : [];
  const goToArea = async (role: string) => {
    try { await switchRole(role); } catch { return; }
    router.push(ROLE_HOME[role as keyof typeof ROLE_HOME]);
  };
  // Equipe (marketing/gerentes) como Cliente: "Painel da equipe" leva à primeira página do painel que o papel abre.
  const teamRole = teamRoleToOffer(roles, activeRole);
  const goToTeamPanel = async (role: string) => {
    let href: string | null;
    try { href = await enterTeamPanel(role, switchRole); } catch { return; }
    if (href) router.push(href);
  };

  const row = (label: string, icon: JSX.Element, onClick: () => void, meta?: string, sub?: string) => (
    <button type="button" className={styles.row} onClick={onClick}>
      <span className={styles.rowIcon} aria-hidden="true">{icon}</span>
      <span className={styles.rowLabel}>{label}{sub && <span className={styles.rowSub}>{sub}</span>}</span>
      {meta && <span className={styles.rowMeta}>{meta}</span>}
      <ChevronRight size={18} aria-hidden="true" className={styles.chevron} />
    </button>
  );

  return (
    <ProtectedRoute required_role="cliente">
      <main className={styles.page}>
        <div className={[styles.index, secao && styles.hiddenMobile].filter(Boolean).join(' ')}>
          <ScreenHeader title="Conta" />
          <div className={[styles.person, styles.personCard].join(' ')}>
            <Avatar name={user?.name || 'Você'} src={user?.photo} size="lg" />
            <div>
              <p className={styles.name}>{user?.name}</p>
              <p className={styles.email}>{user?.email}</p>
              {verified === true && <span className={styles.verified}><Check size={14} aria-hidden="true" /> Conta verificada</span>}
            </div>
          </div>

          {custodia && balance != null && (
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Saldo na carteira</span>
              <b className={styles.kpiValue}>{formatMoney(balance)}</b>
              <span className={styles.kpiHint}>usa sozinho na sacola</span>
            </div>
          )}

          {debt != null && debt.amount > 0 && (
            <Alert tone="warning" title={`Taxa pendente de ${formatMoney(debt.amount)}`}>
              {`De um cancelamento tardio${debt.createdAt ? ` em ${new Date(debt.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}. Entra na próxima compra.`}
            </Alert>
          )}
          {verified === false && (
            <Alert tone="info" title="Confirme seus dados para comprar" action={{ label: 'Verificar agora', onClick: () => setSecao('verificacao') }}>
              Pedimos e-mail e documento uma vez só.
            </Alert>
          )}

          <section className={styles.group} aria-label="Compras">
            <h2 className={styles.groupTitle}>Compras</h2>
            {row('Endereços', <MapPin size={20} />, () => setSecao('enderecos'), undefined, addressLabels || undefined)}
            {walletRows.map((i) => row(i.label, <Wallet size={20} />, () => router.push(i.route), i.label === 'Carteira' && balance != null ? formatMoney(balance) : undefined))}
          </section>
          <section className={styles.group} aria-label="Conta">
            <h2 className={styles.groupTitle}>Conta</h2>
            {row('Dados pessoais', <User size={20} />, () => setSecao('dados'))}
            {row('Verificações e segurança', <ShieldCheck size={20} />, () => setSecao('verificacao'))}
          </section>
          {(otherAreas.length > 0 || teamRole) && (
            <section className={styles.group} aria-label="Suas áreas">
              <h2 className={styles.groupTitle}>Suas áreas</h2>
              {otherAreas.map((a) => (
                <Fragment key={a.role}>{row(a.label, <Icon name={a.icon} size={20} />, () => goToArea(a.role), undefined, a.description)}</Fragment>
              ))}
              {teamRole && row(TEAM_AREA.label, <Icon name={TEAM_AREA.icon} size={20} />, () => goToTeamPanel(teamRole), undefined, TEAM_AREA.description)}
            </section>
          )}
          <section className={styles.group} aria-label="App">
            <h2 className={styles.groupTitle}>App</h2>
            {row('Notificações', <Bell size={20} />, () => router.push(ROUTES.notificacoes))}
            {row('Ajuda e suporte', <HelpCircle size={20} />, () => router.push(ROUTES.ajuda))}
            {row('Privacidade e dados', <Lock size={20} />, () => router.push(ROUTES.privacidadeConta))}
          </section>
          <button type="button" className={styles.logout} onClick={() => logout?.()}><LogOut size={20} aria-hidden="true" /> Sair</button>
        </div>

        {secao && (
          <section className={styles.detail} aria-label={TITULO[secao]}>
            <button type="button" className={styles.back} onClick={() => setSecao(null)}>Voltar para Conta</button>
            <h1 className={styles.detailTitle}>{TITULO[secao]}</h1>
            {secao === 'dados' && <PersonalData />}
            {secao === 'verificacao' && (
              <IdentityCheck emailResult={router.query.email === 'ok' || router.query.email === 'erro' ? router.query.email : null} onDone={() => { const n = safeNext(router.query.next); if (n) router.push(n); else setSecao(null); }} />
            )}
            {secao === 'enderecos' && <AddressManager />}
          </section>
        )}
      </main>
    </ProtectedRoute>
  );
}
