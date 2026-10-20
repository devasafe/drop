import { useCallback, useEffect, useId, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2, Upload } from 'lucide-react';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import AdminShell from '../../components/admin/AdminShell';
import { AdminSheet } from '../../components/admin/AdminSheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { imageUrl } from '../../lib/config';
import { adminErrorMessage } from '../../lib/adminErrors';
import { IMAGE_SPECS, specHint } from '../../lib/imageSpecs';
import { useImagePicker } from '../../components/image/useImagePicker';
import blocks from '../../components/admin/AdminBlocks.module.css';
import styles from '../../components/admin/comunicacao/Avisos.module.css';

/**
 * Avisos e broadcasts · Avisos da home (D3a, tela 20; só o CEO, como hoje). Banners do carrossel do Início:
 * GET /banners/all, POST /banners/upload, POST /banners, PATCH /banners/:id ({ active } ou { sortOrder }), DELETE /banners/:id.
 */
interface Banner {
  _id: string;
  imageUrl: string;
  linkUrl?: string | null;
  title?: string | null;
  active: boolean;
  sortOrder: number;
}

export default function AdminAvisos() {
  useRequireAuth(['ceo']);
  return (
    <ProtectedRoute required_role="ceo">
      <AdminShell title="Avisos e broadcasts · Avisos da home" tabs="comunicacao">
        <AvisosBody />
      </AdminShell>
    </ProtectedRoute>
  );
}

function AvisosBody() {
  const { showToast } = useToast();
  const newId = useId();
  const listId = useId();
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newImage, setNewImage] = useState('');
  const [newLink, setNewLink] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [toRemove, setToRemove] = useState<Banner | null>(null);

  const fetchBanners = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.get('/banners/all');
      setBanners(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setLoadError(adminErrorMessage(err, 'Não deu para ler os avisos.'));
    }
  }, []);

  useEffect(() => { fetchBanners(); }, [fetchBanners]);

  // A imagem passa pelo recorte 2:1 e sobe já em 1200 × 600 (o carrossel do Início).
  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await api.post('/banners/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setNewImage(res.data.imageUrl);
    } catch (err) {
      showToast(adminErrorMessage(err, 'Falha no upload da imagem'), 'error');
    } finally {
      setUploading(false);
    }
  };
  const toastError = useCallback((message: string) => showToast(message, 'error'), [showToast]);
  const picker = useImagePicker(IMAGE_SPECS.promoBanner, handleFile, { onError: toastError });

  const handleCreate = async () => {
    if (!newImage || !banners) return;
    setSaving(true);
    try {
      await api.post('/banners', {
        imageUrl: newImage,
        linkUrl: newLink.trim() || null,
        title: newTitle.trim() || null,
        sortOrder: banners.length,
      });
      setNewImage('');
      setNewLink('');
      setNewTitle('');
      showToast('Aviso publicado', 'success');
      await fetchBanners();
    } catch (err) {
      showToast(adminErrorMessage(err, 'Erro ao salvar o aviso'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (b: Banner) => {
    setBanners((prev) => (prev ? prev.map((x) => (x._id === b._id ? { ...x, active: !x.active } : x)) : prev));
    try {
      await api.patch(`/banners/${b._id}`, { active: !b.active });
    } catch (err) {
      showToast(adminErrorMessage(err, 'Erro ao salvar o aviso'), 'error');
      fetchBanners();
    }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    if (!banners) return;
    const other = idx + dir;
    if (other < 0 || other >= banners.length) return;
    const a = banners[idx];
    const b = banners[other];
    try {
      await Promise.all([
        api.patch(`/banners/${a._id}`, { sortOrder: b.sortOrder }),
        api.patch(`/banners/${b._id}`, { sortOrder: a.sortOrder }),
      ]);
    } catch (err) {
      showToast(adminErrorMessage(err, 'Não deu para mudar a ordem'), 'error');
    }
    await fetchBanners();
  };

  const remove = async () => {
    if (!toRemove) return;
    const id = toRemove._id;
    await api.delete(`/banners/${id}`);
    setBanners((prev) => (prev ? prev.filter((x) => x._id !== id) : prev));
    setToRemove(null);
    showToast('Aviso removido', 'success');
  };

  return (
    <div className={styles.page}>
      <div className={styles.cols}>
        <section className={blocks.block} aria-labelledby={newId}>
          <h2 id={newId} className={blocks.blockTitle}>Novo aviso</h2>
          {newImage ? (
            <img src={imageUrl(newImage)} alt="" className={styles.newImage} />
          ) : (
            <label className={styles.dropzone}>
              <Upload size={20} aria-hidden="true" />
              <span>{uploading ? 'Enviando…' : 'Enviar imagem do banner'}</span>
              <span>{specHint(IMAGE_SPECS.promoBanner)}</span>
              <input {...picker.inputProps} className={styles.fileInput} disabled={uploading} />
            </label>
          )}
          {picker.sheet}
          <Input label="Título (opcional)" value={newTitle} onChange={setNewTitle} placeholder="Título (opcional, p/ acessibilidade)" />
          <Input
            label="Link ao tocar (opcional)"
            value={newLink}
            onChange={setNewLink}
            placeholder="Link ao tocar (opcional): /produtos, /stores/ID ou https://…"
          />
          <div className={blocks.actions}>
            {newImage && <Button variant="tertiary" size="sm" onClick={() => setNewImage('')}>Trocar imagem</Button>}
            <Button loading={saving} disabled={!newImage || banners === null} onClick={handleCreate}>Publicar aviso</Button>
          </div>
        </section>

        <section className={blocks.block} aria-label="Prévia na home">
          <p className={styles.cap}>Prévia na home</p>
          <div className={styles.homePreview}>
            {newImage ? (
              <img src={imageUrl(newImage)} alt={newTitle.trim() || 'Banner novo'} className={styles.previewImg} />
            ) : (
              <div className={styles.previewEmpty}>A imagem aparece aqui, no carrossel do Início do cliente.</div>
            )}
          </div>
          {newLink.trim() && <p className={blocks.muted}>Ao tocar, abre {newLink.trim()}</p>}
        </section>
      </div>

      <section className={blocks.block} aria-labelledby={listId}>
        <div className={blocks.blockHead}>
          <h2 id={listId} className={blocks.blockTitle}>Avisos da home</h2>
          <span className={blocks.muted}>Na ordem do carrossel do Início do cliente</span>
        </div>
        {loadError ? (
          <>
            <p className={blocks.errText} role="alert">{loadError}</p>
            <div><Button variant="secondary" size="sm" onClick={fetchBanners}>Tentar de novo</Button></div>
          </>
        ) : banners === null ? (
          <div aria-busy="true" aria-label="Carregando"><Skeleton height={120} /></div>
        ) : banners.length === 0 ? (
          <p className={blocks.muted}>Nenhum aviso ainda. Publique o primeiro acima.</p>
        ) : (
          <ol className={styles.grid}>
            {banners.map((b, i) => (
              <li key={b._id} className={[styles.card, !b.active && styles.inactive].filter(Boolean).join(' ')}>
                <img src={imageUrl(b.imageUrl)} alt={b.title || ''} className={styles.thumb} />
                <div className={styles.cardBody}>
                  <span className={styles.order}>{i + 1}º · {b.active ? 'ativo' : 'pausado'}</span>
                  <span className={styles.itemTitle}>{b.title || 'Sem título'}</span>
                  <span className={blocks.muted}>{b.linkUrl || 'Sem link'}</span>
                  <Switch
                    label={`Mostrar ${b.title || `o aviso ${i + 1}`} na home`}
                    checked={b.active}
                    onChange={() => toggleActive(b)}
                  />
                  <div className={styles.cardActions}>
                    <button type="button" className={styles.iconBtn} aria-label="Subir" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button type="button" className={styles.iconBtn} aria-label="Descer" onClick={() => move(i, 1)} disabled={i === banners.length - 1}>
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                    <button type="button" className={styles.iconBtn} aria-label="Remover" onClick={() => setToRemove(b)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <AdminSheet
        open={toRemove !== null}
        title="Remover este aviso?"
        onClose={() => setToRemove(null)}
        primary={{ label: 'Remover', tone: 'danger', onClick: remove }}
      >
        <p className={blocks.muted}>Sai do carrossel da home na hora. Não dá para desfazer.</p>
      </AdminSheet>
    </div>
  );
}
