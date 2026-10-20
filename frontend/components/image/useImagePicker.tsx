import { ChangeEvent, ReactNode, useCallback, useRef, useState } from 'react';
import { IMAGE_ACCEPT, IMAGE_TYPES, MAX_IMAGE_BYTES, checkMinSize, type ImageSpec } from '../../lib/imageSpecs';
import { ImageCropSheet } from './ImageCropSheet';

interface Options {
  /** Além de `error`: para a tela que avisa por toast. */
  onError?: (message: string) => void;
}

export interface ImagePicker {
  /** Espalhe num `<input>` (dentro do `<label>` que já existe na tela). */
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>;
    type: 'file';
    accept: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  };
  /** Abre o seletor de arquivo (para botão que não é `<label>`). */
  open: () => void;
  /** O Sheet de recorte; renderize em qualquer lugar da tela. */
  sheet: ReactNode;
  /** Motivo da última recusa (tipo, tamanho em MB ou imagem pequena demais), ou ''. */
  error: string;
  clearError: () => void;
}

/**
 * Escolha de imagem com recorte obrigatório: confere tipo e 5 MB, lê o tamanho natural, recusa a imagem
 * menor que a área (sem recortar nem enviar nada) e abre o enquadrador. Em "Usar foto", chama `onReady`
 * com o JPEG recortado em `spec.width × spec.height` (e a prévia em data URL).
 */
export function useImagePicker(
  spec: ImageSpec,
  onReady: (file: File, dataUrl: string) => void,
  { onError }: Options = {},
): ImagePicker {
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  // Cada escolha ganha um número; a leitura de uma escolha antiga que termina depois é descartada.
  const pickRef = useRef(0);

  const fail = useCallback((message: string) => {
    setError(message);
    onError?.(message);
  }, [onError]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const pick = ++pickRef.current;
    const current = () => pick === pickRef.current;
    setError('');
    if (!IMAGE_TYPES.includes(file.type)) { fail('Use uma imagem JPG, PNG ou WebP.'); return; }
    if (file.size > MAX_IMAGE_BYTES) { fail('A imagem pode ter até 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (!current()) return;
      const img = new Image();
      img.onload = () => {
        if (!current()) return;
        const tooSmall = checkMinSize(img.naturalWidth, img.naturalHeight, spec);
        if (tooSmall) { fail(tooSmall); return; }
        setImage(img);
      };
      img.onerror = () => { if (current()) fail('Não deu para ler a imagem. Tente outra.'); };
      img.src = reader.result as string;
    };
    reader.onerror = () => { if (current()) fail('Não deu para ler a imagem. Tente outra.'); };
    reader.readAsDataURL(file);
  };

  const sheet = (
    <ImageCropSheet
      image={image}
      spec={spec}
      onCancel={() => setImage(null)}
      onConfirm={(file, dataUrl) => { setImage(null); onReady(file, dataUrl); }}
    />
  );

  return {
    inputProps: { ref: inputRef, type: 'file', accept: IMAGE_ACCEPT, onChange },
    open: () => inputRef.current?.click(),
    sheet,
    error,
    clearError: () => setError(''),
  };
}

export default useImagePicker;
