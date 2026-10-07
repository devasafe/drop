import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/api';
import { Section } from '../../ui/Section';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { useToast } from '../../ui/Toast';
import styles from './AsaasConnectCard.module.css';

interface Checklist { apiKey: boolean; paymentWebhook: boolean; ipWhitelistConfirmed: boolean; authWebhookConfirmed: boolean }
interface AsaasStatus {
  status: 'none' | 'valid' | 'invalid';
  environment: 'sandbox' | 'production' | null;
  lastCheckedAt: string | null;
  checklist: Checklist;
  apiKeyLast4?: string;
}

export interface AsaasConnectCardProps {
  /** Base da API: `/stores/:id/asaas` (lojista) ou `/admin/stores/:id/asaas` (admin). */
  apiBase: string;
  /** Loja dona da conta (reservado para o webhook de autorização da Fase 2). */
  storeId: string;
  /** IP de saída da DROP (de GET /settings/saas), a liberar no painel do Asaas. */
  egressIp?: string | null;
  /** Mostra "Desconectar" (só o admin; o lojista não desconecta). */
  allowDisconnect?: boolean;
}

const errMsg = (e: any, fallback: string) => e?.response?.data?.error?.message || fallback;

/**
 * Cartão de conexão da conta Asaas da loja. A chave de API só vive no estado
 * enquanto o usuário digita: é apagada assim que a conexão é aceita e nunca é
 * devolvida pelo backend (só o status e o final).
 */
/*
 * O item 4 (webhook de autorização de transferências) fica escondido até a Fase 2: o
 * endpoint que o Asaas chamaria ainda não existe e o backend responde 404
 * FEATURE_NOT_AVAILABLE para a geração do token.
 */
export function AsaasConnectCard({ apiBase, egressIp, allowDisconnect }: AsaasConnectCardProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<AsaasStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get(apiBase);
      setStatus(r.data?.data ?? null);
    } catch (e: any) {
      setError(errMsg(e, 'Não foi possível carregar o status.'));
    }
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.put(apiBase, { apiKey });
      setStatus(r.data?.data ?? null);
      setApiKey(''); // a chave não fica em estado nem em tela
      showToast('Conta Asaas conectada.', 'success');
    } catch (e: any) {
      setError(errMsg(e, 'Não foi possível conectar.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (field: 'ipWhitelist', value: boolean) => {
    try {
      const r = await api.post(`${apiBase}/checklist`, { [field]: value });
      setStatus(r.data?.data ?? null);
    } catch (e: any) {
      showToast(errMsg(e, 'Não foi possível salvar.'), 'error');
    }
  };

  const runTest = async () => {
    setBusy(true);
    try {
      const r = await api.post(`${apiBase}/test`);
      setStatus(r.data?.data ?? null);
      showToast('Teste concluído. Veja o checklist.', 'info');
    } catch (e: any) {
      showToast(errMsg(e, 'Não foi possível testar agora.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Desconectar a conta Asaas desta loja? Os pagamentos dela deixam de funcionar.')) return;
    setBusy(true);
    try {
      const r = await api.delete(apiBase);
      setStatus(r.data?.data ?? null);
      showToast('Conta Asaas desconectada.', 'success');
    } catch (e: any) {
      showToast(errMsg(e, 'Não foi possível desconectar.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const c = status?.checklist;
  const connected = !!status && status.status !== 'none';
  const mark = (v?: boolean) => <span className={`${styles.mark} ${v ? styles.ok : styles.bad}`}>{v ? '✓' : '○'}</span>;

  return (
    <div className={styles.card}>
      <Section title="Conta Asaas">
        <div className={styles.statusRow}>
          <span className={`${styles.badge} ${status?.status === 'valid' ? styles.ok : status?.status === 'invalid' ? styles.bad : ''}`}>
            {status?.status === 'valid' ? 'Chave válida' : status?.status === 'invalid' ? 'Chave inválida' : 'Não conectada'}
          </span>
          {status?.environment && <span className={styles.meta}>Ambiente: {status.environment === 'sandbox' ? 'sandbox' : 'produção'}</span>}
          {status?.apiKeyLast4 && <span className={styles.meta}>{`Chave ••••${status.apiKeyLast4}`}</span>}
        </div>
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (apiKey) connect(); }}>
          <Input
            className={styles.formField}
            type="password"
            value={apiKey}
            onChange={setApiKey}
            placeholder="Chave de API do Asaas"
            autoComplete="off"
            aria-label="Chave de API do Asaas"
            error={error || undefined}
          />
          <Button variant="primary" loading={busy} disabled={!apiKey} onClick={connect}>
            {connected ? 'Trocar chave' : 'Conectar'}
          </Button>
          {allowDisconnect && connected && (
            <Button variant="ghost" loading={busy} onClick={disconnect}>Desconectar</Button>
          )}
        </form>
        <p className={styles.hint}>Gere a chave no painel do Asaas, em Integrações. Ela é guardada cifrada e nunca é exibida de novo.</p>
      </Section>

      {connected && (
        <Section title="Checklist" action={<Button size="sm" variant="ghost" loading={busy} onClick={runTest}>Testar configuração</Button>}>
          <ul className={styles.list}>
            <li className={styles.item}>
              <div className={styles.itemHead}>{mark(c?.apiKey)} 1. Chave de API válida</div>
              <p className={styles.hint}>Verificada no Asaas ao conectar e ao testar.</p>
            </li>
            <li className={styles.item}>
              <div className={styles.itemHead}>{mark(c?.paymentWebhook)} 2. Aviso de pagamentos ativo</div>
              <p className={styles.hint}>Configurado pela DROP. Use &quot;Testar configuração&quot; para conferir.</p>
            </li>
            <li className={styles.item}>
              <div className={styles.itemHead}>{mark(c?.ipWhitelistConfirmed)} 3. Liberar o IP da DROP</div>
              <p className={styles.hint}>No Asaas, em Integrações, adicione o IP abaixo à lista de IPs autorizados.</p>
              <code className={styles.code}>{egressIp || 'IP ainda não informado pela plataforma'}</code>
              <div className={styles.actions}>
                <Button size="sm" variant="ghost" onClick={() => toggle('ipWhitelist', !c?.ipWhitelistConfirmed)}>
                  {c?.ipWhitelistConfirmed ? 'Desmarcar' : 'Já liberei o IP'}
                </Button>
              </div>
            </li>
          </ul>
        </Section>
      )}
    </div>
  );
}

export default AsaasConnectCard;
