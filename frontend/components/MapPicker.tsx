import { useEffect, useRef } from 'react';

interface MapPickerProps {
	lat: string;
	lng: string;
	onChange: (lat: string, lng: string, address?: Partial<any>) => void;
	height?: number;
	addressForm?: any;
}

export default function MapPicker({ lat, lng, onChange, height = 300, addressForm }: MapPickerProps) {
	const mapRef = useRef<any>(null);
	const markerRef = useRef<any>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const lastGeocode = useRef<string>('');
	const onChangeRef = useRef(onChange);
	const initializedRef = useRef(false);

	// Mantém o callback mais recente sem re-rodar o init
	useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

	// Helper: parse de coordenadas com fallback
	const parseLat = (v?: string) => (v ? parseFloat(v) : NaN);
	const parseLng = (v?: string) => (v ? parseFloat(v) : NaN);

	// Inicialização do mapa — roda UMA VEZ quando o google maps fica disponível
	useEffect(() => {
		if (initializedRef.current) return;
		const tryInit = () => {
			const g = (window as any).google;
			if (!g || !g.maps || !containerRef.current) return false;

			const latNum = !Number.isNaN(parseLat(lat)) ? parseLat(lat) : -23.55052;
			const lngNum = !Number.isNaN(parseLng(lng)) ? parseLng(lng) : -46.633308;

			mapRef.current = new g.maps.Map(containerRef.current, {
				center: { lat: latNum, lng: lngNum },
				zoom: 16,
				mapTypeControl: false,
				streetViewControl: false,
				fullscreenControl: false,
			});
			markerRef.current = new g.maps.Marker({
				position: { lat: latNum, lng: lngNum },
				map: mapRef.current,
				draggable: true,
			});

			markerRef.current.addListener('dragend', (e: any) => {
				const newLat = e.latLng.lat();
				const newLng = e.latLng.lng();
				const geocoder = new g.maps.Geocoder();
				geocoder.geocode({ location: { lat: newLat, lng: newLng } }, (results: any, status: any) => {
					if (status === 'OK' && results[0]) {
						const components = results[0].address_components;
						let street = '', number = '', neighborhood = '', city = '', state = '', zip = '';
						components.forEach((comp: any) => {
							if (comp.types.includes('route')) street = comp.long_name;
							if (comp.types.includes('street_number')) number = comp.long_name;
							if (comp.types.includes('sublocality') || comp.types.includes('sublocality_level_1')) neighborhood = comp.long_name;
							if (!neighborhood && comp.types.includes('political') && comp.types.includes('sublocality')) neighborhood = comp.long_name;
							if (comp.types.includes('administrative_area_level_2')) city = comp.long_name;
							if (comp.types.includes('administrative_area_level_1')) state = comp.short_name;
							if (comp.types.includes('postal_code')) zip = comp.long_name;
						});
						// Marca essa string como já geocodificada para evitar loop com o effect direto
						const addressString = [street, number, neighborhood, city, state, zip].filter(Boolean).join(', ');
						if (addressString) lastGeocode.current = addressString;
						onChangeRef.current(newLat.toString(), newLng.toString(), { street, number, neighborhood, city, state, zip, cep: zip });
					} else {
						onChangeRef.current(newLat.toString(), newLng.toString());
					}
				});
			});

			initializedRef.current = true;
			return true;
		};

		if (tryInit()) return;
		// google maps ainda não carregou — poll curto
		const interval = setInterval(() => {
			if (tryInit()) clearInterval(interval);
		}, 200);
		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Atualiza posição do marker quando lat/lng mudam externamente (sem reinicializar o mapa)
	useEffect(() => {
		if (!mapRef.current || !markerRef.current) return;
		const latNum = parseLat(lat);
		const lngNum = parseLng(lng);
		if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return;
		const pos = { lat: latNum, lng: lngNum };
		markerRef.current.setPosition(pos);
		mapRef.current.panTo(pos);
	}, [lat, lng]);

	// Geocoding direto: quando os campos de endereço mudam, move o pin para o local
	useEffect(() => {
		const g = (window as any).google;
		if (!g || !g.maps || !addressForm) return;
		// Aceita tanto `cep` quanto `zip`
		const cepValue = addressForm.cep || addressForm.zip;
		const addressString = [
			addressForm.street,
			addressForm.number,
			addressForm.neighborhood,
			addressForm.city,
			addressForm.state,
			cepValue,
		].filter(Boolean).join(', ');
		// Precisa ter pelo menos rua + cidade pra não fazer geocode inútil
		if (!addressForm.street || !addressForm.city) return;
		if (addressString === lastGeocode.current) return;
		lastGeocode.current = addressString;

		const geocoder = new g.maps.Geocoder();
		geocoder.geocode({ address: addressString }, (results: any, status: any) => {
			if (status === 'OK' && results[0]) {
				const loc = results[0].geometry.location;
				onChangeRef.current(loc.lat().toString(), loc.lng().toString());
			}
		});
	}, [addressForm?.street, addressForm?.number, addressForm?.neighborhood, addressForm?.city, addressForm?.state, addressForm?.cep, addressForm?.zip]);

	return <div ref={containerRef} style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden' }} />;
}
