// frontend/components/seller/products/ProductForm.tsx
import { useId, useRef, useState } from 'react';
import { Video, X } from 'lucide-react';
import api from '../../../lib/api';
import ImageCropUploader from '../../ImageCropUploader';
import RichTextEditor from '../../RichTextEditor';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Button } from '../../ui/Button';
import { ProductCard } from '../../drop/ProductCard';
import { apiError, parseMoneyInput } from '../../../lib/sellerApi';
import styles from './ProductForm.module.css';

export const MAX_IMAGES = 10;
export const NEW_CATEGORY = '__nova__';

export interface ProductValues {
  name: string;
  description: string;
  price: string;
  oldPrice: string;
  quantity: string;
  category: string;
  subCategory: string;
}
export interface ProductMedia {
  /** URLs de fotos que já existem e ficam (edição). */
  kept: string[];
  added: Array<{ file: File; preview: string }>;
  video: File | null;
  videoPreview: string | null;
  existingVideo: string | null;
  removeVideo: boolean;
}
export type ProductErrors = Partial<Record<keyof ProductValues, string>>;

export const EMPTY_VALUES: ProductValues = { name: '', description: '', price: '', oldPrice: '', quantity: '1', category: '', subCategory: '' };
export const EMPTY_MEDIA: ProductMedia = { kept: [], added: [], video: null, videoPreview: null, existingVideo: null, removeVideo: false };

/** Erros por campo, na língua do lojista. Objeto vazio = pode enviar. */
export function validateProduct(v: ProductValues): ProductErrors {
  const e: ProductErrors = {};
  if (!v.name.trim()) e.name = 'Dê um nome ao produto';
  const price = parseMoneyInput(v.price);
  if (!v.price.trim()) e.price = 'Informe o preço';
  else if (!(price > 0)) e.price = 'Preço inválido. Use o formato 49,90';
  if (v.oldPrice.trim()) {
    const old = parseMoneyInput(v.oldPrice);
    if (!(old > 0)) e.oldPrice = 'Preço antigo inválido. Use o formato 59,90';
    else if (price > 0 && old <= price) e.oldPrice = 'Preço antigo precisa ser maior que o preço';
  }
  const q = Number(v.quantity);
  if (v.quantity.trim() === '' || !Number.isInteger(q) || q < 0) e.quantity = 'Informe o estoque (0 ou mais)';
  return e;
}

/** Mesmos campos do formulário antigo; na edição, oldPrice vazio remove o desconto e keepImages lista as fotos que ficam. */
export function buildProductFormData(mode: 'create' | 'edit', v: ProductValues, m: ProductMedia, storeId?: string): FormData {
  const form = new FormData();
  if (mode === 'create' && storeId) form.append('storeId', storeId);
  form.append('name', v.name.trim());
  form.append('description', v.description || '');
  form.append('price', String(parseMoneyInput(v.price)));
  const old = v.oldPrice.trim() ? parseMoneyInput(v.oldPrice) : NaN;
  if (mode === 'edit') form.append('oldPrice', Number.isFinite(old) ? String(old) : '');
  else if (Number.isFinite(old)) form.append('oldPrice', String(old));
  form.append('quantity', String(Number(v.quantity) || 0));
  const category = v.category === NEW_CATEGORY ? '' : v.category;
  if (mode === 'edit') form.append('category', category);
  else if (category) form.append('category', category);
  if (v.subCategory.trim()) form.append('subCategory', v.subCategory.trim());
  if (mode === 'edit') m.kept.forEach((url) => form.append('keepImages', url));
  m.added.forEach((img) => form.append('images', img.file));
  if (mode === 'edit' && m.removeVideo) form.append('removeVideo', 'true');
  if (m.video) form.append('video', m.video);
  return form;
}

interface Props {
  values: ProductValues;
  onChange: (v: ProductValues) => void;
  errors: ProductErrors;
  media: ProductMedia;
  onMediaChange: (m: ProductMedia) => void;
  categories: Array<{ _id: string; name: string }>;
  storeId: string;
  /** Linha de apoio do estoque (edição: "acaba em ~12 dias no ritmo atual"). */
  stockHint?: string;
}

function Photo({ src, first, onRemove }: { src: string; first: boolean; onRemove: () => void }) {
  return (
    <div className={styles.photo}>
      <img src={src} alt="" className={styles.photoImg} />
      {first && <span className={styles.badge}>Principal</span>}
      <button type="button" className={styles.remove} onClick={onRemove} aria-label="Remover foto">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ProductForm({ values, onChange, errors, media, onMediaChange, categories, storeId, stockHint }: Props) {
  const videoId = useId();
  const videoInput = useRef<HTMLInputElement>(null);
  const [newCat, setNewCat] = useState('');
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  const [created, setCreated] = useState<Array<{ _id: string; name: string }>>([]);
  const set = (k: keyof ProductValues) => (val: string) => onChange({ ...values, [k]: val });
  const total = media.kept.length + media.added.length;
  const videoSrc = media.videoPreview || (!media.removeVideo ? media.existingVideo : null);

  const createCategory = async () => {
    const name = newCat.trim();
    if (!name || !storeId) return;
    setCatBusy(true);
    setCatError(null);
    try {
      const r = await api.post('/categories', { storeId, name });
      const id = r?.data?._id ? String(r.data._id) : '';
      if (!id) throw new Error('sem id');
      setCreated((prev) => [...prev, { _id: id, name }]);
      onChange({ ...values, category: id });
      setNewCat('');
    } catch (err) {
      setCatError(apiError(err).message || 'Não deu para criar a categoria.');
    } finally {
      setCatBusy(false);
    }
  };

  const onVideo = (f: File | undefined) => {
    if (!f) return;
    if (media.videoPreview) URL.revokeObjectURL(media.videoPreview);
    onMediaChange({ ...media, video: f, videoPreview: URL.createObjectURL(f), removeVideo: false });
  };
  const dropVideo = () => {
    if (media.videoPreview) URL.revokeObjectURL(media.videoPreview);
    onMediaChange({ ...media, video: null, videoPreview: null, removeVideo: true });
    if (videoInput.current) videoInput.current.value = '';
  };

  const priceN = parseMoneyInput(values.price);
  const oldN = parseMoneyInput(values.oldPrice);
  const cover = media.kept[0] || media.added[0]?.preview;

  return (
    <div className={styles.form}>
      <section className={styles.block} aria-label="Fotos e vídeo">
        <div className={styles.head}>
          <h2 className={styles.title}>Fotos e vídeo</h2>
          <span className={styles.meta}>{`${total} de ${MAX_IMAGES}`}</span>
        </div>
        {total > 0 && (
          <div className={styles.photos}>
            {media.kept.map((url, i) => (
              <Photo key={url} src={url} first={i === 0} onRemove={() => onMediaChange({ ...media, kept: media.kept.filter((u) => u !== url) })} />
            ))}
            {media.added.map((img, i) => (
              <Photo key={img.preview} src={img.preview} first={media.kept.length === 0 && i === 0} onRemove={() => onMediaChange({ ...media, added: media.added.filter((x) => x !== img) })} />
            ))}
          </div>
        )}
        {total < MAX_IMAGES && (
          <ImageCropUploader
            aspectRatio={1}
            targetWidth={800}
            targetHeight={800}
            label={total === 0 ? 'Adicionar foto' : 'Adicionar outra foto'}
            onFileCropped={(file, dataUrl) => onMediaChange({ ...media, added: [...media.added, { file, preview: dataUrl }] })}
          />
        )}
        <p className={styles.meta}>A primeira foto vai no card. Fundo branco vende mais.</p>
        {videoSrc ? (
          <div className={styles.video}>
            <video src={videoSrc} controls className={styles.videoEl} />
            <Button variant="tertiary" size="sm" onClick={dropVideo}>Remover vídeo</Button>
          </div>
        ) : (
          <label htmlFor={videoId} className={styles.videoPick}>
            <Video size={18} aria-hidden="true" /> Adicionar vídeo (MP4, WebM ou MOV)
            <input id={videoId} ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" className={styles.hiddenInput} onChange={(e) => onVideo(e.target.files?.[0])} />
          </label>
        )}
      </section>

      <section className={styles.block} aria-label="Dados do produto">
        <Input label="Nome" value={values.name} onChange={set('name')} error={errors.name} maxLength={120} />
        <div className={styles.two}>
          <Input label="Preço" inputMode="decimal" placeholder="0,00" value={values.price} onChange={set('price')} error={errors.price} />
          <Input label="Preço antigo" inputMode="decimal" placeholder="opcional" value={values.oldPrice} onChange={set('oldPrice')} error={errors.oldPrice} hint="Com preço antigo, o card ganha o selo de desconto." />
        </div>
        <div className={styles.two}>
          <Input label="Estoque" inputMode="numeric" value={values.quantity} onChange={set('quantity')} error={errors.quantity} hint={stockHint} />
          <Select
            label="Categoria"
            value={values.category}
            onChange={set('category')}
            options={[
              { value: '', label: 'Sem categoria' },
              ...[...categories, ...created.filter((c) => !categories.some((x) => String(x._id) === c._id))].map((c) => ({ value: String(c._id), label: c.name })),
              { value: NEW_CATEGORY, label: '+ Nova categoria' },
            ]}
          />
        </div>
        {values.category === NEW_CATEGORY && (
          <div className={styles.newCat}>
            <Input label="Nome da nova categoria" value={newCat} onChange={setNewCat} error={catError || undefined} maxLength={60} />
            <Button variant="secondary" onClick={createCategory} loading={catBusy} disabled={!newCat.trim()}>Criar categoria</Button>
          </div>
        )}
        <Input label="Subcategoria" value={values.subCategory} onChange={set('subCategory')} hint="Ajuda o cliente a filtrar dentro da sua loja" maxLength={60} />
        <div className={styles.field}>
          <span className={styles.label}>Descrição</span>
          <RichTextEditor value={values.description} onChange={set('description')} placeholder="Conte o que o cliente precisa saber: tamanho, material, cor." />
        </div>
      </section>

      <section className={styles.block} aria-label="Prévia">
        <span className={styles.cap}>Assim o cliente vê</span>
        <div className={styles.preview}>
          <ProductCard
            variant="grade"
            product={{
              name: values.name.trim() || 'Nome do produto',
              price: priceN > 0 ? priceN : 0,
              oldPrice: oldN > 0 ? oldN : undefined,
              imageUrl: cover,
              stock: Number(values.quantity),
            }}
            onAdd={() => undefined}
          />
          <p className={styles.meta}>Com preço antigo, o card ganha o selo de desconto.</p>
        </div>
      </section>
    </div>
  );
}
