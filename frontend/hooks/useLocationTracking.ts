/**
 * Hook para sincronizar localização do motoboy com debouncing
 * Evita spam de eventos location:updated
 */

import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { debounceLeading } from '../utils/debounce';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export const useLocationTracking = (deliveryId?: string, enabled: boolean = false) => {
  const { emit } = useSocket();
  const watchIdRef = useRef<number | null>(null);
  const lastLocationRef = useRef<LocationData | null>(null);

  // Função para emitir localização com debouncing (máximo 1x a cada 10 segundos)
  const emitLocation = useCallback(
    debounceLeading((location: LocationData) => {
      if (!deliveryId) return;
      
      // Só emite se houve mudança significativa (>10 metros)
      if (lastLocationRef.current) {
        const latDiff = Math.abs(location.latitude - lastLocationRef.current.latitude);
        const lonDiff = Math.abs(location.longitude - lastLocationRef.current.longitude);
        
        // Aproximadamente 10 metros em graus
        if (latDiff < 0.0001 && lonDiff < 0.0001) {
          return; // Ignorar mudanças insignificantes
        }
      }
      
      lastLocationRef.current = location;
      console.log(`📍 [Location] Emitindo localização:`, location);
      emit('delivery:location_updated', {
        deliveryId,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        timestamp: new Date().toISOString()
      });
    }, 10000), // Debounce de 10 segundos
    [deliveryId, emit]
  );

  useEffect(() => {
    if (!enabled || !deliveryId || typeof navigator === 'undefined') {
      return;
    }

    // Verificar suporte a geolocation
    if (!navigator.geolocation) {
      console.error('❌ Geolocation não suportado no navegador');
      return;
    }

    console.log('📍 [Location] Iniciando rastreamento de localização...');

    // Monitorar localização com high accuracy
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        emitLocation({ latitude, longitude, accuracy });
      },
      (error) => {
        console.error('❌ [Location] Erro ao obter localização:', error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        console.log('📍 [Location] Rastreamento parado');
      }
    };
  }, [enabled, deliveryId, emitLocation]);

  return {
    isTracking: watchIdRef.current !== null,
    lastLocation: lastLocationRef.current
  };
};
