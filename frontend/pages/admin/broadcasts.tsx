import { FormEvent, useCallback, useEffect, useId, useState } from 'react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminSheet } from '../../components/admin/AdminSheet';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { adminErrorMessage } from '../../lib/adminErrors';
import blocks from '../../components/admin/AdminBlocks.module.css';
import styles from '../../components/admin/comunicacao/Broadcasts.module.css';

/**
 * Avisos e broadcasts · Broadcasts (D3a, tela 20). GET /broadcasts, POST /broadcasts { title, body, targetRoles }
 * e DELETE /broadcasts/:id (o botão só aparece para o CEO, como hoje). Envio imediato; agendar é D3b.
 */
const ALL_ROLES = [
  { key: 'cliente', label: 'Clientes' },
  { key: 'lojista', label: 'Lojistas' },
  { key: 'motoboy', label: 'Motoboys' },
  { key: 'gerente_clientes', label: 'Gerentes de Clientes' },
  { key: 'gerente_lojistas', label: 'Gerentes de Lojistas' },
  { key: 'gerente_motoboys', label: 'Gerentes de Motoboys' },
  { key: 'gerente_geral', label: 'Gerentes Gerais' },
  { key: 'marketing', label: 'Marketing' },
];
const roleName = (k: string) => ALL_ROLES.find((r) => r.key === k)?.label ?? k;

interface Broadcast {
  _id: string;
  title: string;
  body: string;
  targetRoles: string[];
  deliveryCount: number;
  sentAt: string;
  createdBy?: { name: string };
}

const fmtSent = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AdminBroadcasts() {
  return (
    <ProtectedRoute required_permission="broadcast:send">
      <AdminShell title="Avisos e broadcasts · Broadcasts" tabs="comunicacao">
        <BroadcastsBody />
      </AdminShell>
    </ProtectedRoute>
  );
}

function BroadcastsBody() {
  const { user } = useAuth();
  const isCeo = (user?.activeRole || user?.role) === 'ceo';
  const { showToast } = useToast();
  const formId = useId();
  const sentId = useId();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [history, setHistory] = useState<Broadcast[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Broadcast | null>(null);

  const fetchHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      const res = await api.get('/broadcasts');
      setHistory(Array.isArray(res.data?.broadcasts) ? res.data.broadcasts : []);
    } catch (err) {
      setHistoryError(adminErrorMessage(err, 'Não deu para ler os enviados.'));
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const toggleRole = (role: string) => {
    setTargetRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const askSend = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || targetRoles.length === 0) {
      setFormError('Preencha título, mensagem e selecione pelo menos um grupo.');
      return;
    }
    setFormError(null);
    setConfirmOpen(true);
  };

  const send = async () => {
    const res = await api.post('/broadcasts', { title, body, targetRoles });
    setConfirmOpen(false);
    showToast(`Enviado para ${res.data?.deliveryCount ?? 0} usuários!`, 'success');
    setTitle('');
    setBody('');
    setTargetRoles([]);
    await fetchHistory();
  };

  const remove = async () => {
    if (!toDelete) return;
    const id = toDelete._id;
    await api.delete(`/broadcasts/${id}`);
    setHistory((prev) => (prev ? prev.filter((b) => b._id !== id) : prev));
    setToDelete(null);
    showToast('Broadcast apagado', 'success');
  };

  const groups = targetRoles.length;

  return (
    <div className={styles.layout}>
      <form className={blocks.block} onSubmit={askSend} aria-labelledby={formId} noValidate>
        <div className={blocks.blockHead}>
          <h2 id={formId} className={blocks.blockTitle}>Novo broadcast</h2>
          <span className={blocks.muted}>push + notificação no app</span>
        </div>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Para quem</legend>
          <div className={styles.roleGrid}>
            {ALL_ROLES.map((r) => (
              <Checkbox key={r.key} label={r.label} checked={targetRoles.includes(r.key)} onChange={() => toggleRole(r.key)} />
            ))}
          </div>
          <div className={blocks.actions}>
            <Button variant="tertiary" size="sm" onClick={() => setTargetRoles(ALL_ROLES.map((r) => r.key))}>Todos</Button>
            <Button variant="tertiary" size="sm" onClick={() => setTargetRoles([])}>Limpar</Button>
          </div>
        </fieldset>

        <Input
          label="Título"
          value={title}
          onChange={setTitle}
          placeholder="Ex: Promoção de Verão"
          maxLength={200}
          hint={`${title.length} de 200 caracteres`}
        />
        <div className={styles.field}>
          <label htmlFor={`${formId}-body`} className={styles.label}>Mensagem</label>
          <textarea
            id={`${formId}-body`}
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva aqui o conteúdo do anúncio..."
            rows={5}
            maxLength={2000}
          />
          <span className={styles.counter}>{body.length}/2000</span>
        </div>

        {formError && <Alert tone="error">{formError}</Alert>}
        <div className={styles.submit}><Button type="submit">Enviar agora</Button></div>
      </form>

      <div className={styles.side}>
        <section className={blocks.block} aria-label="Prévia no celular">
          <p className={styles.cap}>Prévia no celular</p>
          <div className={styles.phone}>
            <div className={styles.push}>
              <span className={styles.pushIcon} aria-hidden="true" />
              <div className={styles.pushText}>
                <span className={styles.pushTitle}>DROP · {title.trim() || 'Título do aviso'}</span>
                <span className={styles.pushBody}>{body.trim() || 'A mensagem aparece aqui.'}</span>
              </div>
            </div>
          </div>
          <p className={blocks.muted}>
            {groups === 0 ? 'Escolha para quem.' : `Vai para: ${targetRoles.map(roleName).join(', ')}`}
          </p>
        </section>

        <section className={blocks.block} aria-labelledby={sentId}>
          <h2 id={sentId} className={blocks.blockTitle}>Enviados</h2>
          {historyError ? (
            <>
              <p className={blocks.errText} role="alert">{historyError}</p>
              <div><Button variant="secondary" size="sm" onClick={fetchHistory}>Tentar de novo</Button></div>
            </>
          ) : history === null ? (
            <div aria-busy="true" aria-label="Carregando"><Skeleton height={56} /><Skeleton height={56} /></div>
          ) : history.length === 0 ? (
            <p className={blocks.muted}>Nenhum anúncio enviado ainda.</p>
          ) : (
            <ul className={styles.sentList}>
              {history.map((b) => (
                <li key={b._id} className={styles.sentItem}>
                  <div className={styles.sentHead}>
                    <span className={styles.sentTitle}>{b.title}</span>
                    {isCeo && (
                      <Button variant="tertiary" size="sm" aria-label={`Apagar ${b.title}`} onClick={() => setToDelete(b)}>Apagar</Button>
                    )}
                  </div>
                  <p className={styles.sentBody}>{b.body}</p>
                  <span className={styles.sentMeta}>
                    {b.targetRoles.map(roleName).join(', ')} · {b.deliveryCount} usuários · {fmtSent(b.sentAt)} · por {b.createdBy?.name || 'Sistema'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AdminSheet
        open={confirmOpen}
        title={`Enviar para ${groups} ${groups === 1 ? 'grupo' : 'grupos'}?`}
        onClose={() => setConfirmOpen(false)}
        primary={{ label: 'Enviar agora', onClick: send }}
      >
        <dl className={styles.summary}>
          <dt className={blocks.muted}>Título</dt>
          <dd>{title}</dd>
          <dt className={blocks.muted}>Grupos</dt>
          <dd>{targetRoles.map(roleName).join(', ')}</dd>
        </dl>
        <p className={blocks.muted}>O envio é na hora e não dá para desfazer.</p>
      </AdminSheet>

      <AdminSheet
        open={toDelete !== null}
        title="Apagar este broadcast?"
        onClose={() => setToDelete(null)}
        primary={{ label: 'Apagar', tone: 'danger', onClick: remove }}
      >
        <p className={blocks.muted}>
          Remove as notificações de {toDelete?.deliveryCount ?? 0} usuários. Não dá para desfazer.
        </p>
      </AdminSheet>
    </div>
  );
}
