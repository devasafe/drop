import { useState, useRef } from 'react';
import api from '../../lib/api';
import { useRouter } from 'next/router';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useStores, useCategories } from '../../hooks/useSync';
import { useAuth } from '../../contexts/AuthContext';
import ImageCropUploader from '../../components/ImageCropUploader';
import RichTextEditor from '../../components/RichTextEditor';
import styles from './ProductForm.module.css';

export default function CreateProduct() {
  useRequireAuth(['lojista']);
  const { user } = useAuth();
  const { stores } = useStores();
  const userId = user?.id?.toString() || user?._id?.toString() || '';
  const myStore = stores?.find((s: any) => s.ownerId?.toString() === userId);

  const { categories } = useCategories(myStore?._id);

  const storeId = myStore?._id?.toString() || '';
  const [loading, setLoading] = useState(false);
  const [catLoading, setCatLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [quantity, setQuantity] = useState(0);
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');

  // Múltiplas imagens
  const MAX_IMAGES = 8;
  const [images, setImages] = useState<Array<{ file: File; preview: string }>>([]);
  const handleImageCropped = (file: File, dataUrl: string) => {
    if (images.length >= MAX_IMAGES) return;
    setImages((prev) => [...prev, { file, preview: dataUrl }]);
  };
  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  // Vídeo
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setVideoFile(f);
    setVideoPreview(URL.createObjectURL(f));
  };
  const removeVideo = () => {
    setVideoFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const [drafts, setDrafts] = useState<any[]>([]);
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const router = useRouter();


  const addDraft = (e: any) => {
    e.preventDefault();
    if (!name.trim()) return alert('Preencha o nome do produto');
    if (!storeId) return alert('Loja não encontrada. Aguarde carregar ou recarregue a página.');
    if (!price || price < 0) return alert('Insira um preço válido');
    if (!quantity || quantity < 0) return alert('Insira uma quantidade válida');
    setDrafts((prev) => [...prev, { storeId, name, description, price, quantity, category, images: [...images], videoFile, videoPreview }]);
    resetForm();
  };

  const resetForm = () => {
    setName(''); setDescription(''); setPrice(0); setQuantity(0); setCategory('');
    setImages([]);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(null); setVideoPreview(null);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const launchAll = async () => {
    if (drafts.length === 0) return;
    setLoading(true);
    try {
      let successCount = 0;
      for (const draft of drafts) {
        const form = new FormData();
        form.append('storeId', draft.storeId);
        form.append('name', draft.name);
        form.append('description', draft.description || '');
        form.append('price', String(Number(draft.price)));
        form.append('quantity', String(Number(draft.quantity) || 0));
        if (draft.category) form.append('category', draft.category);
        for (const img of draft.images || []) form.append('images', img.file);
        if (draft.videoFile) form.append('video', draft.videoFile);
        await api.post('/products', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        successCount++;
      }
      setDrafts([]);
      alert(`${successCount} produto(s) criado(s) com sucesso!`);
      router.push('/seller/products');
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Falha ao lançar produtos');
    } finally {
      setLoading(false);
    }
  };

  // Criação rápida de categoria
  const handleAddCategory = async () => {
    if (!newCategory.trim() || !storeId) return;
    setCatLoading(true);
    try {
      await api.post('/categories', { storeId, name: newCategory });
      setNewCategory('');
      setShowNewCategoryForm(false);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao criar categoria');
    } finally {
      setCatLoading(false);
    }
  };

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.page}>
        <div className={styles.containerWide}>

          {/* Header */}
          <div className={styles.header}>
            <button
              onClick={() => router.push('/seller/products')}
              className={styles.backBtn}
            >
              ← Meus Produtos
            </button>
            <h1 className={styles.pageTitle}>
              Criar Produto
            </h1>
            <p className={styles.pageSubtitle}>
              Adicione novos produtos à sua loja
            </p>
          </div>

          <div className={styles.twoColGrid}>

            {/* Formulário */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                Informações do Produto
              </h2>

              <form onSubmit={addDraft} className={styles.form}>
                {/* Nome */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Nome do Produto</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ex: Smartphone Samsung A50"
                    required
                    className={styles.input}
                  />
                </div>

                {/* Descrição — Editor Rico */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Descrição</label>
                  <RichTextEditor
                    value={description}
                    onChange={setDescription}
                    placeholder="Descreva seu produto: características, materiais, diferenciais..."
                  />
                </div>

                {/* Preço + Quantidade */}
                <div className={styles.formGrid2}>
                  <div>
                    <label className={styles.label}>Preço (R$)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={price}
                      onChange={(e) => setPrice(Number(e.target.value))}
                      required
                      className={styles.input}
                    />
                  </div>
                  <div>
                    <label className={styles.label}>Quantidade</label>
                    <input
                      type="number" min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      required
                      className={styles.input}
                    />
                  </div>
                </div>

                {/* Categoria */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Categoria</label>
                  {catLoading ? (
                    <p className={styles.loadingCategories}>Carregando categorias...</p>
                  ) : (
                    <div className={styles.categoryRow}>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className={styles.select}
                      >
                        <option value="">Selecione uma categoria</option>
                        {categories.map((cat: any) => (
                          <option key={cat._id} value={cat._id}>{cat.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewCategoryForm(!showNewCategoryForm)}
                        className={showNewCategoryForm ? styles.btnNewCategoryActive : styles.btnNewCategory}
                      >
                        + Nova
                      </button>
                    </div>
                  )}

                  {showNewCategoryForm && (
                    <div className={styles.newCategoryRow}>
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="Nome da nova categoria"
                        className={styles.inputFlex}
                      />
                      <button
                        type="button"
                        disabled={catLoading}
                        onClick={handleAddCategory}
                        className={styles.btnCreateCategory}
                      >
                        {catLoading ? '...' : 'Criar'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Fotos — múltiplas */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    Fotos do Produto
                    <span className={styles.labelHint}> ({images.length}/{MAX_IMAGES})</span>
                  </label>
                  {images.length > 0 && (
                    <div className={styles.imageGrid}>
                      {images.map((img, idx) => (
                        <div key={idx} className={styles.imageGridItem}>
                          {idx === 0 && <span className={styles.imageMainBadge}>Principal</span>}
                          <img src={img.preview} alt={`Foto ${idx + 1}`} className={styles.imageGridThumb} />
                          <button type="button" onClick={() => removeImage(idx)}
                            className={styles.imageRemoveBtn} title="Remover foto">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {images.length < MAX_IMAGES && (
                    <ImageCropUploader
                      aspectRatio={1}
                      targetWidth={800}
                      targetHeight={800}
                      label={images.length === 0 ? 'Clique para adicionar fotos' : '+ Adicionar mais uma foto'}
                      onFileCropped={handleImageCropped}
                    />
                  )}
                  {images.length >= MAX_IMAGES && (
                    <p className={styles.imageLimitMsg}>Limite de {MAX_IMAGES} fotos atingido</p>
                  )}
                </div>

                {/* Vídeo */}
                <div className={styles.formGroup}>
                  <label className={styles.label}>Vídeo do Produto</label>
                  {videoPreview ? (
                    <div className={styles.videoPreviewWrap}>
                      <video src={videoPreview} controls className={styles.videoPreview} />
                      <div className={styles.videoInfo}>
                        <span className={styles.videoName}>{videoFile?.name}</span>
                        <span className={styles.videoSize}>
                          {videoFile ? (videoFile.size / (1024 * 1024)).toFixed(1) + ' MB' : ''}
                        </span>
                      </div>
                      <button type="button" onClick={removeVideo} className={styles.removeImageBtn}>
                        ✕ Remover vídeo
                      </button>
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

                <button type="submit" className={styles.btnSubmit}>
                  + Adicionar ao Rascunho
                </button>
              </form>
            </div>

            {/* Rascunhos */}
            <div className={styles.draftsPanel}>
              <div className={styles.draftsCard}>
                <h2 className={styles.draftsTitle}>
                  Rascunhos <span className={styles.draftsCount}>({drafts.length})</span>
                </h2>

                {drafts.length === 0 ? (
                  <div className={styles.draftsEmpty}>
                    <p className={styles.draftsEmptyText}>Nenhum produto em rascunho ainda</p>
                  </div>
                ) : (
                  <div className={styles.draftsList}>
                    {drafts.map((draft, idx) => (
                      <div key={idx} className={styles.draftItem}>
                        {draft.images?.[0] && (
                          <img src={draft.images[0].preview} alt="Preview" className={styles.draftThumb} />
                        )}
                        <div className={styles.draftInfo}>
                          <div className={styles.draftName}>{draft.name}</div>
                          {draft.images?.length > 1 && (
                            <div className={styles.draftImgCount}>{draft.images.length} fotos</div>
                          )}
                          {draft.videoFile && (
                            <div className={styles.draftVideoTag}>📹 Vídeo incluído</div>
                          )}
                          <div className={styles.draftMeta}>
                            <span>R$ <strong className={styles.draftPrice}>{Number(draft.price).toFixed(2)}</strong></span>
                            <span>{draft.quantity} un</span>
                            {draft.category && categories.find((c: any) => c._id === draft.category) && (
                              <span>{categories.find((c: any) => c._id === draft.category)?.name}</span>
                            )}
                          </div>
                        </div>
                        <button type="button" onClick={() => setDrafts(drafts.filter((_, i) => i !== idx))}
                          className={styles.draftRemoveBtn}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {drafts.length > 0 && (
                <button onClick={launchAll} disabled={loading} className={styles.btnLaunchAll}>
                  {loading ? 'Enviando...' : `Lançar Todos (${drafts.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
