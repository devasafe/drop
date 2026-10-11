import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronRight, Download, Eye, Pencil, Settings } from 'lucide-react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveOrders } from '../../hooks/useActiveOrders';
import { privacyMailto } from '../../lib/privacyRequests';
import { formatMoney } from '../../lib/money';
import { ROUTES, contaHref } from '../../lib/routes';
import { ScreenHeader } from '../../components/drop/ScreenHeader';
import styles from './Privacidade.module.css';

export default function PrivacidadePage() {
  const router = useRouter();
  const { user } = useAuth() || ({} as any);
  const { activeOrders } = useActiveOrders();
  const [debt, setDebt] = useState<number | null>(null);
  const email = user?.email || '';
  useEffect(() => {
    api.get('/debts/my-pending').then((r) => setDebt(r.data?.debt ? Number(r.data.debt.amount) : null)).catch(() => setDebt(null));
  }, []);
  const blockers = [
    debt ? `Taxa pendente de ${formatMoney(debt)} precisa ser paga antes.` : null,
    activeOrders.length ? 'Você tem um pedido em andamento.' : null,
  ].filter(Boolean) as string[];
  const row = (href: string, icon: JSX.Element, title: string, sub: string) => (
    <a href={href} className={styles.row}>
      <span className={styles.ico} aria-hidden="true">{icon}</span>
      <span className={styles.tx}><b>{title}</b><span>{sub}</span></span>
      <ChevronRight size={18} aria-hidden="true" />
    </a>
  );

  return (
    <ProtectedRoute required_role="cliente">
      <main className={styles.page}>
        <ScreenHeader title="Privacidade" onBack={() => router.push(ROUTES.conta)} />
        <div className={styles.body}>
          <p className={styles.lead}>Seus direitos pela LGPD, sem precisar escrever o pedido. Respondemos em até 15 dias.</p>
          <div className={styles.card}>
            {row(privacyMailto('acesso', email), <Download size={18} />, 'Baixar meus dados', 'Cadastro, pedidos e endereços')}
            {row('/privacidade#compartilhamento', <Eye size={18} />, 'Com quem compartilhamos', 'Loja, motoboy, Asaas, Google Maps')}
            {row(contaHref('dados'), <Pencil size={18} />, 'Corrigir um dado', 'Vai para Dados pessoais')}
            {row('/cookies', <Settings size={18} />, 'Cookies e consentimentos', 'Escolha o que fica ligado')}
          </div>
          <section className={styles.danger} aria-labelledby="priv-excluir">
            <h2 id="priv-excluir" className={styles.dangerTitle}>Excluir minha conta</h2>
            <p className={styles.meta}>Apagamos seus dados pessoais. Notas e pedidos ficam guardados 5 anos por lei, sem o seu nome.</p>
            {blockers.length > 0
              ? blockers.map((b) => <p key={b} className={styles.blocker}>{b}</p>)
              : <a href={privacyMailto('eliminacao', email)} className={styles.dangerButton}>Pedir exclusão</a>}
          </section>
          <p className={styles.links}>
            <Link href="/privacidade">Política de Privacidade</Link> · <Link href="/termos">Termos de Uso</Link> · <Link href="/cookies">Cookies</Link>
          </p>
        </div>
      </main>
    </ProtectedRoute>
  );
}
