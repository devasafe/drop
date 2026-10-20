import { useState, useRef, useCallback } from 'react';
// @ts-ignore
import ReactCrop from 'react-image-crop';
// @ts-ignore
import 'react-image-crop/dist/ReactCrop.css';
import { checkMinSize } from '../lib/imageSpecs';
import { cropImage, initialCrop, type PercentCrop } from './image/cropImage';
import styles from './ImageCropUploader.module.css';

interface Props {
  aspectRatio: number;       // ex: 1 para quadrado, 16/9, 3/1
  targetWidth: number;       // largura final em px
  targetHeight: number;      // altura final em px
  label?: string;            // texto do botão
  currentImageUrl?: string;  // imagem atual (preview antes de trocar)
  onFileCropped: (file: File, dataUrl: string) => void;
  disabled?: boolean;
  accept?: string;
}

export default function ImageCropUploader({
  aspectRatio,
  targetWidth,
  targetHeight,
  label = 'Selecionar imagem',
  currentImageUrl,
  onFileCropped,
  disabled = false,
  accept = 'image/jpeg,image/png,image/webp',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Imagem carregada (tamanho natural conhecido); o modal fica aberto enquanto houver uma.
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<PercentCrop>();
  const [error, setError] = useState('');

  const openFilePicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Imagem menor que o tamanho final não é recortada (sairia esticada).
        const tooSmall = checkMinSize(img.naturalWidth, img.naturalHeight, { width: targetWidth, height: targetHeight });
        if (tooSmall) { setError(tooSmall); return; }
        setCrop(initialCrop(img.naturalWidth, img.naturalHeight, aspectRatio));
        setImage(img);
      };
      img.onerror = () => setError('Não deu para ler a imagem. Tente outra.');
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = useCallback(() => {
    if (!crop || !image) return;
    const { file, dataUrl } = cropImage(image, crop, targetWidth, targetHeight);
    onFileCropped(file, dataUrl);
    setImage(null);
  }, [crop, image, targetWidth, targetHeight, onFileCropped]);

  const handleCancel = () => {
    setImage(null);
    setCrop(undefined);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className={styles.hiddenInput}
        onChange={onFileChange}
      />

      <div className={styles.trigger} onClick={openFilePicker} role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && openFilePicker()}>
        {currentImageUrl ? (
          <div className={styles.previewWrap}>
            <img src={currentImageUrl} alt="Preview" className={styles.previewImg} />
            <div className={styles.previewOverlay}>
              <span className={styles.previewOverlayText}>Trocar imagem</span>
            </div>
          </div>
        ) : (
          <div className={styles.placeholder}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className={styles.placeholderText}>{label}</span>
            <span className={styles.placeholderSub}>{targetWidth}×{targetHeight}px • JPG, PNG, WebP</span>
          </div>
        )}
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}

      {image && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Ajustar imagem</h3>
              <p className={styles.modalSub}>
                Recorte a área que deseja usar ({targetWidth}×{targetHeight}px)
              </p>
            </div>

            <div className={styles.cropArea}>
              {/* @ts-ignore */}
              <ReactCrop
                crop={crop}
                onChange={(_px: unknown, pct: PercentCrop) => setCrop(pct)}
                aspect={aspectRatio}
                keepSelection
              >
                <img
                  src={image.src}
                  alt="Para recortar"
                  className={styles.cropImg}
                />
              </ReactCrop>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={handleCancel}>
                Cancelar
              </button>
              <button
                className={styles.btnConfirm}
                onClick={handleConfirm}
                disabled={!crop?.width}
              >
                Confirmar recorte
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
