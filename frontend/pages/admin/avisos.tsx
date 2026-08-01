import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Trash2, Upload } from 'lucide-react';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { imageUrl } from '../../lib/config';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import styles from './AdminAvisos.module.css';

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

  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newImage, setNewImage] = useState('');
  const [newLink, setNewLink] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const fetchBanners = async () => {
    try {
      const res = await api.get('/banners/all');
      setBanners(Array.isArray(res.data) ? res.data : []);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBanners(); }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await api.post('/banners/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setNewImage(res.data.imageUrl);
    } catch {
      alert('Falha no upload da imagem');
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!newImage) return;
    setSaving(true);
    try {
      await api.post('/banners', {
        imageUrl: newImage,
        linkUrl: newLink.trim() || null,
        title: newTitle.trim() || null,
        sortOrder: banners.length,
      });
      setNewImage(''); setNewLink(''); setNewTitle('');
      await fetchBanners();
    } catch {
      alert('Erro ao salvar o aviso');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (b: Banner) => {
    setBanners((prev) => prev.map((x) => (x._id === b._id ? { ...x, active: !x.active } : x)));
    try { await api.patch(`/banners/${b._id}`, { active: !b.active }); } catch { fetchBanners(); }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const other = idx + dir;
    if (other < 0 || other >= banners.length) return;
    const a = banners[idx];
    const b = banners[other];
    try {
      await Promise.all([
        api.patch(`/banners/${a._id}`, { sortOrder: b.sortOrder }),
        api.patch(`/banners/${b._id}`, { sortOrder: a.sortOrder }),
      ]);
      await fetchBanners();
    } catch { fetchBanners(); }
  };

  const remove = async (b: Banner) => {
    if (!confirm('Remover este aviso?')) return;
    setBanners((prev) => prev.filter((x) => x._id !== b._id));
    try { await api.delete(`/banners/${b._id}`); } catch { fetchBanners(); }
  };

  return (
    <ProtectedRoute required_role="ceo">
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Avisos da home</h1>
          <p className={styles.subtitle}>Banners do carrossel na home do cliente (cupons, promoções, novidades).</p>
        </header>

        {/* Novo aviso */}
        <Card className={styles.newCard}>
          <h2 className={styles.sectionTitle}>Novo aviso</h2>
          <div className={styles.uploadRow}>
            {newImage ? (
              <img src={imageUrl(newImage)} alt="" className={styles.preview} />
            ) : (
              <label className={styles.dropzone}>
                <Upload size={20} />
                <span>{uploading ? 'Enviando…' : 'Enviar imagem do banner (2:1)'}</span>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </label>
            )}
          </div>
          <Input value={newTitle} onChange={setNewTitle} placeholder="Título (opcional, p/ acessibilidade)" />
          <Input value={newLink} onChange={setNewLink} placeholder="Link ao tocar (opcional): /produtos, /stores/ID ou https://…" />
          <div className={styles.newActions}>
            {newImage && <Button variant="ghost" size="sm" onClick={() => setNewImage('')}>Trocar imagem</Button>}
            <Button variant="primary" loading={saving} disabled={!newImage} onClick={handleCreate}>Publicar aviso</Button>
          </div>
        </Card>

        {/* Lista */}
        {loading ? (
          <LoadingSkeleton variant="dashboard" />
        ) : banners.length === 0 ? (
          <p className={styles.empty}>Nenhum aviso ainda. Publique o primeiro acima.</p>
        ) : (
          <div className={styles.list}>
            {banners.map((b, i) => (
              <Card key={b._id} className={`${styles.item} ${b.active ? '' : styles.inactive}`}>
                <img src={imageUrl(b.imageUrl)} alt={b.title || ''} className={styles.thumb} />
                <div className={styles.info}>
                  <div className={styles.itemTitle}>{b.title || <span className={styles.muted}>Sem título</span>}</div>
                  <div className={styles.itemLink}>{b.linkUrl || <span className={styles.muted}>Sem link</span>}</div>
                </div>
                <div className={styles.itemActions}>
                  <button type="button" className={styles.iconBtn} aria-label="Subir" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={16} /></button>
                  <button type="button" className={styles.iconBtn} aria-label="Descer" onClick={() => move(i, 1)} disabled={i === banners.length - 1}><ArrowDown size={16} /></button>
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(b)}>{b.active ? 'Ativo' : 'Inativo'}</Button>
                  <button type="button" className={styles.iconBtn} aria-label="Remover" onClick={() => remove(b)}><Trash2 size={16} /></button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
