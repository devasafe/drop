import axios from 'axios';

/**
 * Calcula a rota entre dois pontos usando Google Maps Directions API
 */
export interface RouteWaypoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface RouteResult {
  polyline?: string; // Encoded polyline
  waypoints: RouteWaypoint[];
  distance: number; // em metros
  duration: number; // em segundos
  steps: any[]; // Passos da rota
  overviewPolyline?: string;
}

export const calculateRoute = async (
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
  originLabel?: string,
  destinationLabel?: string
): Promise<RouteResult | null> => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ GOOGLE_MAPS_API_KEY não configurada');
      return null;
    }

    const origin = `${originLat},${originLng}`;
    const destination = `${destinationLat},${destinationLng}`;

    console.log(`🗺️ Calculando rota:`, {
      origin,
      destination,
      originLabel,
      destinationLabel
    });

    const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params: {
        origin,
        destination,
        mode: 'driving', // moto é similar a carro
        key: apiKey,
        language: 'pt-BR'
      }
    });

    if (response.data.status !== 'OK') {
      console.warn(`⚠️ Google Directions API retornou status: ${response.data.status}`);
      return null;
    }

    if (!response.data.routes || response.data.routes.length === 0) {
      console.warn('⚠️ Nenhuma rota encontrada');
      return null;
    }

    const route = response.data.routes[0];
    const leg = route.legs[0];

    return {
      polyline: route.overview_polyline?.points,
      overviewPolyline: route.overview_polyline?.points,
      waypoints: [
        {
          lat: originLat,
          lng: originLng,
          label: originLabel || 'Origem'
        },
        {
          lat: destinationLat,
          lng: destinationLng,
          label: destinationLabel || 'Destino'
        }
      ],
      distance: leg.distance?.value || 0, // em metros
      duration: leg.duration?.value || 0, // em segundos
      steps: leg.steps || []
    };
  } catch (err: any) {
    console.error('❌ Erro ao calcular rota:', err?.message);
    return null;
  }
};

/**
 * Calcula a distância em km entre dois pontos
 */
export const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 100) / 100; // 2 casas decimais
};
