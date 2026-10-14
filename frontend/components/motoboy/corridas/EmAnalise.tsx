import { useRouter } from 'next/router';
import { Calculator, Hourglass, KeyRound, ClipboardList } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';
import { Button } from '../../ui/Button';
import { NavRow } from '../../panel/NavRow';
import blocks from '../../panel/PanelBlocks.module.css';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import styles from './Corridas.module.css';

/**
 * Cadastro ainda não aprovado: substitui o "Ficar online" (protótipo "Em análise").
 * Quem decide mostrar é a tela (requiresVerification ou 403 COURIER_NOT_VERIFIED). Sem dependência de rota
 * além dos pushes: a etapa 4 do cadastro (P5.9) reaproveita este componente.
 */
export function EmAnalise({ state }: { state: 'review' | 'incomplete' }) {
  const router = useRouter();
  return (
    <div className={styles.screen}>
      {state === 'review' ? (
        <>
          <EmptyState
            icon={<Hourglass size={22} aria-hidden="true" />}
            title="Estamos conferindo seus documentos"
            description="Avisamos por notificação quando a análise terminar. Depois disso você já pode ficar online."
          />
          <section className={blocks.blk}>
            <ol className={styles.timeline}>
              <li className={styles.tlDone}><span className={styles.legDot} aria-hidden="true" /><span>Conta criada</span></li>
              <li className={styles.tlDone}><span className={styles.legDot} aria-hidden="true" /><span>Documentos enviados</span></li>
              <li className={styles.tlNow} aria-current="step"><span className={styles.legDot} aria-hidden="true" /><span>Análise da equipe</span><time>agora</time></li>
              <li className={styles.tlNext}><span className={styles.legDot} aria-hidden="true" /><span>Liberado para corridas</span></li>
            </ol>
          </section>
        </>
      ) : (
        <EmptyState
          icon={<ClipboardList size={22} aria-hidden="true" />}
          title="Falta terminar seu cadastro"
          description="Sem a verificação você não recebe corridas."
          action={<Button onClick={() => router.push(MOTOBOY_ROUTES.cadastro)}>Continuar cadastro</Button>}
        />
      )}
      <div className={blocks.head}><b className={blocks.headTitle}>Enquanto isso</b></div>
      <ul className={blocks.list}>
        <NavRow icon={<Calculator size={18} />} iconClassName={blocks.icoBrand} label="Como calculamos seus ganhos" sub="A taxa de entrega e a sua parte" onClick={() => router.push(MOTOBOY_ROUTES.comoCalculamos)} />
        <NavRow icon={<KeyRound size={18} />} iconClassName={blocks.icoOk} label="Chave Pix" sub="Onde você recebe" onClick={() => router.push(MOTOBOY_ROUTES.recebimento)} />
      </ul>
    </div>
  );
}

export default EmAnalise;
