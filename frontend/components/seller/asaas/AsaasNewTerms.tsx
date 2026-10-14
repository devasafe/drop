// frontend/components/seller/asaas/AsaasNewTerms.tsx
import { useState } from 'react';
import { FileText } from 'lucide-react';
import api from '../../../lib/api';
import { apiErrorMessage } from '../../../lib/sellerApi';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Skeleton } from '../../ui/Skeleton';
import { useToast } from '../../ui/Toast';
import { TERMS_OUTDATED_MSG, fmtDateTime, isTermsOutdated, type AsaasStatus } from './asaasShared';
import type { AsaasTerms } from './useAsaasTerms';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './ContaAsaas.module.css';

interface Props {
  apiBase: string;
  terms: AsaasTerms;
  status: AsaasStatus;
  /** true = sem aceite válido: os pedidos Pix da loja estão bloqueados. */
  blocking: boolean;
  onStatus: (status: AsaasStatus | null) => void;
}

export function AsaasNewTerms({ apiBase, terms, status, blocking, onStatus }: Props) {
  const { showToast } = useToast();
  // O aceite guarda a versão que a pessoa marcou: se a versão exibida mudar, deixa de valer.
  const [acceptedVersion, setAcceptedVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = terms.state === 'ok';
  const accepted = ready && acceptedVersion === terms.version;
  const prev = status.consent;

  const accept = async () => {
    if (!accepted || !ready || busy) return;
    setBusy(true);
    try {
      const r = await api.post(`${apiBase}/consent`, { acceptTerms: true, termsVersion: terms.version });
      setAcceptedVersion(null);
      showToast('Termo aceito.', 'success');
      onStatus(r.data?.data ?? null);
    } catch (e) {
      if (isTermsOutdated(e)) {
        setAcceptedVersion(null);
        showToast(TERMS_OUTDATED_MSG, 'error');
        terms.reload();
      } else {
        showToast(apiErrorMessage(e, 'Não foi possível registrar o aceite.'), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={blocks.stack} aria-label="Novo termo">
      {blocking ? (
        <Alert tone="error" title="Pedidos por Pix pausados">
          A sua loja não recebe pedidos novos. Aceite o termo para voltar a vender.
        </Alert>
      ) : (
        <Alert tone="warning" title="O termo foi atualizado">
          Aceite a nova versão para manter o registro em dia. A loja segue vendendo.
        </Alert>
      )}

      <div className={blocks.blk}>
        <div className={blocks.head}>
          <h2 className={blocks.headTitle}>O que mudou</h2>
          {ready && <span className={blocks.meta}>{prev?.version ? `${prev.version} → ${terms.version}` : `versão ${terms.version}`}</span>}
        </div>
        {ready && terms.changes.length > 0 && (
          <ul className={styles.changes}>
            {terms.changes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        )}
        {ready && terms.changes.length === 0 && <p className={blocks.meta}>Leia o termo abaixo para ver a versão nova.</p>}
        {ready && (
          <div className={styles.terms} tabIndex={0} aria-label="Texto do termo">
            <pre className={styles.termsText}>{terms.text}</pre>
          </div>
        )}
        {terms.state === 'loading' && <Skeleton height={120} />}
        {terms.state === 'error' && (
          <Alert tone="error" title="Não foi possível carregar o termo." action={{ label: 'Tentar de novo', onClick: () => { terms.reload(); } }}>
            Sem o texto na tela, o aceite fica desligado.
          </Alert>
        )}
        <Checkbox label="Li e aceito o termo" checked={accepted} disabled={!ready} onChange={(on) => setAcceptedVersion(on ? terms.version : null)} />
      </div>

      {prev && (
        <ul className={blocks.list}>
          <li className={blocks.row}>
            <span className={blocks.ico} aria-hidden="true"><FileText size={18} /></span>
            <span className={blocks.tx}>
              <b>Versão anterior</b>
              <span>{`Aceita em ${fmtDateTime(prev.acceptedAt)}`}</span>
            </span>
          </li>
        </ul>
      )}

      <Button loading={busy} disabled={!accepted || !ready} onClick={accept}>Aceitar o termo</Button>
    </section>
  );
}

export default AsaasNewTerms;
