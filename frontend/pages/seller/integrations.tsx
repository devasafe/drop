import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Section } from '../../components/ui/Section';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import styles from './Integrations.module.css';

interface ApiKey { id: string; name: string; prefix: string; scopes?: string[]; lastUsedAt?: string; revokedAt?: string; createdAt: string }
interface Webhook { id: string; url: string; active: boolean; failureCount: number; lastStatus?: number; lastDeliveryAt?: string; createdAt: string }

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function SellerIntegrations() {
  const { showToast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [keyName, setKeyName] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState('');
  const [newSecret, setNewSecret] = useState<{ url: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Só depois de montar: a base do api depende de window.location (client-only).
  // Renderizar isso no SSR causaria mismatch de hidratação (crash na página).
  const [apiBase, setApiBase] = useState('');
  useEffect(() => { setApiBase((api.defaults.baseURL || '').replace(/\/$/, '')); }, []);

  const load = useCallback(async () => {
    try {
      const [k, w] = await Promise.all([api.get('/integrations/keys'), api.get('/integrations/webhooks')]);
      setKeys(k.data.keys || []);
      setWebhooks(w.data.webhooks || []);
    } catch { /* silencioso */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => showToast('Copiado!', 'success')).catch(() => {}); };

  const createKey = async () => {
    setBusy(true);
    try {
      const r = await api.post('/integrations/keys', { name: keyName || 'Integração', readOnly });
      setNewKey(r.data.key);
      setKeyName('');
      await load();
    } catch (e: any) { showToast(e?.response?.data?.error || 'Erro ao gerar chave', 'error'); }
    setBusy(false);
  };

  const revokeKey = async (id: string) => {
    if (!window.confirm('Revogar esta chave? Integrações que a usam vão parar de funcionar.')) return;
    try { await api.delete(`/integrations/keys/${id}`); await load(); showToast('Chave revogada', 'success'); }
    catch (e: any) { showToast(e?.response?.data?.error || 'Erro', 'error'); }
  };

  const createWebhook = async () => {
    setBusy(true);
    try {
      const r = await api.post('/integrations/webhooks', { url: hookUrl });
      setNewSecret({ url: r.data.url, secret: r.data.secret });
      setHookUrl('');
      await load();
    } catch (e: any) { showToast(e?.response?.data?.error || 'Erro ao criar webhook', 'error'); }
    setBusy(false);
  };

  const deleteWebhook = async (id: string) => {
    if (!window.confirm('Remover este webhook?')) return;
    try { await api.delete(`/integrations/webhooks/${id}`); await load(); }
    catch (e: any) { showToast(e?.response?.data?.error || 'Erro', 'error'); }
  };

  const testWebhook = async (id: string) => {
    try { const r = await api.post(`/integrations/webhooks/${id}/test`); showToast(r.data.ok ? 'Ping enviado (2xx)!' : 'O endpoint não respondeu 2xx', r.data.ok ? 'success' : 'error'); await load(); }
    catch { showToast('Falha ao testar', 'error'); }
  };

  const curl = `curl -H "Authorization: Bearer SUA_CHAVE" \\\n  ${apiBase}/integrations/v1/products`;

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <h1 className={styles.title}>Integrações (API)</h1>
            <p className={styles.subtitle}>Exporte seu estoque em tempo real: puxe via API ou receba webhooks quando o estoque muda.</p>
            <a className={styles.docsLink} href="/docs/api" target="_blank" rel="noopener noreferrer">
              📖 Ver documentação (como usar e integrar)
            </a>
          </header>

          {/* ── Chaves de API ── */}
          <Section title="Chaves de API">
            <div className={styles.formRow}>
              <Input value={keyName} onChange={setKeyName} placeholder="Nome (ex.: Meu ERP)" />
              <Button variant="primary" onClick={createKey} loading={busy}>Gerar chave</Button>
            </div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
              Somente leitura (só puxa o estoque; não deixa dar baixa)
            </label>

            {newKey && (
              <div className={styles.secretBox}>
                <div className={styles.secretLabel}>Copie agora — a chave completa não aparece de novo:</div>
                <div className={styles.secretRow}>
                  <code className={styles.code}>{newKey}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(newKey)}>Copiar</Button>
                </div>
                <button type="button" className={styles.dismiss} onClick={() => setNewKey(null)}>Ok, guardei</button>
              </div>
            )}

            <div className={styles.list}>
              {keys.length === 0 && <div className={styles.empty}>Nenhuma chave ainda.</div>}
              {keys.map((k) => (
                <div key={k.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemName}>{k.name}
                      <span className={styles.scope}>{k.scopes?.includes('write') ? 'leitura + escrita' : 'somente leitura'}</span>
                      {k.revokedAt && <span className={styles.revoked}>revogada</span>}
                    </div>
                    <div className={styles.itemMeta}><code>{k.prefix}…</code> · criada {fmtDate(k.createdAt)} · último uso {fmtDate(k.lastUsedAt)}</div>
                  </div>
                  {!k.revokedAt && <Button size="sm" variant="danger" onClick={() => revokeKey(k.id)}>Revogar</Button>}
                </div>
              ))}
            </div>
          </Section>

          {/* ── Webhooks ── */}
          <Section title="Webhooks (estoque em tempo real)">
            <p className={styles.hint}>Quando o estoque muda (venda, cancelamento, ajuste), enviamos um POST com o evento <code>stock.updated</code> pra sua URL, assinado em <code>X-Drop-Signature</code> (HMAC-SHA256 do corpo com o secret).</p>
            <div className={styles.formRow}>
              <Input value={hookUrl} onChange={setHookUrl} placeholder="https://seu-sistema.com/webhooks/drop" />
              <Button variant="primary" onClick={createWebhook} loading={busy}>Adicionar</Button>
            </div>

            {newSecret && (
              <div className={styles.secretBox}>
                <div className={styles.secretLabel}>Secret do webhook (valide a assinatura com ele) — só aparece agora:</div>
                <div className={styles.secretRow}>
                  <code className={styles.code}>{newSecret.secret}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(newSecret.secret)}>Copiar</Button>
                </div>
                <button type="button" className={styles.dismiss} onClick={() => setNewSecret(null)}>Ok, guardei</button>
              </div>
            )}

            <div className={styles.list}>
              {webhooks.length === 0 && <div className={styles.empty}>Nenhum webhook ainda.</div>}
              {webhooks.map((w) => (
                <div key={w.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <div className={styles.itemName}>{w.url} {!w.active && <span className={styles.revoked}>desativado</span>}</div>
                    <div className={styles.itemMeta}>última entrega {fmtDate(w.lastDeliveryAt)} · status {w.lastStatus ?? '—'} · falhas {w.failureCount}</div>
                  </div>
                  <div className={styles.itemActions}>
                    <Button size="sm" variant="ghost" onClick={() => testWebhook(w.id)}>Testar</Button>
                    <Button size="sm" variant="danger" onClick={() => deleteWebhook(w.id)}>Remover</Button>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Docs ── */}
          <Section title="Como puxar o estoque (API)">
            <p className={styles.hint}>Endpoint sempre-atual (JSON, ou <code>?format=csv</code>). Autentique com a chave no header.</p>
            <div className={styles.docsRow}>
              <code className={styles.endpoint}>GET {apiBase}/integrations/v1/products</code>
              <Button size="sm" variant="ghost" onClick={() => copy(`${apiBase}/integrations/v1/products`)}>Copiar URL</Button>
            </div>
            <pre className={styles.pre}>{curl}</pre>
          </Section>
        </div>
      </div>
    </ProtectedRoute>
  );
}
