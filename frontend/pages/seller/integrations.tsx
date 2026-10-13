import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { Sheet } from '../../components/ui/Sheet';
import SellerShell from '../../components/seller/panel/SellerShell';
import { apiErrorMessage } from '../../lib/sellerApi';
import { KeyRound, FileText, Upload, AlertTriangle } from 'lucide-react';
import { NavRow } from '../../components/seller/ui/NavRow';
import blocks from '../../components/seller/ui/SellerBlocks.module.css';
import styles from './Integrations.module.css';

interface ApiKey { id: string; name: string; prefix: string; scopes?: string[]; lastUsedAt?: string; revokedAt?: string; createdAt: string }
interface Webhook { id: string; url: string; active: boolean; failureCount: number; lastStatus?: number; lastDeliveryAt?: string; createdAt: string }
interface Product { id: string; name: string; quantity: number; price: number; available: boolean }

/** "usada há 2 h" / "nunca usada". */
function usedLabel(d?: string): string {
  if (!d) return 'nunca usada';
  const min = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (min < 1) return 'usada agora';
  if (min < 60) return `usada há ${min} min`;
  if (min < 1440) return `usada há ${Math.round(min / 60)} h`;
  return `usada há ${Math.round(min / 1440)} d`;
}

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Parser simples de uma linha CSV (respeita aspas e vírgulas dentro de aspas). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Extrai `{ id, quantity }` do CSV (precisa das colunas id e quantity). */
function parseStockCsv(text: string): { id: string; quantity: number }[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idIdx = header.indexOf('id');
  const qtyIdx = header.indexOf('quantity');
  if (idIdx === -1 || qtyIdx === -1) return [];
  const updates: { id: string; quantity: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const id = (cols[idIdx] || '').trim();
    const q = Number((cols[qtyIdx] || '').trim());
    if (id && Number.isInteger(q) && q >= 0) updates.push({ id, quantity: q });
  }
  return updates;
}

export default function SellerIntegrations() {
  const { showToast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState('');
  const [newSecret, setNewSecret] = useState<{ url: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  // Revogar chave / remover webhook: confirmação num sheet (sem window.confirm).
  const [confirmAction, setConfirmAction] = useState<{ kind: 'key' | 'webhook'; id: string } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Só depois de montar: a base do api depende de window.location (client-only).
  // Renderizar isso no SSR causaria mismatch de hidratação (crash na página).
  const [apiBase, setApiBase] = useState('');
  useEffect(() => { setApiBase((api.defaults.baseURL || '').replace(/\/$/, '')); }, []);

  const load = useCallback(async () => {
    try {
      const [k, w, p] = await Promise.all([
        api.get('/integrations/keys'),
        api.get('/integrations/webhooks'),
        api.get('/integrations/products'),
      ]);
      setKeys(k.data.keys || []);
      setWebhooks(w.data.webhooks || []);
      setProducts(p.data.products || []);
    } catch { /* silencioso */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => showToast('Copiado!', 'success')).catch(() => {}); };

  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const updates = parseStockCsv(await file.text());
      if (updates.length === 0) {
        showToast('CSV sem colunas "id" e "quantity" válidas', 'error');
      } else {
        const r = await api.post('/integrations/import/products', { updates });
        const { updated, errorCount } = r.data;
        showToast(`${updated} produto(s) atualizado(s)${errorCount ? ` · ${errorCount} com erro` : ''}`, errorCount ? 'error' : 'success');
        await load();
      }
    } catch { showToast('Não foi possível ler o arquivo', 'error'); }
    setImporting(false);
  };

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const r = await api.get('/integrations/export/products.csv', { responseType: 'blob' });
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'estoque.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { showToast('Não foi possível baixar o estoque', 'error'); }
    setDownloading(false);
  };

  const createKey = async () => {
    setBusy(true);
    try {
      const r = await api.post('/integrations/keys', { name: keyName || 'Integração', readOnly });
      setNewKey(r.data.key);
      setKeyName('');
      await load();
    } catch (e: any) { showToast(apiErrorMessage(e, 'Erro ao gerar chave'), 'error'); }
    setBusy(false);
  };

  const revokeKey = (id: string) => setConfirmAction({ kind: 'key', id });

  const createWebhook = async () => {
    setBusy(true);
    try {
      const r = await api.post('/integrations/webhooks', { url: hookUrl });
      setNewSecret({ url: r.data.url, secret: r.data.secret });
      setHookUrl('');
      await load();
    } catch (e: any) { showToast(apiErrorMessage(e, 'Erro ao criar webhook'), 'error'); }
    setBusy(false);
  };

  const deleteWebhook = (id: string) => setConfirmAction({ kind: 'webhook', id });

  const runConfirm = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      if (confirmAction.kind === 'key') {
        await api.delete(`/integrations/keys/${confirmAction.id}`);
        showToast('Chave revogada', 'success');
      } else {
        await api.delete(`/integrations/webhooks/${confirmAction.id}`);
        showToast('Webhook removido', 'success');
      }
      setConfirmAction(null);
      await load();
    } catch (e: any) {
      showToast(apiErrorMessage(e, 'Não foi possível concluir agora.'), 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const testWebhook = async (id: string) => {
    try { const r = await api.post(`/integrations/webhooks/${id}/test`); showToast(r.data.ok ? 'Ping enviado (2xx)!' : 'O endpoint não respondeu 2xx', r.data.ok ? 'success' : 'error'); await load(); }
    catch { showToast('Falha ao testar', 'error'); }
  };

  const curl = `curl -H "Authorization: Bearer SUA_CHAVE" \\\n  ${apiBase}/integrations/v1/products`;

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell
        title="Integrações"
        back="/seller/loja"
        actions={<a className={blocks.link} href="/docs/api" target="_blank" rel="noopener noreferrer">Docs da API</a>}
      >
        <div className={blocks.body}>
          <p className={blocks.sub}>Conecte seu sistema de estoque ou ERP. Se você não usa, pode ignorar esta tela.</p>

          {/* Chaves de API */}
          <section className={blocks.blk} aria-labelledby="int-keys">
            <div className={blocks.head}>
              <h2 id="int-keys" className={blocks.headTitle}>Chaves de API</h2>
              <button type="button" className={blocks.link} onClick={() => setShowKeyForm((v) => !v)} aria-expanded={showKeyForm}>
                {showKeyForm ? 'Fechar' : '+ Nova'}
              </button>
            </div>

            {showKeyForm && (
              <div className={styles.form}>
                <p className={blocks.meta}>Uma senha que o seu sistema usa para ler o estoque. Ela aparece inteira só uma vez.</p>
                <div className={styles.formRow}>
                  <Input value={keyName} onChange={setKeyName} placeholder="Nome (ex.: Meu ERP)" />
                  <Button variant="primary" onClick={createKey} loading={busy}>Gerar chave</Button>
                </div>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
                  Somente leitura (só puxa o estoque; não dá baixa)
                </label>
              </div>
            )}

            {newKey && (
              <div className={`${blocks.blk} ${blocks.blkBrand}`}>
                <p className={blocks.meta}>Copie agora. A chave completa não aparece de novo.</p>
                <div className={blocks.codeRow}>
                  <code className={blocks.code}>{newKey}</code>
                  <Button size="sm" variant="tertiary" onClick={() => copy(newKey)}>Copiar</Button>
                </div>
                <button type="button" className={blocks.link} onClick={() => setNewKey(null)}>Ok, guardei</button>
              </div>
            )}

            {keys.length === 0 && <p className={blocks.meta}>Nenhuma chave ainda.</p>}
            {keys.length > 0 && (
              <ul className={styles.items}>
                {keys.map((k) => (
                  <li key={k.id} className={styles.item}>
                    <span className={`${blocks.ico} ${blocks.icoBrand}`} aria-hidden="true"><KeyRound size={18} /></span>
                    <span className={blocks.tx}>
                      <b>{k.name}</b>
                      <span className={blocks.mono}>{k.prefix}…</span>
                      <span>{k.scopes?.includes('write') ? 'leitura + escrita' : 'somente leitura'} · criada {fmtDate(k.createdAt)}</span>
                    </span>
                    <span className={styles.itemEnd}>
                      <span className={`${blocks.tag} ${k.revokedAt ? blocks.tagErr : k.lastUsedAt ? blocks.tagOk : ''}`}>{k.revokedAt ? 'revogada' : usedLabel(k.lastUsedAt)}</span>
                      {!k.revokedAt && <Button size="sm" variant="danger" onClick={() => revokeKey(k.id)}>Revogar</Button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Webhook */}
          <section className={blocks.blk} aria-labelledby="int-hook">
            <div className={blocks.head}>
              <h2 id="int-hook" className={blocks.headTitle}>Webhook de estoque</h2>
            </div>
            <p className={blocks.meta}>Avisamos o seu sistema quando o estoque muda (venda, cancelamento, ajuste). Informe a URL https que recebe os avisos; o envio é um POST assinado com o secret.</p>

            {newSecret && (
              <div className={`${blocks.blk} ${blocks.blkBrand}`}>
                <p className={blocks.meta}>Secret do webhook, para validar a assinatura. Só aparece agora.</p>
                <div className={blocks.codeRow}>
                  <code className={blocks.code}>{newSecret.secret}</code>
                  <Button size="sm" variant="tertiary" onClick={() => copy(newSecret.secret)}>Copiar</Button>
                </div>
                <button type="button" className={blocks.link} onClick={() => setNewSecret(null)}>Ok, guardei</button>
              </div>
            )}

            {webhooks.length === 0 && <p className={blocks.meta}>Nenhum webhook ainda.</p>}
            {webhooks.map((w) => (
              <div key={w.id} className={styles.hook}>
                <code className={styles.hookUrl}>{w.url}</code>
                <p className={blocks.meta}>
                  Última entrega {fmtDate(w.lastDeliveryAt)} · resposta {w.lastStatus ?? '—'} · {w.failureCount} {w.failureCount === 1 ? 'falha' : 'falhas'}
                  {!w.active && ' · desativado'}
                </p>
                {w.failureCount >= 3 && (
                  <p className={blocks.errText}>{w.failureCount} falhas seguidas. Confira a URL.</p>
                )}
                <div className={blocks.actions}>
                  <Button size="sm" variant="tertiary" onClick={() => testWebhook(w.id)}>Testar</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteWebhook(w.id)}>Remover</Button>
                </div>
              </div>
            ))}

            <div className={styles.formRow}>
              <Input value={hookUrl} onChange={setHookUrl} placeholder="https://seu-sistema.com/webhooks/drop" />
              <Button variant="primary" onClick={createWebhook} loading={busy}>Adicionar</Button>
            </div>
          </section>

          {/* CSV do estoque */}
          <h2 className={blocks.cap}>Meu estoque</h2>
          <ul className={blocks.list}>
            <NavRow
              icon={<Upload size={18} />}
              label="Importar estoque por planilha"
              sub={importing ? 'Enviando…' : 'CSV com as colunas id e quantity'}
              onClick={() => fileRef.current?.click()}
            />
            <NavRow
              icon={<FileText size={18} />}
              label="Exportar produtos (CSV)"
              sub={downloading ? 'Baixando…' : `${products.length} ${products.length === 1 ? 'produto' : 'produtos'}`}
              onClick={downloadCsv}
            />
          </ul>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className={blocks.hiddenInput} aria-label="Escolher a planilha de estoque" onChange={onImportFile} />

          <div className={`${blocks.blk} ${blocks.blkRow}`}>
            <span className={`${blocks.ico} ${blocks.icoWarn}`} aria-hidden="true"><AlertTriangle size={18} /></span>
            <p className={blocks.sub}>A chave aparece inteira só uma vez, quando você cria. Guarde num lugar seguro.</p>
          </div>

          {/* Para o programador */}
          <button type="button" className={blocks.link} onClick={() => setDocsOpen((v) => !v)} aria-expanded={docsOpen}>
            Conectar um sistema/ERP: como puxar o estoque
          </button>
          {docsOpen && (
            <section className={blocks.blk}>
              <p className={blocks.meta}>Endpoint sempre atual (JSON, ou ?format=csv). Autentique com a chave no header.</p>
              <div className={blocks.codeRow}>
                <code className={blocks.code}>GET {apiBase}/integrations/v1/products</code>
                <Button size="sm" variant="tertiary" onClick={() => copy(`${apiBase}/integrations/v1/products`)}>Copiar URL</Button>
              </div>
              <pre className={styles.pre}>{curl}</pre>
            </section>
          )}
        </div>
        <Sheet
          open={!!confirmAction}
          onClose={() => setConfirmAction(null)}
          title={confirmAction?.kind === 'key' ? 'Revogar esta chave?' : 'Remover este webhook?'}
          presentation="bottom"
        >
          <p className={blocks.sub}>
            {confirmAction?.kind === 'key'
              ? 'As integrações que usam esta chave param de funcionar na hora.'
              : 'O seu sistema deixa de receber os avisos de estoque.'}
          </p>
          <div className={blocks.actions}>
            <Button variant="danger" loading={confirmBusy} onClick={runConfirm}>
              {confirmAction?.kind === 'key' ? 'Revogar chave' : 'Remover webhook'}
            </Button>
            <Button variant="tertiary" onClick={() => setConfirmAction(null)}>Cancelar</Button>
          </div>
        </Sheet>
      </SellerShell>
    </ProtectedRoute>
  );
}
