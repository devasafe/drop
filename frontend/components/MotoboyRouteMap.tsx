import { useEffect, useRef } from 'react';

interface Point {
  lat: number;
  lng: number;
  label: string;
  color?: string;
}

interface MotoboyRouteMapProps {
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
  // Sistema de até 3 pontos
  pointA?: Point;  // Localização atual do motoboy (MOVE)
  pointB?: Point;  // Loja (busca)
  pointC?: Point;  // Cliente (entrega)
  height?: number;
}

// Estilo escuro (marca Drop). Aplicado direto em `styles` p/ não depender de mapId.
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0f0f12' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f0f12' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aa0a6' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#26262b' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a1e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0a0c' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
] as any;

const BRAND = '#6C2BD9';

const distKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const markerIcon = (color: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40">
      <circle cx="12" cy="12" r="11" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="12" cy="12" r="5" fill="white"/>
    </svg>`;
  return {
    url: 'data:image/svg+xml;base64,' + btoa(svg),
    scaledSize: new (window as any).google.maps.Size(40, 40),
    anchor: new (window as any).google.maps.Point(20, 40),
  };
};

/**
 * Mapa de acompanhamento. Otimizado: o mapa e os marcadores são criados UMA vez e
 * apenas ATUALIZADOS quando as posições mudam. A rota (Directions) é recalculada
 * com THROTTLE — não a cada atualização de GPS.
 *
 * Antes, cada mudança de posição do motoboy (a cada ~10s) recriava o mapa inteiro e
 * disparava uma nova chamada Directions → ~180 requisições numa entrega de 30 min.
 * Agora o marcador do motoboy só se move; a rota só recalcula quando ele anda
 * >150m E passaram >60s desde o último cálculo (ou na primeira vez).
 */
export default function MotoboyRouteMap({
  origin,
  destination,
  pointA,
  pointB,
  pointC,
  height = 300,
}: MotoboyRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const rendererRef = useRef<any>(null);
  const lastRouteRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    const g = (window as any).google;
    if (!g || !g.maps || !containerRef.current) return;

    const points = [pointA, pointB, pointC].filter(Boolean) as Point[];
    const legacy = !points.length && origin && destination;
    if (!points.length && !legacy) return;

    // 1) Cria o mapa UMA vez.
    if (!mapRef.current) {
      const center = points.length
        ? { lat: points[0].lat, lng: points[0].lng }
        : { lat: origin!.lat, lng: origin!.lng };
      mapRef.current = new g.maps.Map(containerRef.current, {
        center,
        zoom: 14,
        styles: DARK_STYLE,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        disableDefaultUI: true,
      });
    }
    const map = mapRef.current;

    // 2) Marcadores: cria uma vez, depois só reposiciona (motoboy MOVE).
    const upsertMarker = (key: string, p: Point) => {
      const existing = markersRef.current[key];
      const pos = { lat: p.lat, lng: p.lng };
      if (existing) {
        existing.setPosition(pos);
      } else {
        markersRef.current[key] = new g.maps.Marker({
          position: pos,
          map,
          title: p.label,
          icon: markerIcon(p.color || BRAND),
          label: { text: p.label.charAt(0), fontSize: '13px', fontWeight: 'bold', color: 'white' },
        });
      }
    };

    if (points.length) {
      if (pointA) upsertMarker('A', pointA);
      if (pointB) upsertMarker('B', pointB);
      if (pointC) upsertMarker('C', pointC);
    }

    // 3) Rota: só recalcula na primeira vez OU se o motoboy andou >150m e passou >60s.
    const routePoints = legacy
      ? [{ lat: origin!.lat, lng: origin!.lng, label: 'O' } as Point, { lat: destination!.lat, lng: destination!.lng, label: 'D' } as Point]
      : points;

    if (routePoints.length > 1) {
      const head = routePoints[0];
      const last = lastRouteRef.current;
      const now = Date.now();
      const shouldRoute =
        !last ||
        (distKm(last, head) > 0.15 && now - last.time > 60_000) ||
        now - last.time > 120_000;

      if (shouldRoute) {
        lastRouteRef.current = { lat: head.lat, lng: head.lng, time: now };
        if (!rendererRef.current) {
          rendererRef.current = new g.maps.DirectionsRenderer({
            suppressMarkers: true,
            preserveViewport: true, // não dá zoom/pan a cada recálculo
            polylineOptions: { strokeColor: BRAND, strokeWeight: 4, strokeOpacity: 0.85 },
          });
          rendererRef.current.setMap(map);
        }
        const waypoints = routePoints.slice(1, -1).map((p) => ({ location: { lat: p.lat, lng: p.lng }, stopover: true }));
        new g.maps.DirectionsService().route(
          {
            origin: { lat: routePoints[0].lat, lng: routePoints[0].lng },
            destination: { lat: routePoints[routePoints.length - 1].lat, lng: routePoints[routePoints.length - 1].lng },
            waypoints,
            travelMode: 'DRIVING',
          },
          (result: any, status: any) => {
            if (status === 'OK') rendererRef.current.setDirections(result);
          },
        );
      }
    }

    // 4) Enquadra todos os pontos UMA vez (depois deixa o usuário navegar livre).
    if (!fittedRef.current) {
      const all = points.length ? points : routePoints;
      if (all.length > 1) {
        const bounds = new g.maps.LatLngBounds();
        all.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
        map.fitBounds(bounds);
        fittedRef.current = true;
      }
    }
  }, [origin, destination, pointA?.lat, pointA?.lng, pointB?.lat, pointB?.lng, pointC?.lat, pointC?.lng]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
