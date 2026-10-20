import { useEffect, useState } from 'react';
// @ts-ignore
import ReactCrop from 'react-image-crop';
// @ts-ignore
import 'react-image-crop/dist/ReactCrop.css';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import type { ImageSpec } from '../../lib/imageSpecs';
import { cropImage, initialCrop, type PercentCrop } from './cropImage';
import styles from './ImageCropSheet.module.css';

interface Props {
  /** Imagem já carregada (tamanho natural conhecido); `null` fecha o Sheet. */
  image: HTMLImageElement | null;
  spec: ImageSpec;
  onCancel: () => void;
  onConfirm: (file: File, dataUrl: string) => void;
}

/** Enquadrador travado na proporção da área; "Usar foto" exporta no tamanho exato (`spec.width × spec.height`). */
export function ImageCropSheet({ image, spec, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState<PercentCrop | undefined>();
  // Largura mínima do recorte na tela: abaixo disso o trecho teria menos pixels que a área.
  const [minWidth, setMinWidth] = useState<number | undefined>();
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    setMinWidth(undefined);
    setCrop(image ? initialCrop(image.naturalWidth, image.naturalHeight, spec.ratio) : undefined);
  }, [image, spec.ratio]);

  const confirm = () => {
    if (!image || !crop) return;
    try {
      const { file, dataUrl } = cropImage(image, crop, spec.width, spec.height);
      onConfirm(file, dataUrl);
    } catch {
      setError('Não deu para recortar a imagem. Tente outra.');
    }
  };

  return (
    <Sheet open={!!image} onClose={onCancel} title={`Enquadrar ${spec.label}`}>
      <div className={styles.body}>
        <div className={styles.area}>
          {image && (
            // @ts-ignore
            <ReactCrop
              crop={crop}
              onChange={(_px: unknown, pct: PercentCrop) => setCrop(pct)}
              aspect={spec.ratio}
              keepSelection
              minWidth={minWidth}
            >
              <img
                src={image.src}
                alt="Imagem para enquadrar"
                className={styles.img}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  if (el.naturalWidth) setMinWidth((spec.width * el.width) / el.naturalWidth);
                }}
              />
            </ReactCrop>
          )}
        </div>
        <p className={styles.meta}>{`Sai em ${spec.width} × ${spec.height} px. Arraste para escolher o trecho.`}</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button onClick={confirm} disabled={!crop}>Usar foto</Button>
        </div>
      </div>
    </Sheet>
  );
}

export default ImageCropSheet;
