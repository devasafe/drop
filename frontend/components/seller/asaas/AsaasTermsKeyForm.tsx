// frontend/components/seller/asaas/AsaasTermsKeyForm.tsx
import { useState } from 'react';
import api from '../../../lib/api';
import { apiErrorMessage } from '../../../lib/sellerApi';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Input } from '../../ui/Input';
import { Skeleton } from '../../ui/Skeleton';
import { useToast } from '../../ui/Toast';
import { TERMS_OUTDATED_MSG, isTermsOutdated, type AsaasStatus } from './asaasShared';
import type { AsaasTerms } from './useAsaasTerms';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './ContaAsaas.module.css';

interface Props {
  /** `/stores/:id/asaas`. */
  apiBase: string;
  terms: AsaasTerms;
  /** Já existe chave (troca): o botão diz "Trocar chave". */
  connected: boolean;
  onConnected: (status: AsaasStatus | null) => void;
  onCancel?: () => void;
}

/**
 * Passos 1 e 2 da Conta Asaas: aceite do termo exibido + chave de API. A chave só vive no
 * estado enquanto o lojista digita; é apagada assim que a conexão é aceita e nunca volta do backend.
 */
export function AsaasTermsKeyForm({ apiBase, terms, connected, onConnected, onCancel }: Props) {
  const { showToast } = useToast();
  const [accepted, setAccepted] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = terms.state === 'ok';
  const canSubmit = !!apiKey && accepted && ready;
  const env = apiKey.startsWith('$aact_hmlg_') ? 'sandbox' : apiKey.startsWith('$aact_prod_') ? 'production' : null;

  const connect = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.put(apiBase, { apiKey, acceptTerms: true, termsVersion: terms.version });
      setApiKey(''); // a chave não fica em estado nem em tela
      setAccepted(false);
      showToast('Conta Asaas conectada.', 'success');
      onConnected(r.data?.data ?? null);
    } catch (e) {
      if (isTermsOutdated(e)) {
        // Termo mudou entre a leitura e o aceite: desmarca, avisa e recarrega o texto novo.
        setError(TERMS_OUTDATED_MSG);
        setAccepted(false);
        showToast(TERMS_OUTDATED_MSG, 'error');
        terms.reload();
      } else {
        setError(apiErrorMessage(e, 'Não foi possível conectar.'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={blocks.stack}>
      <section className={blocks.blk} aria-label="Termo de autorização">
        <div className={blocks.head}>
          <h2 className={blocks.headTitle}>1. Leia e aceite o termo</h2>
          {ready && <span className={blocks.meta}>{`versão ${terms.version}`}</span>}
        </div>
        {ready && (
          <div className={styles.terms} tabIndex={0} aria-label="Texto do termo">
            <p className={styles.termsTitle}>Termo de autorização de uso da conta Asaas</p>
            <pre className={styles.termsText}>{terms.text}</pre>
          </div>
        )}
        {terms.state === 'loading' && <Skeleton height={120} />}
        {terms.state === 'error' && (
          <Alert tone="error" title="Não foi possível carregar o termo." action={{ label: 'Tentar de novo', onClick: () => { terms.reload(); } }}>
            Sem o texto na tela, o aceite fica desligado.
          </Alert>
        )}
        <Checkbox label="Li e aceito o termo" checked={accepted && ready} disabled={!ready} onChange={setAccepted} />
      </section>

      <section className={blocks.blk} aria-label="Chave de API">
        <h2 className={blocks.headTitle}>2. Cole a chave de API</h2>
        <p className={blocks.sub}>No Asaas, vá em Integrações → Chaves de API → Gerar chave. Na hora de gerar:</p>
        <ol className={styles.changes} aria-label="Permissões da chave">
          <li>Deixe <b>todas as permissões</b> marcadas. É o padrão do Asaas.</li>
          <li>
            Se for escolher uma a uma, marque com <b>leitura e escrita</b>: Cobranças, Estornos de cobrança, Clientes,
            Notificações, Transferências e Webhooks. E com <b>leitura</b>: Extrato e informações financeiras e
            Informações da conta.
          </li>
          <li>Sem Transferências, a DROP não paga o motoboy nem faz o seu saque. Sem Extrato, a aba Dinheiro não mostra o extrato.</li>
        </ol>
        <form className={blocks.stack} onSubmit={(e) => { e.preventDefault(); connect(); }}>
          <Input
            type="password"
            value={apiKey}
            onChange={setApiKey}
            placeholder="Chave de API do Asaas"
            autoComplete="off"
            aria-label="Chave de API do Asaas"
            error={error || undefined}
            hint="Guardamos cifrada e não mostramos de novo."
          />
          {env && (
            <span className={[blocks.tag, env === 'sandbox' ? blocks.tagWarn : blocks.tagOk].join(' ')}>
              {env === 'sandbox' ? 'Sandbox · não recebe dinheiro de verdade' : 'Produção · reconhecida pelo começo da chave'}
            </span>
          )}
          <Button variant="primary" loading={busy} disabled={!canSubmit} onClick={connect}>
            {connected ? 'Trocar chave' : 'Conectar'}
          </Button>
          {onCancel && <Button variant="tertiary" onClick={onCancel}>Cancelar</Button>}
        </form>
        <p className={blocks.meta}>O botão libera com o termo aceito e a chave colada.</p>
      </section>

      {!connected && (
        <Alert tone="info" title="Ainda não tem Asaas?">
          Abra uma conta grátis no site do Asaas, com o CNPJ ou o CPF da loja, e volte aqui.
        </Alert>
      )}
    </div>
  );
}

export default AsaasTermsKeyForm;
