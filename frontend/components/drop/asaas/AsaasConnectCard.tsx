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
  /** Usado só para mostrar a URL do webhook de autorização antes de gerar o token. */
  storeId: string;
  /** IP de saída da DROP (de GET /settings/saas), a liberar no painel do Asaas. */
  egressIp?: string | null;
}

const errMsg = (e: any, fallback: string) => e?.response?.data?.error?.message || fallback;

/**
 * Cartão de conexão da conta Asaas da loja. A chave de API só vive no estado
 * enquanto o usuário digita: é apagada assim que a conexão é aceita e nunca é
 * devolvida pelo backend (só o status e o final).
 */
export function AsaasConnectCard({ apiBase, storeId, egressIp }: AsaasConnectCardProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<AsaasStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

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

  const toggle = async (field: 'ipWhitelist' | 'authWebhook', value: boolean) => {
    try {
      const r = await api.post(`${apiBase}/checklist`, { [field]: value });
      setStatus(r.data?.data ?? null);
    } catch (e: any) {
      showToast(errMsg(e, 'Não foi possível salvar.'), 'error');
    }
  };

  const genToken = async () => {
    try {
      const r = await api.post(`${apiBase}/auth-token`);
      setAuthToken(r.data?.data?.token ?? null);
      setAuthUrl(r.data?.data?.url ?? null);
      await load();
    } catch (e: any) {
      showToast(errMsg(e, 'Não foi possível gerar o token.'), 'error');
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

  const copy = (text: string) => {
    try { navigator.clipboard?.writeText(text); showToast('Copiado.', 'success'); } catch { /* sem clipboard */ }
  };

  const c = status?.checklist;
  const connected = !!status && status.status !== 'none';
  const urlShown = authUrl || `https://api.dropapp.com.br/webhooks/asaas/loja/${storeId}/autorizacao`;
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
            <li className={styles.item}>
              <div className={styles.itemHead}>{mark(c?.authWebhookConfirmed)} 4. Autorização de transferências</div>
              <p className={styles.hint}>No Asaas, cadastre este endereço como webhook de autorização e cole o token gerado aqui.</p>
              <code className={styles.code}>{urlShown}</code>
              {authToken && (
                <div className={styles.tokenBox}>
                  <p className={styles.hint}>Copie o token agora. Ele não será mostrado de novo.</p>
                  <code className={styles.code}>{authToken}</code>
                  <div className={styles.actions}>
                    <Button size="sm" variant="ghost" onClick={() => copy(authToken)}>Copiar token</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAuthToken(null)}>Já copiei</Button>
                  </div>
                </div>
              )}
              <div className={styles.actions}>
                <Button size="sm" variant="ghost" onClick={genToken}>{authToken ? 'Gerar outro token' : 'Gerar token'}</Button>
                <Button size="sm" variant="ghost" onClick={() => toggle('authWebhook', !c?.authWebhookConfirmed)}>
                  {c?.authWebhookConfirmed ? 'Desmarcar' : 'Já configurei no Asaas'}
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
