import { useRouter } from 'next/router';
import ProtectedRoute from '../../components/ProtectedRoute';
import { HELP_FAQ } from '../../lib/helpFaq';
import { ROUTES } from '../../lib/routes';
import { ScreenHeader } from '../../components/drop/ScreenHeader';
import { HelpCenter } from '../../components/drop/HelpCenter';
import styles from './Ajuda.module.css';

export default function AjudaPage() {
  const router = useRouter();
  return (
    <ProtectedRoute required_role="cliente">
      <HelpCenter
        faq={HELP_FAQ}
        withOrders
        frame={(content, inThread) => (
          <main className={styles.page}>
            {!inThread && <ScreenHeader title="Ajuda" onBack={() => router.push(ROUTES.conta)} />}
            {content}
          </main>
        )}
      />
    </ProtectedRoute>
  );
}
