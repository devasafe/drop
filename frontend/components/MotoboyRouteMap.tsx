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
  // Novos props para suportar até 3 pontos
  pointA?: Point;  // Localização atual do motoboy
  pointB?: Point;  // Loja (busca)
  pointC?: Point;  // Cliente (entrega)
  height?: number;
}

export default function MotoboyRouteMap({ 
  origin, 
  destination, 
  pointA, 
  pointB, 
  pointC,
  height = 300 
}: MotoboyRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!(window as any).google || !(window as any).google.maps) return;
    
    // Se estiver usando o novo sistema de 3 pontos
    const points = [pointA, pointB, pointC].filter(Boolean);
    if (points.length > 0) {
      // Calcular centro do mapa baseado nos pontos
      const center = {
        lat: points.reduce((sum, p) => sum + p!.lat, 0) / points.length,
        lng: points.reduce((sum, p) => sum + p!.lng, 0) / points.length,
      };

      const map = new (window as any).google.maps.Map(mapRef.current, {
        center,
        zoom: 13,
      });

      // Criar marcadores para cada ponto
      points.forEach((point) => {
        const markerColor = point!.color || '#667eea';
        
        // SVG customizado para o marcador
        const svg = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40">
            <circle cx="12" cy="12" r="11" fill="${markerColor}" stroke="white" stroke-width="2"/>
            <circle cx="12" cy="12" r="5" fill="white"/>
          </svg>
        `;

        new (window as any).google.maps.Marker({
          position: { lat: point!.lat, lng: point!.lng },
          map,
          title: point!.label,
          icon: {
            url: 'data:image/svg+xml;base64,' + btoa(svg),
            scaledSize: new (window as any).google.maps.Size(40, 40),
            anchor: new (window as any).google.maps.Point(20, 40),
          },
          label: {
            text: point!.label.charAt(0), // Primeira letra (A, B ou C)
            fontSize: '14px',
            fontWeight: 'bold',
            color: 'white',
          },
        });

        // Adicionar InfoWindow ao clicar
        const infoWindow = new (window as any).google.maps.InfoWindow({
          content: `<div style="font-size: 13px; color: #1f2937;"><strong>${point!.label}</strong></div>`,
        });

        const marker = new (window as any).google.maps.Marker({
          position: { lat: point!.lat, lng: point!.lng },
          map,
          title: point!.label,
        });
        marker.addListener('click', () => infoWindow.open(map, marker));
      });

      // Se houver mais de 1 ponto, desenhar rota
      if (points.length > 1) {
        const directionsService = new (window as any).google.maps.DirectionsService();
        const directionsRenderer = new (window as any).google.maps.DirectionsRenderer({
          suppressMarkers: true, // Não mostrar marcadores padrão da direção
          polylineOptions: {
            strokeColor: '#667eea',
            strokeWeight: 3,
            strokeOpacity: 0.7,
          },
        });
        directionsRenderer.setMap(map);

        // Criar waypoints intermediários
        const waypoints = [];
        for (let i = 1; i < points.length - 1; i++) {
          waypoints.push({
            location: { lat: points[i]!.lat, lng: points[i]!.lng },
            stopover: true,
          });
        }

        directionsService.route(
          {
            origin: { lat: points[0]!.lat, lng: points[0]!.lng },
            destination: { lat: points[points.length - 1]!.lat, lng: points[points.length - 1]!.lng },
            waypoints,
            travelMode: 'DRIVING',
          },
          (result: any, status: any) => {
            if (status === 'OK') {
              directionsRenderer.setDirections(result);
            }
          }
        );
      }
    } 
    // Fallback para o sistema antigo (origem + destino)
    else if (origin && destination && origin.lat && origin.lng && destination.lat && destination.lng) {
      const map = new (window as any).google.maps.Map(mapRef.current, {
        center: origin,
        zoom: 14,
      });
      const directionsService = new (window as any).google.maps.DirectionsService();
      const directionsRenderer = new (window as any).google.maps.DirectionsRenderer();
      directionsRenderer.setMap(map);
      directionsService.route(
        {
          origin,
          destination,
          travelMode: 'DRIVING',
        },
        (result: any, status: any) => {
          if (status === 'OK') {
            directionsRenderer.setDirections(result);
          }
        }
      );
    }
  }, [origin, destination, pointA, pointB, pointC]);

  return <div ref={mapRef} style={{ width: '100%', height }} />;
}
