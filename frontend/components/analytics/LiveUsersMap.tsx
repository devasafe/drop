import React, { useEffect, useState, useMemo, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { useSocket } from '../../contexts/SocketContext';
import { platformAnalytics, type LiveUsersSnapshot } from '../../lib/analyticsApi';
import Icon from '../Icon';
import styles from './LiveUsersMap.module.css';

// IMPORTANTE: array definido fora do componente para manter referência estável
// e evitar que useJsApiLoader re-carregue o script a cada render.
const LIBRARIES: ('visualization')[] = ['visualization'];

const MAP_STYLE_DARK: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0A0A0A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0A0A' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7C7C8A' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2A2A2A' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1A1A1A' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#5E5E6B' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#05050A' }] },
];

const ROLE_COLORS: Record<string, string> = {
  cliente: '#6C2BD9',
  lojista: '#22C55E',
  motoboy: '#F59E0B',
  ceo: '#EC4899',
};

const ROLE_LABELS: Record<string, string> = {
  cliente: 'Clientes',
  lojista: 'Lojistas',
  motoboy: 'Motoboys',
  ceo: 'CEO',
  marketing: 'Marketing',
  gerente_geral: 'Gerente Geral',
  gerente_clientes: 'Gerente Clientes',
  gerente_lojistas: 'Gerente Lojistas',
  gerente_motoboys: 'Gerente Motoboys',
};

const DEFAULT_CENTER = { lat: -23.5505, lng: -46.6333 }; // São Paulo

interface HeatmapPoint {
  lat: number;
  lng: number;
}

export default function LiveUsersMap() {
  const socket = useSocket();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded: mapsLoaded, loadError } = useJsApiLoader({
    id: 'drop-google-maps-script',
    googleMapsApiKey: apiKey || '',
    libraries: LIBRARIES,
  });
  const [snapshot, setSnapshot] = useState<LiveUsersSnapshot | null>(null);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [mapRef, setMapRef] = useState<google.maps.Map | null>(null);
  const heatmapLayerRef = useRef<google.maps.visualization.HeatmapLayer | null>(null);

  // Fetch inicial
  useEffect(() => {
    platformAnalytics.liveUsers().then(setSnapshot).catch(console.error);
  }, []);

  // Subscribe a updates via socket
  useEffect(() => {
    if (!socket?.on) return;
    const unsub = socket.on('presence:updated', (data: LiveUsersSnapshot) => {
      setSnapshot(data);
    });
    return () => unsub();
  }, [socket]);

  // Buscar heatmap quando ativado
  useEffect(() => {
    if (!heatmapMode || heatmapPoints.length > 0) return;
    setHeatmapLoading(true);
    platformAnalytics
      .userHeatmap()
      .then(d => setHeatmapPoints(d.points))
      .catch(console.error)
      .finally(() => setHeatmapLoading(false));
  }, [heatmapMode, heatmapPoints.length]);

  // Centro do mapa: média dos pontos ativos, ou default
  const center = useMemo(() => {
    const pts = snapshot?.points || [];
    if (pts.length === 0) return DEFAULT_CENTER;
    const avgLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const avgLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    return { lat: avgLat, lng: avgLng };
  }, [snapshot]);

  // Criar/destruir HeatmapLayer manualmente (evita o bug do componente
  // <HeatmapLayer> que exige <LoadScript> em vez de useJsApiLoader).
  useEffect(() => {
    if (!mapsLoaded || !mapRef) return;
    // Garantir que a lib visualization carregou
    if (!(window as any).google?.maps?.visualization?.HeatmapLayer) return;

    // Limpar layer anterior
    if (heatmapLayerRef.current) {
      heatmapLayerRef.current.setMap(null);
      heatmapLayerRef.current = null;
    }

    if (heatmapMode && heatmapPoints.length > 0) {
      const data = heatmapPoints.map(p => new google.maps.LatLng(p.lat, p.lng));
      heatmapLayerRef.current = new google.maps.visualization.HeatmapLayer({
        data,
        map: mapRef,
        radius: 20,
        opacity: 0.7,
      });
    }

    return () => {
      if (heatmapLayerRef.current) {
        heatmapLayerRef.current.setMap(null);
        heatmapLayerRef.current = null;
      }
    };
  }, [mapsLoaded, mapRef, heatmapMode, heatmapPoints]);

  if (!apiKey) {
    return (
      <div className={styles.missingKey}>
        <p><Icon name="map-pin" size={20} style={{ display: 'inline-block', marginRight: '8px' }} /> Google Maps não configurado.</p>
        <p className={styles.hint}>
          Adicione <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> ao <code>.env.local</code> para habilitar o mapa ao vivo.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.missingKey}>
        <p><Icon name="alert-triangle" size={20} style={{ display: 'inline-block', marginRight: '8px' }} /> Erro ao carregar Google Maps.</p>
        <p className={styles.hint}>Verifique se a API key é válida e se "Maps JavaScript API" está habilitada.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {mapsLoaded ? (
        <GoogleMap
          mapContainerClassName={styles.map}
          center={center}
          zoom={snapshot?.points.length ? 12 : 4}
          options={{
            styles: MAP_STYLE_DARK,
            disableDefaultUI: true,
            zoomControl: true,
            backgroundColor: '#0A0A0A',
          }}
          onLoad={m => setMapRef(m)}
        >
          {!heatmapMode &&
            snapshot?.points.map((p, i) => (
              <Marker
                key={`${p.userId}-${i}`}
                position={{ lat: p.lat, lng: p.lng }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  fillColor: ROLE_COLORS[p.role] || '#8B5CF6',
                  fillOpacity: 0.9,
                  strokeColor: '#0A0A0A',
                  strokeWeight: 2,
                  scale: 8,
                }}
                title={ROLE_LABELS[p.role] || p.role}
              />
            ))}
        </GoogleMap>
      ) : (
        <div className={styles.map} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}>
          Carregando mapa...
        </div>
      )}

      {/* Overlay com contadores */}
      <div className={styles.overlay}>
        <div className={styles.overlayTitle}>
          <span className={styles.livePulse} />
          {snapshot?.total || 0} {snapshot?.total === 1 ? 'pessoa online' : 'pessoas online'}
        </div>
        <div className={styles.overlayList}>
          {snapshot &&
            Object.entries(snapshot.byRole).map(([role, count]) => (
              <div key={role} className={styles.overlayRow}>
                <span
                  className={styles.overlayDot}
                  style={{ background: ROLE_COLORS[role] || '#8B5CF6' }}
                />
                <span>{ROLE_LABELS[role] || role}</span>
                <strong>{count}</strong>
              </div>
            ))}
        </div>
        <button
          type="button"
          className={styles.overlayToggle}
          onClick={() => setHeatmapMode(m => !m)}
        >
          {heatmapMode ? (
            <>
              <Icon name="users" size={16} style={{ marginRight: '6px' }} />
              Ver usuários online
            </>
          ) : (
            <>
              <Icon name="target" size={16} style={{ marginRight: '6px' }} />
              Ver heatmap de endereços
            </>
          )}
          {heatmapLoading && ' …'}
        </button>
      </div>
    </div>
  );
}
