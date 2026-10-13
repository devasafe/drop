// frontend/components/seller/asaas/AsaasChecklist.tsx
import { useRef, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import api from '../../../lib/api';
import { apiErrorMessage } from '../../../lib/sellerApi';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { authWebhookUrl, fmtDateTime, type AsaasStatus } from './asaasShared';
import blocks from '../ui/SellerBlocks.module.css';
import styles from './ContaAsaas.module.css';

interface Props {
  apiBase: string;
  storeId: string;
  status: AsaasStatus;
  /** IP de saída do DROP (GET /settings/saas), a liberar no Asaas. */
  egressIp?: string | null;
  onStatus: (status: AsaasStatus | null) => void;
}

type TokenSheet = null | { step: 'confirm' } | { step: 'token'; token: string; url: string };
const EMPTY = { apiKey: false, paymentWebhook: false, ipWhitelistConfirmed: false, authWebhookConfirmed: false };

export function AsaasChecklist({ apiBase, storeId, status, egressIp, onStatus }: Props) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [sheet, setSheet] = useState<TokenSheet>(null);
  // Token gerado nesta sessão: regerar invalida o que o lojista pode já ter colado no Asaas.
  const generatedRef = useRef(false);
  const c = status.checklist || EMPTY;
  const url = authWebhookUrl(storeId);
  const done = [c.apiKey, c.paymentWebhook, c.ipWhitelistConfirmed, c.authWebhookConfirmed].filter(Boolean).length;

  const copy = (text: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) { showToast('Selecione o texto e copie à mão.', 'info'); return; }
    navigator.clipboard.writeText(text)
      .then(() => showToast('Copiado.', 'success'))
      .catch(() => showToast('Selecione o texto e copie à mão.', 'info'));
  };

  const toggle = async (field: 'ipWhitelist' | 'authWebhook', value: boolean) => {
    try {
      const r = await api.post(`${apiBase}/checklist`, { [field]: value });
      onStatus(r.data?.data ?? null);
    } catch (e) {
      showToast(apiErrorMessage(e, 'Não foi possível salvar.'), 'error');
    }
  };

  const runTest = async () => {
    setBusy(true);
    try {
      const r = await api.post(`${apiBase}/test`);
      onStatus(r.data?.data ?? null);
      showToast('Teste concluído. Veja o checklist.', 'info');
    } catch (e) {
      showToast(apiErrorMessage(e, 'Não foi possível testar agora.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (genBusy) return;
    setGenBusy(true);
    try {
      const r = await api.post(`${apiBase}/auth-token`);
      generatedRef.current = true;
      setSheet({ step: 'token', token: r.data?.data?.token ?? '', url: r.data?.data?.url ?? url });
      const s = await api.get(apiBase).catch(() => null);
      if (s) onStatus(s.data?.data ?? null);
    } catch (e) {
      setSheet(null);
      showToast(apiErrorMessage(e, 'Não foi possível gerar o token.'), 'error');
    } finally {
      setGenBusy(false);
    }
  };

  // Trava já configurada: confirma ANTES de chamar a API. O token atual segue valendo até confirmar.
  const askToken = () => {
    if (genBusy) return;
    if (c.authWebhookConfirmed || generatedRef.current) setSheet({ step: 'confirm' });
    else generate();
  };

  const pasted = async () => {
    await toggle('authWebhook', true);
    setSheet(null);
  };

  const mark = (ok: boolean, n: number) => (
    <span className={ok ? [blocks.ico, blocks.icoOk].join(' ') : styles.num} aria-hidden="true">{ok ? <Check size={18} /> : n}</span>
  );

  return (
    <section className={blocks.stack} aria-label="Ajustes no Asaas">
      <div className={blocks.head}>
        <h2 className={blocks.headTitle}>{done === 4 ? 'Tudo pronto no Asaas' : `Faltam ${4 - done} ajustes no Asaas`}</h2>
        <span className={blocks.meta}>{`${done} de 4`}</span>
      </div>
      {done === 4 && <Alert tone="success" title="Pronto para receber e pagar motoboys" />}

      <ul className={blocks.list}>
        <li className={blocks.row}>
          {mark(c.apiKey, 1)}
          <span className={blocks.tx}>
            <b>1. Chave de API válida</b>
            <span>{c.apiKey ? `Conferida${status.lastCheckedAt ? ` em ${fmtDateTime(status.lastCheckedAt)}` : ''}` : 'Use "Testar configuração" para conferir de novo.'}</span>
          </span>
        </li>
        <li className={blocks.row}>
          {mark(c.paymentWebhook, 2)}
          <span className={blocks.tx}>
            <b>2. Aviso de pagamentos ativo</b>
            <span>{c.paymentWebhook ? 'Configurado pelo DROP' : 'Configurado pelo DROP. Use "Testar configuração" para conferir.'}</span>
          </span>
        </li>
      </ul>

      <div className={[blocks.blk, !c.ipWhitelistConfirmed && blocks.blkSelected].filter(Boolean).join(' ')}>
        <div className={styles.step}>
          {mark(c.ipWhitelistConfirmed, 3)}
          <h3 className={blocks.headTitle}>{c.ipWhitelistConfirmed ? '3. IP do DROP liberado' : '3. Liberar o IP do DROP'}</h3>
        </div>
        {!c.ipWhitelistConfirmed && (
          <>
            <p className={blocks.sub}>No Asaas: Integrações → IPs autorizados. Adicione este endereço:</p>
            <div className={blocks.codeRow}>
              <code className={blocks.code}>{egressIp || 'IP ainda não informado pela plataforma'}</code>
              {egressIp && <Button size="sm" variant="secondary" leftIcon={<Copy size={14} />} onClick={() => copy(egressIp)}>Copiar</Button>}
            </div>
          </>
        )}
        <div className={blocks.actions}>
          <Button size="sm" variant={c.ipWhitelistConfirmed ? 'tertiary' : 'secondary'} onClick={() => toggle('ipWhitelist', !c.ipWhitelistConfirmed)}>
            {c.ipWhitelistConfirmed ? 'Desmarcar' : 'Já liberei o IP'}
          </Button>
        </div>
      </div>

      <div className={[blocks.blk, c.ipWhitelistConfirmed && !c.authWebhookConfirmed && blocks.blkSelected].filter(Boolean).join(' ')}>
        <div className={styles.step}>
          {mark(c.authWebhookConfirmed, 4)}
          <h3 className={blocks.headTitle}>{c.authWebhookConfirmed ? '4. Trava de autorização ligada' : '4. Gerar token da trava de autorização'}</h3>
        </div>
        {!c.authWebhookConfirmed && (
          <>
            <p className={blocks.sub}>
              No Asaas, abra Menu do usuário → Integrações → Mecanismos de segurança → Validação de saque via webhook. Cole este endereço, o token gerado aqui e o seu e-mail. É nessa tela, não em Integrações → Webhooks.
            </p>
            <div className={blocks.codeRow}><code className={blocks.code}>{url}</code></div>
          </>
        )}
        <div className={blocks.actions}>
          <Button size="sm" variant="secondary" disabled={genBusy} onClick={askToken}>Gerar token</Button>
          <Button size="sm" variant="tertiary" onClick={() => toggle('authWebhook', !c.authWebhookConfirmed)}>
            {c.authWebhookConfirmed ? 'Desmarcar' : 'Já configurei no Asaas'}
          </Button>
        </div>
      </div>

      <div className={blocks.bar}>
        <Button variant="secondary" leftIcon={<RefreshCw size={16} />} loading={busy} onClick={runTest}>Testar configuração</Button>
        <small>Sem os 4 itens, o Pix automático aos motoboys fica parado.</small>
      </div>

      <Sheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet?.step === 'confirm' ? 'Gerar outro token?' : 'Cole estes 2 dados no Asaas'}
        presentation="bottom"
      >
        {sheet?.step === 'confirm' && (
          <div className={blocks.stack}>
            <p className={blocks.sub}>O token atual, já colado no Asaas, deixa de valer na hora. Até você colar o novo no Asaas, os Pix aos motoboys são recusados.</p>
            <Button variant="danger" loading={genBusy} onClick={generate}>Gerar outro token</Button>
            <Button variant="tertiary" onClick={() => setSheet(null)}>Cancelar</Button>
          </div>
        )}
        {sheet?.step === 'token' && (
          <div className={blocks.stack}>
            <p className={blocks.sub}>Cole na tela da trava de autorização do Asaas, junto com o seu e-mail.</p>
            <span className={blocks.cap}>Endereço</span>
            <div className={blocks.codeRow}>
              <code className={blocks.code}>{sheet.url}</code>
              <Button size="sm" variant="secondary" aria-label="Copiar endereço" onClick={() => copy(sheet.url)}><Copy size={14} /></Button>
            </div>
            <span className={blocks.cap}>Token · aparece só agora</span>
            <div className={blocks.codeRow}>
              <code className={blocks.code}>{sheet.token}</code>
              <Button size="sm" aria-label="Copiar token" onClick={() => copy(sheet.token)}>Copiar</Button>
            </div>
            <p className={blocks.meta}>Copie o token agora. Ele não será mostrado de novo.</p>
            <Alert tone="warning" title="Gerar outro token desliga este">Até você colar o novo no Asaas, os Pix aos motoboys são recusados.</Alert>
            <Button onClick={pasted}>Já colei no Asaas</Button>
          </div>
        )}
      </Sheet>
    </section>
  );
}

export default AsaasChecklist;
