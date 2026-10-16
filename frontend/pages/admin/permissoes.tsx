import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminSheet } from '../../components/admin/AdminSheet';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { ADMIN_DESKTOP_MIN, useMinWidth } from '../../hooks/useMinWidth';
import { adminRoleLabel } from '../../lib/adminNav';
import { adminErrorMessage } from '../../lib/adminErrors';
import { batchSummaryText, runBatch } from '../../lib/runBatch';
import blocks from '../../components/admin/AdminBlocks.module.css';
import styles from '../../components/admin/permissoes/Permissoes.module.css';

/**
 * Permissões (D3a, tela 24; só o CEO). Matriz papéis × permissões sobre os endpoints de sempre:
 * GET /role-permissions, PUT /role-permissions/:role (um por papel alterado, em sequência) e
 * DELETE /role-permissions/:role (restaurar padrão). Nada novo no servidor.
 */

interface PermissionDef { key: string; label: string; category: string }
interface RoleData { role: string; permissions: string[]; notificationTargets: string[]; isCustom: boolean }
interface ListResponse { roles: RoleData[]; allPermissions: PermissionDef[]; allRoles: string[] }
interface RoleDraft { permissions: string[]; notificationTargets: string[] }

/** Não delegável: o servidor recusa no PUT (rolePermissionsController, CEO_ONLY_PERMISSIONS). */
const CEO_ONLY = ['wallet:credit'];
/** Quem tem uma destas pode escolher para quem envia avisos (mesma regra da tela antiga). */
const NOTIFY_PERMS = ['notification:create', 'broadcast:send'];
const EXTRA_LABELS: Record<string, string> = { lojista: 'Lojista', cliente: 'Cliente', motoboy: 'Motoboy' };
const roleLabel = (role: string) => EXTRA_LABELS[role] ?? adminRoleLabel(role);
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export default function AdminPermissoes() {
  useRequireAuth(['ceo']);
  return (
    <ProtectedRoute required_role="ceo">
      <AdminShell title="Permissões">
        <PermissoesBody />
      </AdminShell>
    </ProtectedRoute>
  );
}

function PermCheck({ label, text, checked, changed, disabled, onToggle }: {
  label: string; text?: string; checked: boolean; changed: boolean; disabled?: boolean; onToggle: () => void;
}) {
  return (
    <label className={[styles.check, changed && styles.changed, disabled && styles.locked].filter(Boolean).join(' ')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} aria-label={label} />
      {text && <span className={styles.checkText}>{text}</span>}
      {changed && <span className={styles.changedTag}>alterado</span>}
    </label>
  );
}

function PermissoesBody() {
  const { showToast } = useToast();
  const desktop = useMinWidth(ADMIN_DESKTOP_MIN);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, RoleDraft>>({});
  const [saving, setSaving] = useState(false);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [resetRole, setResetRole] = useState<string | null>(null);
  const [mobileRole, setMobileRole] = useState('marketing');
  const alive = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.get('/role-permissions');
      if (alive.current) setData(res.data);
    } catch (err) {
      if (alive.current) setLoadError(adminErrorMessage(err, 'Não deu para ler as permissões.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) {
    return loadError ? (
      <div className={blocks.block}>
        <p className={blocks.errText} role="alert">{loadError}</p>
        <div><Button variant="secondary" onClick={load}>Tentar de novo</Button></div>
      </div>
    ) : (
      <div className={blocks.block} aria-busy="true" aria-label="Carregando">
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </div>
    );
  }

  const roles = data.allRoles.filter((r) => r !== 'ceo');
  const saved = (role: string): RoleDraft => {
    const r = data.roles.find((x) => x.role === role);
    return { permissions: r?.permissions ?? [], notificationTargets: r?.notificationTargets ?? [] };
  };
  const current = (role: string): RoleDraft => draft[role] ?? saved(role);
  const isDirty = (role: string) => {
    const d = draft[role];
    if (!d) return false;
    const s = saved(role);
    return !sameSet(d.permissions, s.permissions) || !sameSet(d.notificationTargets, s.notificationTargets);
  };
  const dirtyRoles = roles.filter(isDirty);
  const categories = Array.from(new Set(data.allPermissions.map((p) => p.category)));
  const canNotify = (role: string) => current(role).permissions.some((p) => NOTIFY_PERMS.includes(p));
  const permChanged = (role: string, key: string) => saved(role).permissions.includes(key) !== current(role).permissions.includes(key);
  const targetChanged = (role: string, t: string) =>
    saved(role).notificationTargets.includes(t) !== current(role).notificationTargets.includes(t);
  const mRole = roles.includes(mobileRole) ? mobileRole : roles[0];

  const togglePerm = (role: string, key: string) => {
    const base = current(role);
    const permissions = base.permissions.includes(key)
      ? base.permissions.filter((p) => p !== key)
      : [...base.permissions, key];
    setDraft((prev) => ({ ...prev, [role]: { ...base, permissions } }));
  };

  const toggleTarget = (role: string, target: string) => {
    const base = current(role);
    const notificationTargets = base.notificationTargets.includes(target)
      ? base.notificationTargets.filter((t) => t !== target)
      : [...base.notificationTargets, target];
    setDraft((prev) => ({ ...prev, [role]: { ...base, notificationTargets } }));
  };

  const save = async () => {
    const list = dirtyRoles;
    const snapshot: Record<string, RoleDraft> = Object.fromEntries(list.map((r) => [r, current(r)]));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSaving(true);
    setFailures({});
    const result = await runBatch(
      list,
      async (r) => { await api.put(`/role-permissions/${r}`, snapshot[r]); },
      { isAlreadyDone: () => false, signal: ctrl.signal },
    );
    if (!alive.current) return;
    setData((prev) => prev && {
      ...prev,
      roles: prev.roles.map((rd) => (result.done.includes(rd.role) ? { ...rd, ...snapshot[rd.role], isCustom: true } : rd)),
    });
    setDraft((prev) => {
      const next = { ...prev };
      result.done.forEach((r) => { delete next[r]; });
      return next;
    });
    setFailures(result.errors);
    setSaving(false);
    showToast(batchSummaryText(result, { one: 'papel salvo', many: 'papéis salvos' }), result.failed.length ? 'error' : 'success');
    await load();
  };

  const confirmReset = async () => {
    if (!resetRole) return;
    const r = resetRole;
    await api.delete(`/role-permissions/${r}`);
    setDraft((prev) => { const next = { ...prev }; delete next[r]; return next; });
    setFailures((prev) => { const next = { ...prev }; delete next[r]; return next; });
    setResetRole(null);
    showToast(`Padrão restaurado: ${roleLabel(r)}`, 'success');
    await load();
  };

  const n = dirtyRoles.length;
  const failed = Object.keys(failures);

  const resetButton = (r: string) => (
    <button type="button" className={styles.resetBtn} aria-label={`Restaurar o padrão de ${roleLabel(r)}`} onClick={() => setResetRole(r)} disabled={saving}>
      Restaurar padrão
    </button>
  );

  return (
    <div className={styles.page}>
      <Alert tone="info" title="O CEO pode tudo e não aparece aqui">
        Cada marca vale para todas as pessoas daquele papel. “Creditar carteira” é só do CEO e não pode ser delegada.
      </Alert>

      {failed.length > 0 && (
        <Alert tone="error" title="Algumas mudanças não foram salvas">
          <ul className={styles.failList}>
            {failed.map((r) => <li key={r}>{roleLabel(r)}: {failures[r]}</li>)}
          </ul>
        </Alert>
      )}
      {loadError && (
        <Alert tone="error" action={{ label: 'Tentar de novo', onClick: () => { void load(); } }}>
          {loadError}
        </Alert>
      )}

      {desktop ? (
        <div className={styles.matrixWrap}>
          <table className={styles.matrix}>
            <caption className={styles.caption}>Permissões por papel</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.permCol}>Pode…</th>
                {roles.map((r) => (
                  <th scope="col" key={r} className={styles.roleCol}>
                    <span className={styles.roleName}>{roleLabel(r)}</span>
                    {data.roles.find((x) => x.role === r)?.isCustom && <span className={styles.customTag}>Customizado</span>}
                    {resetButton(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <Fragment key={cat}>
                  <tr className={styles.catRow}><th scope="colgroup" colSpan={roles.length + 1}>{cat}</th></tr>
                  {data.allPermissions.filter((p) => p.category === cat).map((p) => (
                    <tr key={p.key}>
                      <th scope="row" className={styles.permCell}>
                        <span className={styles.permLabel}>{p.label}</span>
                      </th>
                      {roles.map((r) => (
                        <td key={r} className={styles.cell}>
                          <PermCheck
                            label={`${p.label} · ${roleLabel(r)}`}
                            checked={current(r).permissions.includes(p.key)}
                            changed={permChanged(r, p.key)}
                            disabled={CEO_ONLY.includes(p.key) || saving}
                            onToggle={() => togglePerm(r, p.key)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={`${blocks.block} ${styles.mobileList}`}>
          <div className={styles.mobileHead}>
            <Select label="Papel" value={mRole} onChange={setMobileRole} options={roles.map((r) => ({ value: r, label: roleLabel(r) }))} />
            {resetButton(mRole)}
          </div>
          {categories.map((cat) => (
            <section key={cat} className={styles.mobileCat}>
              <h3 className={styles.catTitle}>{cat}</h3>
              {data.allPermissions.filter((p) => p.category === cat).map((p) => (
                <PermCheck
                  key={p.key}
                  text={p.label}
                  label={`${p.label} · ${roleLabel(mRole)}`}
                  checked={current(mRole).permissions.includes(p.key)}
                  changed={permChanged(mRole, p.key)}
                  disabled={CEO_ONLY.includes(p.key) || saving}
                  onToggle={() => togglePerm(mRole, p.key)}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      <section className={blocks.block} aria-labelledby="perm-notify-title">
        <h2 id="perm-notify-title" className={blocks.blockTitle}>Pode enviar avisos para</h2>
        <p className={blocks.muted}>Vale para o papel que tem “Criar notificação” ou “Enviar broadcast”.</p>
        {desktop ? (
          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <caption className={styles.caption}>Avisos por papel</caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.permCol}>Avisar…</th>
                  {roles.map((r) => <th scope="col" key={r} className={styles.roleCol}><span className={styles.roleName}>{roleLabel(r)}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {roles.map((t) => (
                  <tr key={t}>
                    <th scope="row" className={styles.permCell}><span className={styles.permLabel}>{roleLabel(t)}</span></th>
                    {roles.map((r) => (
                      <td key={r} className={styles.cell}>
                        <PermCheck
                          label={`Avisar ${roleLabel(t)} · ${roleLabel(r)}`}
                          checked={current(r).notificationTargets.includes(t)}
                          changed={targetChanged(r, t)}
                          disabled={!canNotify(r) || saving}
                          onToggle={() => toggleTarget(r, t)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.mobileCat}>
            {roles.map((t) => (
              <PermCheck
                key={t}
                text={roleLabel(t)}
                label={`Avisar ${roleLabel(t)} · ${roleLabel(mRole)}`}
                checked={current(mRole).notificationTargets.includes(t)}
                changed={targetChanged(mRole, t)}
                disabled={!canNotify(mRole) || saving}
                onToggle={() => toggleTarget(mRole, t)}
              />
            ))}
          </div>
        )}
      </section>

      <div className={styles.saveBar}>
        <span className={blocks.muted}>{n === 0 ? 'Nenhuma mudança' : `${n} ${n === 1 ? 'papel alterado' : 'papéis alterados'}`}</span>
        <Button variant="secondary" onClick={() => setDraft({})} disabled={n === 0 || saving}>Descartar</Button>
        <Button onClick={save} loading={saving} disabled={n === 0}>
          {n === 0 ? 'Salvar' : `Salvar ${n} ${n === 1 ? 'papel' : 'papéis'}`}
        </Button>
      </div>

      <AdminSheet
        open={resetRole !== null}
        title={resetRole ? `Restaurar o padrão de ${roleLabel(resetRole)}?` : 'Restaurar padrão'}
        onClose={() => setResetRole(null)}
        primary={{ label: 'Restaurar padrão', onClick: confirmReset }}
      >
        <p className={blocks.muted}>
          As permissões e os avisos deste papel voltam ao padrão do sistema. Mudanças não salvas deste papel são descartadas;
          as dos outros papéis continuam.
        </p>
      </AdminSheet>
    </div>
  );
}
