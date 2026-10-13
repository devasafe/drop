// Agora enquanto a loja não está aprovada (protótipo, tela 13 "Em análise"): o que falta no
// cadastro, com atalho para /seller/abrir, e o que dá para preparar enquanto isso.
import { Clock, Package } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ProgressBar } from '../../ui/ProgressBar';
import { NavRow } from '../ui/NavRow';
import { STEP_ICON_CLASS, stepStateIcon, stepSubText } from '../abrir/stepView';
import { summarizeHours } from '../../../lib/sellerHours';
import type { StoreOnboarding } from '../../../lib/storeOnboarding';
import blocks from '../ui/SellerBlocks.module.css';

export const ABRIR_ROUTE = '/seller/abrir';

/** Selo do topo: "em análise" só quando tudo já foi enviado; antes disso, "pendente" (curto para caber ao lado do nome). */
export function analiseTag(data: StoreOnboarding) {
  return data.allSubmitted ? 'em análise' : 'pendente';
}

export function AgoraAnalise({ data, onGo }: { data: StoreOnboarding; onGo: (path: string) => void }) {
  const total = data.steps.length;
  const done = data.steps.filter((s) => s.state === 'done').length;
  const left = total - done;
  const goAbrir = () => onGo(ABRIR_ROUTE);
  return (
    <>
      <section className={[blocks.blk, blocks.blkBrand].join(' ')} aria-label="Cadastro da loja">
        <h2 className={blocks.headTitle}>{data.allSubmitted ? 'Quase lá' : 'Termine o cadastro'}</h2>
        <p className={blocks.sub}>
          {data.allSubmitted
            ? 'O DROP confere seus documentos em até 1 dia útil.'
            : `Sua loja recebe pedidos depois de aprovada. ${left === 1 ? 'Falta 1 etapa.' : `Faltam ${left} etapas.`}`}
        </p>
        <ProgressBar value={done} max={total} label="Etapas aprovadas" valueText={`${done} de ${total}`} />
      </section>
      <ul className={blocks.list} aria-label="Etapas do cadastro">
        {data.steps.map((s, i) => (
          <NavRow
            key={s.key}
            icon={stepStateIcon(s.state, i)}
            iconClassName={STEP_ICON_CLASS[s.state]}
            label={s.label}
            sub={stepSubText(s)}
            current={data.current?.key === s.key}
            onClick={goAbrir}
          />
        ))}
      </ul>
      <div className={blocks.bar}>
        <Button onClick={goAbrir}>{data.current && !data.allSubmitted ? `Continuar: ${data.current.label}` : 'Ver cadastro'}</Button>
      </div>
      <section className={blocks.stack} aria-labelledby="agora-enquanto">
        <h2 id="agora-enquanto" className={blocks.cap}>Enquanto isso</h2>
        <ul className={blocks.list}>
          <NavRow
            icon={<Package size={20} />}
            iconClassName={blocks.icoBrand}
            label="Cadastre seus produtos"
            sub={`${data.productsCount} cadastrados · aparecem quando a loja for aprovada`}
            onClick={() => onGo('/seller/create-product')}
          />
          <NavRow icon={<Clock size={20} />} label="Defina seus horários" sub={summarizeHours(data.store?.operatingHours)} onClick={() => onGo('/seller/horarios')} />
        </ul>
      </section>
      <p className={blocks.meta}>Avisamos por e-mail e notificação quando a loja for aprovada.</p>
    </>
  );
}
