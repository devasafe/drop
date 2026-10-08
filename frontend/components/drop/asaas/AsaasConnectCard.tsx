import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Aceite mais recente do termo (null = nunca aceitou; a loja não vende até aceitar). */
  consent?: { version: string; acceptedAt: string } | null;
  /** Versão vigente do termo. */
  termsVersion?: string;
}

export interface AsaasConnectCardProps {
  /** Base da API: `/stores/:id/asaas` (lojista) ou `/admin/stores/:id/asaas` (admin). */
  apiBase: string;
  /** Usado para mostrar a URL do webhook de autorização antes de gerar o token. */
  storeId: string;
  /** IP de saída da DROP (de GET /settings/saas), a liberar no painel do Asaas. */
  egressIp?: string | null;
  /** Mostra "Desconectar" (só o admin; o lojista não desconecta). */
  allowDisconnect?: boolean;
}

const errMsg = (e: any, fallback: string) => e?.response?.data?.error?.message || fallback;
const TERMS_OUTDATED_MSG = 'O termo foi atualizado, recarregue';
const isTermsOutdated = (e: any) => e?.response?.data?.error?.code === 'TERMS_VERSION_OUTDATED';

/**
 * Cartão de conexão da conta Asaas da loja. A chave de API só vive no estado
 * enquanto o usuário digita: é apagada assim que a conexão é aceita e nunca é
 * devolvida pelo backend (só o status e o final).
 */
export function AsaasConnectCard({ apiBase, storeId, egressIp, allowDisconnect }: AsaasConnectCardProps) {
  const { showToast } = useToast();
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [status, setStatus] = useState<AsaasStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [terms, setTerms] = useState('');
  // Versão do texto EXIBIDO: é ela que o aceite envia (o servidor recusa se não for a vigente).
  const [termsVersion, setTermsVersion] = useState('');
  // 'loading' → 'ok' (texto exibido) | 'error' (falhou ou veio sem texto). Fail closed: sem
  // o texto na tela, ninguém aceita um termo que não leu.
  const [termsState, setTermsState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [accepted, setAccepted] = useState(false);

  // Texto do termo vindo do backend (fonte única; a versão exibida é a que o aceite envia).
  const aliveRef = useRef(true);
  // Volta a true no (re)mount: em StrictMode o React monta, desmonta e monta de novo.
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  const loadTerms = useCallback(() => {
    setTermsState('loading');
    return api.get('/settings/store-asaas-terms')
      .then((r) => {
        if (!aliveRef.current) return;
        const text = typeof r.data?.text === 'string' ? r.data.text.trim() : '';
        const version = typeof r.data?.version === 'string' ? r.data.version.trim() : '';
        setTerms(text);
        setTermsVersion(version);
        setTermsState(text && version ? 'ok' : 'error');
      })
      .catch(() => { if (aliveRef.current) setTermsState('error'); });
  }, []);
  useEffect(() => { loadTerms(); }, [loadTerms]);

  // Termo mudou entre a leitura e o aceite: desmarca, avisa e recarrega o texto novo.
  const onTermsOutdated = () => {
    setAccepted(false);
    showToast(TERMS_OUTDATED_MSG, 'error');
    loadTerms();
  };
  const termsReady = termsState === 'ok';

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
      const r = await api.put(apiBase, { apiKey, acceptTerms: true, termsVersion });
      setStatus(r.data?.data ?? null);
      setApiKey(''); // a chave não fica em estado nem em tela
      setAccepted(false);
      showToast('Conta Asaas conectada.', 'success');
    } catch (e: any) {
      if (isTermsOutdated(e)) {
        setError(TERMS_OUTDATED_MSG);
        onTermsOutdated();
      } else {
        setError(errMsg(e, 'Não foi possível conectar.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const acceptTermsOnly = async () => {
    setBusy(true);
    try {
      const r = await api.post(`${apiBase}/consent`, { acceptTerms: true, termsVersion });
      setStatus(r.data?.data ?? null);
      setAccepted(false);
      showToast('Termo aceito.', 'success');
    } catch (e: any) {
      if (isTermsOutdated(e)) onTermsOutdated();
      else showToast(errMsg(e, 'Não foi possível registrar o aceite.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const genToken = async () => {
    if (genBusy) return;
    if ((authToken || status?.checklist?.authWebhookConfirmed) && typeof window !== 'undefined'
      && !window.confirm('Gerar um novo token? O token atual, já colado no Asaas, deixa de valer e as transferências serão recusadas até você colar o novo token no Asaas.')) return;
    setGenBusy(true);
    try {
      const r = await api.post(`${apiBase}/auth-token`);
      setAuthToken(r.data?.data?.token ?? null);
      setAuthUrl(r.data?.data?.url ?? null);
      await load();
    } catch (e: any) {
      showToast(errMsg(e, 'Não foi possível gerar o token.'), 'error');
    } finally {
      setGenBusy(false);
    }
  };

  const copy = (text: string) => {
    try { navigator.clipboard?.writeText(text); showToast('Copiado.', 'success'); } catch { /* sem clipboard */ }
  };

  const toggle = async (field: 'ipWhitelist' | 'authWebhook', value: boolean) => {
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
      setAuthToken(null);
      showToast('Conta Asaas desconectada.', 'success');
    } catch (e: any) {
      showToast(errMsg(e, 'Não foi possível desconectar.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const c = status?.checklist;
  const connected = !!status && status.status !== 'none';
  const urlShown = authUrl || `https://api.dropapp.com.br/webhooks/asaas/loja/${storeId}/autorizacao`;
  const needsConsent = status?.status === 'valid' && !status.consent;
  const outdatedConsent = status?.status === 'valid' && !!status.consent && !!status.termsVersion && status.consent.version !== status.termsVersion;
  const acceptLabel = allowDisconnect ? 'O lojista assinou este termo' : 'Li e aceito o termo';
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
        {needsConsent && (
          <p className={`${styles.hint} ${styles.warn}`} role="alert">Aceite o termo para voltar a vender. Enquanto isso, os pedidos Pix desta loja ficam bloqueados.</p>
        )}
        {outdatedConsent && (
          <p className={`${styles.hint} ${styles.warn}`}>O termo foi atualizado. Aceite a nova versão para manter o registro em dia.</p>
        )}
        <div className={styles.terms}>
          <strong>Termo de autorização</strong>
          {termsReady && <pre className={styles.termsText}>{terms}</pre>}
          {termsState === 'error' && (
            <p className={`${styles.hint} ${styles.warn}`} role="alert">Não foi possível carregar o termo. Recarregue a página para ler e aceitar.</p>
          )}
          <label className={styles.accept}>
            <input type="checkbox" checked={accepted && termsReady} disabled={!termsReady} onChange={(e) => setAccepted(e.target.checked)} />
            <span>{acceptLabel}</span>
          </label>
          {(needsConsent || outdatedConsent) && (
            <div className={styles.actions}>
              <Button size="sm" variant="primary" loading={busy} disabled={!accepted || !termsReady} onClick={acceptTermsOnly}>Aceitar o termo</Button>
            </div>
          )}
        </div>
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (apiKey && accepted && termsReady) connect(); }}>
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
          <Button variant="primary" loading={busy} disabled={!apiKey || !accepted || !termsReady} onClick={connect}>
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
            <li className={styles.item}>
              <div className={styles.itemHead}>{mark(c?.authWebhookConfirmed)} 4. Gerar token da trava de autorização</div>
              <p className={styles.hint}>No Asaas, cadastre este endereço como webhook de autorização de transferências e cole o token gerado aqui.</p>
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
                <Button size="sm" variant="ghost" disabled={genBusy} onClick={genToken}>{authToken ? 'Gerar outro token' : 'Gerar token'}</Button>
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
