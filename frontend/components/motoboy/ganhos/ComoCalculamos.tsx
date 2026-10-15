import { useRouter } from 'next/router';
import { KeyRound, ListChecks, Wallet } from 'lucide-react';
import { Alert } from '../../ui/Alert';
import { Skeleton } from '../../ui/Skeleton';
import { NavRow } from '../../panel/NavRow';
import { useMotoboyRules } from '../../../hooks/useMotoboyRules';
import { useSaasConfig } from '../../../hooks/useSaasConfig';
import { exampleRide } from '../../../lib/motoboyRules';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import { formatMoney } from '../../../lib/money';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './ComoCalculamos.module.css';

const EXAMPLE_KM = 3.4;
const pct = (n: number) => String(n).replace('.', ',');

/** "Como calculamos seus ganhos" (protótipo 23): o conteúdo de ajuda-ganhos com os números do PlatformConfig. */
export function ComoCalculamos() {
  const router = useRouter();
  const { rules, loading, failed, retry } = useMotoboyRules();
  const saas = useSaasConfig();
  const modeKnown = !saas.loading && !saas.error;
  const direto = saas.settlementMode === 'direto';
  // A taxa e o extra por km não dependem do modo; só a parte do motoboy (K6): sem modo conhecido ou sem
  // percentual do direto na config, não há número de "Você fica com" (nem 80% presumido).
  const ex = rules ? exampleRide(rules, EXAMPLE_KM) : null;
  const share = rules && modeKnown ? exampleRide(rules, EXAMPLE_KM, direto ? 'direto' : 'custodia') : null;

  const path = direto
    ? [
      { t: 'Você entrega', s: 'o cliente confirma com o código' },
      { t: 'A loja envia o Pix', s: 'pela conta dela, logo depois da entrega' },
      { t: 'Na sua chave', s: 'o Pix vem direto da loja para você' },
    ]
    : [
      { t: 'Você entrega', s: 'o valor entra como “a liberar”' },
      rules?.autoApprovePayouts
        ? { t: 'Libera logo depois da entrega', s: 'pode ficar bloqueado se houver reclamação' }
        : { t: 'A equipe libera', s: 'pode ficar bloqueado se houver reclamação' },
      { t: 'Disponível', s: rules ? `a partir de ${formatMoney(rules.minimumWithdraw)} você saca` : 'você saca o que estiver disponível' },
      { t: 'Pix na sua chave', s: rules?.autoApproveWithdrawals ? 'sai sem esperar aprovação' : 'cai depois da aprovação do saque' },
    ];

  return (
    <div className={styles.stack}>
      {loading && !rules && <div role="status" aria-label="Carregando"><Skeleton height={160} /></div>}
      {failed && (
        <Alert tone="warning" title="Não carregamos os valores de agora" action={{ label: 'Tentar de novo', onClick: retry }}>
          O jeito de calcular está abaixo; os números aparecem quando carregar.
        </Alert>
      )}
      {rules && ex && (
        <section className={[blocks.blk, blocks.blkBrand].join(' ')} aria-label="A conta de cada corrida">
          <span className={blocks.cap}>A conta de cada corrida</span>
          <div className={blocks.sum}>
            <div><span>Base por entrega</span><span>{formatMoney(rules.basePerDelivery)}</span></div>
            <div><span>{`+ ${formatMoney(rules.perKm)} por km · exemplo de ${pct(EXAMPLE_KM)} km`}</span><span>{formatMoney(ex.extra)}</span></div>
            <div><span>Taxa que o cliente paga</span><span>{formatMoney(ex.fee)}</span></div>
            {share && (
              <div className={styles.total}><span>{`Você fica com ${pct(share.sharePercent)}%`}</span><span>{formatMoney(share.mine)}</span></div>
            )}
          </div>
          {modeKnown && direto && !share && (
            <p className={blocks.sub}>No repasse direto, sua parte da taxa não tem um valor fixo nesta tela. O valor de cada corrida aparece no detalhe dela.</p>
          )}
          <p className={blocks.sub}>Exemplo ilustrativo: o valor real de cada corrida pode ser diferente.</p>
        </section>
      )}

      {modeKnown && (
        <section className={styles.stack} aria-label="O caminho do dinheiro">
          <h2 className={blocks.headTitle}>O caminho do dinheiro</h2>
          <div className={blocks.blk}>
            <ol className={styles.tl}>
              {path.map((p) => (
                <li key={p.t}><b>{p.t}</b><small>{p.s}</small></li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {modeKnown && !direto && (
        <section className={styles.stack} aria-label="Como sacar">
          <h2 className={blocks.headTitle}>Como sacar</h2>
          <ul className={blocks.list}>
            <NavRow
              icon={<KeyRound size={18} />}
              label="Cadastre sua chave Pix"
              sub="Em Dados de recebimento. O saque cai sempre na chave cadastrada; sem ela, não dá para sacar."
              onClick={() => router.push(MOTOBOY_ROUTES.recebimento)}
            />
            <li className={blocks.row}>
              <span className={blocks.ico} aria-hidden="true"><Wallet size={18} /></span>
              <span className={blocks.tx}>
                <b>Você escolhe o valor</b>
                <span>Pode sacar tudo o que está disponível ou uma parte. O limite diário do Pix costuma ser R$ 8.000: para valores maiores, saque em partes.</span>
              </span>
            </li>
            <li className={blocks.row}>
              <span className={blocks.ico} aria-hidden="true"><ListChecks size={18} /></span>
              <span className={blocks.tx}>
                <b>Acompanhe em Ganhos</b>
                <span>Cada corrida e cada saque aparece com a situação: a liberar, liberado, saque pedido ou sacado.</span>
              </span>
            </li>
          </ul>
        </section>
      )}

      <section className={styles.stack} aria-label="Quando algo dá errado">
        <h2 className={blocks.headTitle}>Quando algo dá errado</h2>
        <ul className={blocks.list}>
          <li className={blocks.row}>
            <span className={[blocks.ico, blocks.icoOk].join(' ')} aria-hidden="true">1</span>
            <span className={blocks.tx}>
              <b>Cliente ausente</b>
              <span>{rules ? `Espere ${rules.customerAbsentWaitMin} min a partir da retirada e encerre como ausente. O valor aparece no detalhe da corrida.` : 'Espere o tempo mínimo a partir da retirada e encerre como ausente. O valor aparece no detalhe da corrida.'}</span>
            </span>
          </li>
          <li className={blocks.row}>
            <span className={[blocks.ico, blocks.icoWarn].join(' ')} aria-hidden="true">2</span>
            <span className={blocks.tx}>
              <b>Cancelamento depois do aceite</b>
              <span>{rules ? `Você fica com ${pct(rules.lateCancellationMotoboyShare)}% da taxa de cancelamento.` : 'Você fica com uma parte da taxa de cancelamento.'}</span>
            </span>
          </li>
          <li className={blocks.row}>
            <span className={blocks.ico} aria-hidden="true">3</span>
            <span className={blocks.tx}>
              <b>Reclamação</b>
              <span>O valor fica bloqueado até a análise da equipe.</span>
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}

export default ComoCalculamos;
