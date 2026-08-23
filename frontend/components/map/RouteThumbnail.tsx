import { buildRouteThumbnailUrl, RoutePoint } from '../../lib/staticMap';
import { MAPTILER_KEY } from '../../lib/mapConfig';
import styles from './RouteThumbnail.module.css';

interface Props {
  store?: RoutePoint | null;
  customer?: RoutePoint | null;
  motoboy?: RoutePoint | null;
  polyline?: string | null;
  height?: number;
}

/**
 * Thumbnail estático da rota loja→cliente (imagem MapTiler, sem WebGL) para os
 * cards de aceitar pedido/entrega. Não renderiza nada quando falta chave ou
 * coordenadas — o card segue funcionando sem o mapa.
 */
export function RouteThumbnail({ store, customer, motoboy, polyline, height = 150 }: Props) {
  const url = buildRouteThumbnailUrl({
    store,
    customer,
    motoboy,
    polyline,
    width: 640,
    height: Math.round(height * 1.2),
    key: MAPTILER_KEY,
  });
  if (!url) return null;

  return (
    <div className={styles.wrap} style={{ height }}>
      <img className={styles.img} src={url} alt="Rota da entrega" loading="lazy" />
    </div>
  );
}

export default RouteThumbnail;
