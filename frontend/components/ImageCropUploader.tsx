import { useState, useRef, useCallback } from 'react';
// @ts-ignore
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
// @ts-ignore
import 'react-image-crop/dist/ReactCrop.css';
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

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
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
  const imgRef = useRef<HTMLImageElement>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [rawSrc, setRawSrc] = useState<string>('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

  const openFilePicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawSrc(reader.result as string);
      setCrop(undefined);
      setCompletedCrop(undefined);
      setModalOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight, width: displayWidth, height: displayHeight } = e.currentTarget;
    const initial = centerAspectCrop(naturalWidth, naturalHeight, aspectRatio);
    setCrop(initial);
    // Habilita o botão "Confirmar" imediatamente sem precisar arrastar o crop.
    // completedCrop deve usar dimensões de EXIBIÇÃO (não naturais), pois handleConfirm
    // aplica scaleX/scaleY para converter de display → natural.
    setCompletedCrop({
      unit: 'px',
      x: (initial.x / 100) * displayWidth,
      y: (initial.y / 100) * displayHeight,
      width: (initial.width / 100) * displayWidth,
      height: (initial.height / 100) * displayHeight,
    });
  }, [aspectRatio]);

  const handleConfirm = useCallback(() => {
    if (!completedCrop || !imgRef.current) return;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      targetWidth,
      targetHeight
    );

    // Usar toDataURL (síncrono) em vez de toBlob (assíncrono) para evitar falhas silenciosas
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    const croppedFile = new File([u8arr], 'imagem.jpg', { type: mime });

    onFileCropped(croppedFile, dataUrl);
    setModalOpen(false);
    setRawSrc('');
  }, [completedCrop, targetWidth, targetHeight, onFileCropped]);

  const handleCancel = () => {
    setModalOpen(false);
    setRawSrc('');
    setCrop(undefined);
    setCompletedCrop(undefined);
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

      {modalOpen && (
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
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspectRatio}
                minWidth={50}
              >
                <img
                  ref={imgRef}
                  src={rawSrc}
                  alt="Para recortar"
                  className={styles.cropImg}
                  onLoad={onImageLoad}
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
                disabled={!completedCrop?.width}
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
