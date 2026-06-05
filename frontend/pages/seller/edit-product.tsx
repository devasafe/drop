import { useEffect, useState, useRef } from 'react';
import api from '../../lib/api';
import { useRouter } from 'next/router';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import { imageUrl } from '../../lib/config';
import { useProduct, useCategories } from '../../hooks/useSync';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import ImageCropUploader from '../../components/ImageCropUploader';
import RichTextEditor from '../../components/RichTextEditor';
import styles from './ProductForm.module.css';

export default function EditProduct() {
  useRequireAuth(['lojista']);
  const router = useRouter();
  const { edit } = router.query as { edit?: string };
  const { product, loading: productLoading } = useProduct(edit);
  const { categories, loading: categoriesLoading } = useCategories(product?.storeId);

  const [saving, setSaving] = useState(false);
  const [catLoading, setCatLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [quantity, setQuantity] = useState(0);
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);

  // Imagens existentes (URLs) + novas (File)
  const MAX_IMAGES = 8;
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<Array<{ file: File; preview: string }>>([]);
  const totalImages = existingImages.length + newImages.length;

  // Vídeo
  const [existingVideo, setExistingVideo] = useState<string | null>(null);
  const [newVideoFile, setNewVideoFile] = useState<File | null>(null);
  const [newVideoPreview, setNewVideoPreview] = useState<string | null>(null);
  const [removeVideo, setRemoveVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!product) return;
    setName(product.name || '');
    setDescription(product.description || '');
    setPrice(product.price || 0);
    setQuantity(product.quantity || 0);
    setCategory(product.category || '');
    // Carrega imagens existentes
    const imgs: string[] = [];
    if (product.images?.length) {
      product.images.forEach((img: string) => imgs.push(imageUrl(img)));
    } else if (product.image) {
      imgs.push(imageUrl(product.image));
    }
    setExistingImages(imgs);
    // Carrega vídeo existente
    setExistingVideo(product.video || null);
  }, [product]);

  const handleImageCropped = (file: File, dataUrl: string) => {
    if (totalImages >= MAX_IMAGES) return;
    setNewImages((prev) => [...prev, { file, preview: dataUrl }]);
  };

  const removeExistingImage = (idx: number) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeNewImage = (idx: number) => {
    setNewImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setNewVideoFile(f);
    setNewVideoPreview(URL.createObjectURL(f));
    setRemoveVideo(false);
  };

  const handleRemoveVideo = () => {
    setExistingVideo(null);
    setNewVideoFile(null);
    if (newVideoPreview) URL.revokeObjectURL(newVideoPreview);
    setNewVideoPreview(null);
    setRemoveVideo(true);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const submit = async (e: any) => {
    e.preventDefault();
    setSaving(true);
    try {
      const form = new FormData();
      form.append('name', name);
      form.append('description', description);
      form.append('price', String(price));
      form.append('quantity', String(quantity));
      form.append('category', category);
      // Imagens existentes que permanecem
      existingImages.forEach((url) => form.append('keepImages', url));
      // Novas imagens
      newImages.forEach((img) => form.append('images', img.file));
      // Vídeo
      if (removeVideo) form.append('removeVideo', 'true');
      if (newVideoFile) form.append('video', newVideoFile);

      await api.put(`/products/${edit}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert('Produto atualizado!');
      router.push('/seller/products');
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Falha ao atualizar produto');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim() || !product?.storeId) return;
    setCatLoading(true);
    try {
      await api.post('/categories', { storeId: product.storeId, name: newCategory });
      setNewCategory('');
      setShowNewCategoryForm(false);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao criar categoria');
    } finally {
      setCatLoading(false);
    }
  };

  if (productLoading) return (
    <div className={styles.loadingScreen}>
      <LoadingSkeleton variant="form" />
    </div>
  );

  const currentVideo = newVideoPreview || existingVideo;

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.page}>
        <div className={styles.containerWide}>

          <div className={styles.header}>
            <button onClick={() => router.push('/seller/products')} className={styles.backBtn}>
              ← Meus Produtos
            </button>
            <h1 className={styles.pageTitle}>Editar Produto</h1>
            <p className={styles.pageSubtitle}>Atualize as informações do produto</p>
          </div>

          <div className={styles.twoColGrid}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Informações do Produto</h2>

              <form onSubmit={submit} className={styles.form}>

                {/* Nome */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Nome do Produto</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="ex: Smartphone Samsung A50" required className={styles.input} />
                </div>

                {/* Descrição */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Descrição</label>
                  <RichTextEditor value={description} onChange={setDescription}
                    placeholder="Descreva seu produto: características, materiais, diferenciais..." />
                </div>

                {/* Preço + Quantidade */}
                <div className={styles.formGrid2}>
                  <div>
                    <label className={styles.label}>Preço (R$)</label>
                    <input type="number" min="0" step="0.01" value={price}
                      onChange={(e) => setPrice(Number(e.target.value))} required className={styles.input} />
                  </div>
                  <div>
                    <label className={styles.label}>Quantidade</label>
                    <input type="number" min="0" value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))} required className={styles.input} />
                  </div>
                </div>

                {/* Categoria */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Categoria</label>
                  {categoriesLoading ? (
                    <p className={styles.loadingCategories}>Carregando categorias...</p>
                  ) : (
                    <div className={styles.categoryRow}>
                      <select value={category} onChange={(e) => setCategory(e.target.value)} className={styles.select}>
                        <option value="">Selecione uma categoria</option>
                        {categories.map((cat: any) => (
                          <option key={cat._id} value={cat._id}>{cat.name}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setShowNewCategoryForm(!showNewCategoryForm)}
                        className={showNewCategoryForm ? styles.btnNewCategoryActive : styles.btnNewCategory}>
                        + Nova
                      </button>
                    </div>
                  )}
                  {showNewCategoryForm && (
                    <div className={styles.newCategoryRow}>
                      <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="Nome da nova categoria" className={styles.inputFlex} />
                      <button type="button" disabled={catLoading} onClick={handleAddCategory}
                        className={styles.btnCreateCategory}>
                        {catLoading ? '...' : 'Criar'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Fotos */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    Fotos do Produto
                    <span className={styles.labelHint}> ({totalImages}/{MAX_IMAGES})</span>
                  </label>

                  {(existingImages.length > 0 || newImages.length > 0) && (
                    <div className={styles.imageGrid}>
                      {existingImages.map((url, idx) => (
                        <div key={`ex-${idx}`} className={styles.imageGridItem}>
                          {idx === 0 && newImages.length === 0 && (
                            <span className={styles.imageMainBadge}>Principal</span>
                          )}
                          <img src={url} alt={`Foto ${idx + 1}`} className={styles.imageGridThumb} />
                          <button type="button" onClick={() => removeExistingImage(idx)}
                            className={styles.imageRemoveBtn} title="Remover foto">✕</button>
                        </div>
                      ))}
                      {newImages.map((img, idx) => (
                        <div key={`new-${idx}`} className={styles.imageGridItem}>
                          {existingImages.length === 0 && idx === 0 && (
                            <span className={styles.imageMainBadge}>Principal</span>
                          )}
                          <img src={img.preview} alt={`Nova foto ${idx + 1}`} className={styles.imageGridThumb} />
                          <button type="button" onClick={() => removeNewImage(idx)}
                            className={styles.imageRemoveBtn} title="Remover foto">✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {totalImages < MAX_IMAGES && (
                    <ImageCropUploader aspectRatio={1} targetWidth={800} targetHeight={800}
                      label={totalImages === 0 ? 'Clique para adicionar fotos' : '+ Adicionar mais uma foto'}
                      onFileCropped={handleImageCropped} />
                  )}
                  {totalImages >= MAX_IMAGES && (
                    <p className={styles.imageLimitMsg}>Limite de {MAX_IMAGES} fotos atingido</p>
                  )}
                </div>

                {/* Vídeo */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Vídeo do Produto</label>
                  {currentVideo ? (
                    <div className={styles.videoPreviewWrap}>
                      <video src={currentVideo} controls className={styles.videoPreview} />
                      {newVideoFile && (
                        <div className={styles.videoInfo}>
                          <span className={styles.videoName}>{newVideoFile.name}</span>
                          <span className={styles.videoSize}>
                            {(newVideoFile.size / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" onClick={handleRemoveVideo} className={styles.removeImageBtn}>
                          ✕ Remover vídeo
                        </button>
                        <label className={styles.btnNewCategory} style={{ cursor: 'pointer' }}>
                          <input ref={videoInputRef} type="file"
                            accept="video/mp4,video/webm,video/quicktime,video/*"
                            onChange={handleVideoChange} style={{ display: 'none' }} />
                          ↑ Substituir vídeo
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className={styles.videoDropZone}>
                      <input ref={videoInputRef} type="file"
                        accept="video/mp4,video/webm,video/quicktime,video/*"
                        onChange={handleVideoChange} style={{ display: 'none' }} />
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                        stroke="rgba(139,92,246,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                      </svg>
                      <span className={styles.videoDropText}>Clique para selecionar um vídeo</span>
                      <span className={styles.videoDropHint}>MP4, WebM, MOV — até 200MB</span>
                    </label>
                  )}
                </div>

                <button type="submit" disabled={saving} className={styles.btnSubmit}>
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </form>
            </div>

            {/* Preview panel */}
            <div className={styles.draftsPanel}>
              <div className={styles.draftsCard}>
                <h2 className={styles.draftsTitle}>Preview</h2>
                <div style={{ padding: '4px 0' }}>
                  {existingImages[0] || newImages[0] ? (
                    <img
                      src={newImages[0]?.preview || existingImages[0]}
                      alt={name}
                      style={{ width: '100%', borderRadius: 10, aspectRatio: '1', objectFit: 'cover', marginBottom: 12 }}
                    />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '1', borderRadius: 10, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 40, opacity: 0.15 }}>📦</span>
                    </div>
                  )}
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'rgba(255,255,255,0.92)', marginBottom: 4 }}>
                    {name || 'Nome do produto'}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#a78bfa', marginBottom: 8 }}>
                    R$ {Number(price || 0).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                    {totalImages} foto{totalImages !== 1 ? 's' : ''} · {quantity} em estoque
                    {currentVideo ? ' · 📹 vídeo' : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
