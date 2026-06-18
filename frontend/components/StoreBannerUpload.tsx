import { useState } from 'react';
import api from '../lib/api';
import { imageUrl } from '../lib/config';
import ImageCropUploader from './ImageCropUploader';
import Icon from './Icon';
import styles from './StoreBannerUpload.module.css';

interface Props {
  currentFeaturedBanner?: string;
  currentCoverBanner?: string;
  onUploaded?: () => void;
}

type BannerType = 'featured' | 'cover';

export default function StoreBannerUpload({ currentFeaturedBanner, currentCoverBanner, onUploaded }: Props) {
  const [uploading, setUploading] = useState<BannerType | null>(null);
  const [success, setSuccess] = useState<BannerType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File, type: BannerType) => {
    setUploading(type);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('banner', file);

    try {
      await api.post(`/stores/banner?type=${type}`, formData);
      setSuccess(type);
      onUploaded?.();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Erro ao enviar banner');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}><Icon name="crown" size={20} /></span>
        <div>
          <h3 className={styles.cardTitle}>Banners Premium</h3>
          <p className={styles.cardDesc}>Configure seus banners de divulgação no app</p>
        </div>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.bannerList}>
        {/* Banner de Destaque — faixa do carrossel da home (~1400×350) */}
        <div className={styles.bannerItem}>
          <div className={styles.bannerInfo}>
            <div className={styles.bannerLabel}><Icon name="eye" size={14} /> Banner Rotativo</div>
            <div className={styles.bannerDesc}>Carrossel da homepage — 1400×350px (faixa)</div>
            {success === 'featured' && <span className={styles.successMsg}>Enviado!</span>}
          </div>
          <ImageCropUploader
            aspectRatio={1400 / 350}
            targetWidth={1400}
            targetHeight={350}
            label={currentFeaturedBanner ? 'Trocar Banner' : 'Enviar Banner'}
            currentImageUrl={currentFeaturedBanner ? imageUrl(currentFeaturedBanner) : undefined}
            onFileCropped={(file) => handleUpload(file, 'featured')}
            disabled={uploading !== null}
          />
          {uploading === 'featured' && <p className={styles.uploadingMsg}>Enviando...</p>}
        </div>

        {/* Capa do perfil — 3:1 → 1200×400 */}
        <div className={styles.bannerItem}>
          <div className={styles.bannerInfo}>
            <div className={styles.bannerLabel}><Icon name="tag" size={14} /> Capa do Perfil</div>
            <div className={styles.bannerDesc}>Hero do perfil da sua loja — 1200×400px (3:1)</div>
            {success === 'cover' && <span className={styles.successMsg}>Enviado!</span>}
          </div>
          <ImageCropUploader
            aspectRatio={3}
            targetWidth={1200}
            targetHeight={400}
            label={currentCoverBanner ? 'Trocar Capa' : 'Enviar Capa'}
            currentImageUrl={currentCoverBanner ? imageUrl(currentCoverBanner) : undefined}
            onFileCropped={(file) => handleUpload(file, 'cover')}
            disabled={uploading !== null}
          />
          {uploading === 'cover' && <p className={styles.uploadingMsg}>Enviando...</p>}
        </div>
      </div>

      <p className={styles.hint}>Formatos aceitos: JPG, PNG, WebP. Máximo 5MB.</p>
    </div>
  );
}
