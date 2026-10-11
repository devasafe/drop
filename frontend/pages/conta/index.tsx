// pages/conta/index.tsx
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Bell, ChevronRight, HelpCircle, LogOut, MapPin, ShieldCheck, User, Wallet, Lock, Check } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import MeusDadosForm from '../../components/MeusDadosForm';
import VerificationHub from '../../components/VerificationHub';
import AddressManager from '../../components/AddressManager';
import { Avatar } from '../../components/ui/Avatar';
import { Alert } from '../../components/ui/Alert';
import { useAuth } from '../../contexts/AuthContext';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import { useCustodyLeftover } from '../../hooks/useCustodyLeftover';
import api from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { getNavItems } from '../../lib/navConfig';
import type { ContaSecao } from '../../lib/routes';
import styles from './Conta.module.css';

const SECOES: ContaSecao[] = ['dados', 'verificacao', 'enderecos'];
const TITULO: Record<ContaSecao, string> = { dados: 'Dados pessoais', verificacao: 'Verificações e segurança', enderecos: 'Endereços' };

export default function ContaPage() {
  const router = useRouter();
  const { user, logout } = useAuth() || ({} as any);
  const { settlementMode } = useSaasConfig();
  const custodyLeftover = useCustodyLeftover();
  const custodia = settlementMode !== 'direto';
  const [secao, setSecao] = useState<ContaSecao | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [debt, setDebt] = useState<number | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const s = router.query.secao;
    if (typeof s === 'string' && (SECOES as string[]).includes(s)) setSecao(s as ContaSecao);
  }, [router.query.secao]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    if (custodia) api.get('/wallets/my-wallet').then((r) => { if (!cancelled) setBalance(Number(r.data?.balance) || 0); }).catch(() => {});
    api.get('/debts/my-pending').then((r) => { if (!cancelled) setDebt(r.data?.debt ? Number(r.data.debt.amount) : null); }).catch(() => {});
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

  const row = (label: string, icon: JSX.Element, onClick: () => void, meta?: string) => (
    <button type="button" className={styles.row} onClick={onClick}>
      <span className={styles.rowIcon} aria-hidden="true">{icon}</span>
      <span className={styles.rowLabel}>{label}</span>
      {meta && <span className={styles.rowMeta}>{meta}</span>}
      <ChevronRight size={18} aria-hidden="true" className={styles.chevron} />
    </button>
  );

  return (
    <ProtectedRoute required_role="cliente">
      <main className={styles.page}>
        <div className={[styles.index, secao && styles.hiddenMobile].filter(Boolean).join(' ')}>
          <header className={styles.person}>
            <Avatar name={user?.name || 'Você'} src={user?.photo} size="lg" />
            <div>
              <p className={styles.name}>{user?.name}</p>
              <p className={styles.email}>{user?.email}</p>
              {verified === true && <span className={styles.verified}><Check size={14} aria-hidden="true" /> Conta verificada</span>}
            </div>
          </header>

          {debt != null && debt > 0 && (
            <Alert tone="warning" title={`Taxa pendente de ${formatMoney(debt)}`}>De um cancelamento tardio. Entra na próxima compra.</Alert>
          )}
          {verified === false && (
            <Alert tone="info" title="Confirme seus dados para comprar" action={{ label: 'Verificar agora', onClick: () => setSecao('verificacao') }}>
              Pedimos e-mail e documento uma vez só.
            </Alert>
          )}

          <section className={styles.group} aria-label="Compras">
            <h2 className={styles.groupTitle}>Compras</h2>
            {row('Endereços', <MapPin size={20} />, () => setSecao('enderecos'))}
            {walletRows.map((i) => row(i.label, <Wallet size={20} />, () => router.push(i.route), i.label === 'Carteira' && balance != null ? formatMoney(balance) : undefined))}
          </section>
          <section className={styles.group} aria-label="Conta">
            <h2 className={styles.groupTitle}>Conta</h2>
            {row('Dados pessoais', <User size={20} />, () => setSecao('dados'))}
            {row('Verificações e segurança', <ShieldCheck size={20} />, () => setSecao('verificacao'))}
          </section>
          <section className={styles.group} aria-label="App">
            <h2 className={styles.groupTitle}>App</h2>
            {row('Notificações', <Bell size={20} />, () => router.push('/notifications'))}
            {row('Ajuda e suporte', <HelpCircle size={20} />, () => router.push('/suporte'))}
            {row('Privacidade e dados', <Lock size={20} />, () => router.push('/privacidade'))}
          </section>
          <button type="button" className={styles.logout} onClick={() => logout?.()}><LogOut size={20} aria-hidden="true" /> Sair</button>
        </div>

        {secao && (
          <section className={styles.detail} aria-label={TITULO[secao]}>
            <button type="button" className={styles.back} onClick={() => setSecao(null)}>Voltar para Conta</button>
            <h1 className={styles.detailTitle}>{TITULO[secao]}</h1>
            {secao === 'dados' && <MeusDadosForm />}
            {secao === 'verificacao' && <VerificationHub />}
            {secao === 'enderecos' && <AddressManager />}
          </section>
        )}
      </main>
    </ProtectedRoute>
  );
}
