import { LogOut } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import MeusDadosForm from '../../components/MeusDadosForm';
import VerificationHub from '../../components/VerificationHub';
import { Button } from '../../components/ui/Button';
import { DeleteAccountSection } from '../../components/drop/DeleteAccountSection';
import { useAuth } from '../../contexts/AuthContext';
import { SELLER_ROUTES } from '../../lib/sellerRoutes';
import styles from './Perfil.module.css';

/** Perfil do dono da loja no visual do painel: dados pessoais, verificações e sair. Os dados da loja ficam na aba Loja. */
export default function SellerPerfil() {
  const { user, logout } = useAuth() || {};
  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Meu perfil" back={SELLER_ROUTES.loja}>
        <div className={styles.stack}>
          {user && (
            <div className={styles.who}>
              <h2 className={styles.name}>{user.name}</h2>
              <p className={styles.email}>{user.email}</p>
            </div>
          )}
          <section aria-labelledby="perfil-dados">
            <h2 id="perfil-dados" className={styles.cap}>Meus dados</h2>
            <div className={styles.card}><MeusDadosForm showStore={false} /></div>
          </section>
          <section aria-labelledby="perfil-seguranca">
            <h2 id="perfil-seguranca" className={styles.cap}>Verificações e segurança</h2>
            <div className={styles.card}><VerificationHub /></div>
          </section>
          <DeleteAccountSection note="Apagamos seus dados pessoais e você não entra mais com esta conta. A loja sai da vitrine; notas, pedidos e o CNPJ ficam guardados 5 anos por lei." />
          <Button variant="secondary" leftIcon={<LogOut size={18} aria-hidden="true" />} onClick={() => logout?.()}>Sair</Button>
        </div>
      </SellerShell>
    </ProtectedRoute>
  );
}
