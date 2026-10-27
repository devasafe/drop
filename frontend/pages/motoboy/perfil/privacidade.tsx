import Link from 'next/link';
import ProtectedRoute from '../../../components/ProtectedRoute';
import MotoboyShell from '../../../components/motoboy/panel/MotoboyShell';
import { DeleteAccountSection } from '../../../components/drop/DeleteAccountSection';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import styles from './Privacidade.module.css';

/** Privacidade do motoboy: links da política e exclusão da conta (exigência das lojas de apps). */
export default function MotoboyPerfilPrivacidade() {
  return (
    <ProtectedRoute required_role="motoboy">
      <MotoboyShell title="Privacidade" back={MOTOBOY_ROUTES.perfil}>
        <div className={styles.stack}>
          <p className={styles.lead}>
            Seus direitos pela LGPD. Para pedir uma cópia dos seus dados ou corrigir algo, veja o{' '}
            <Link href="/privacidade/solicitacoes">canal do titular</Link>.
          </p>
          <DeleteAccountSection note="Apagamos seus dados pessoais e você não entra mais com esta conta. Corridas, notas e repasses ficam guardados 5 anos por lei, sem o seu nome." />
          <p className={styles.links}>
            <Link href="/privacidade">Política de Privacidade</Link> · <Link href="/termos">Termos de Uso</Link>
          </p>
        </div>
      </MotoboyShell>
    </ProtectedRoute>
  );
}
