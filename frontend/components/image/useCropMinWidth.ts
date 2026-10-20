import { useEffect, useState } from 'react';

/**
 * Piso do recorte na tela (`minWidth` do ReactCrop, em px exibidos): o trecho escolhido nunca tem menos
 * pixels que a largura de saída, para a imagem não sair ampliada. Acompanha a largura exibida da <img>
 * (ResizeObserver), porque ela muda quando o celular gira ou a janela muda de tamanho.
 * Passe `ref` e `onLoad` para a <img> que fica dentro do ReactCrop.
 */
export function useCropMinWidth(outputWidth: number) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [displayWidth, setDisplayWidth] = useState(0);

  useEffect(() => {
    if (!img) return undefined;
    const measure = () => setDisplayWidth(img.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(img);
    return () => observer.disconnect();
  }, [img]);

  const natural = img?.naturalWidth ?? 0;
  // floor: o arredondamento não pode deixar o piso acima do maior recorte possível.
  const minWidth = natural && displayWidth ? Math.floor((outputWidth * displayWidth) / natural) : undefined;

  return {
    ref: setImg,
    onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => setDisplayWidth(e.currentTarget.clientWidth),
    minWidth,
  };
}
