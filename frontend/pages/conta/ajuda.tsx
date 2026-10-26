import { createPortal } from 'react-dom';
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
        frame={(content, inThread) => (inThread
          // A conversa cobre a TabBar e o StickyCart (fixos no _app), como em /pedido/[id]/conversa.
          // Portal no body: o transform do PageTransition prenderia o position: fixed.
          ? createPortal(<main className={styles.threadPage}>{content}</main>, document.body)
          : (
            <main className={styles.page}>
              <ScreenHeader title="Ajuda" onBack={() => router.push(ROUTES.conta)} />
              {content}
            </main>
          ))}
      />
    </ProtectedRoute>
  );
}
