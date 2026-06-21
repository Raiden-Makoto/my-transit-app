import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import SearchBox from './SearchBox';
import type { SearchViewport } from '../hooks/usePlaceSearch';
import type { SavedLocation } from '../types/location';

type Bbox = [number, number, number, number];

function BoundsWatcher({ onChange }: { onChange: (bbox: Bbox) => void }) {
  const emit = useCallback(
    (map: L.Map) => {
      // Pad the visible bounds so nearby off-screen results are still allowed.
      const b = map.getBounds().pad(0.75);
      onChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    },
    [onChange],
  );

  const map = useMapEvents({
    moveend: () => emit(map),
    zoomend: () => emit(map),
  });

  useEffect(() => {
    emit(map);
  }, [map, emit]);

  return null;
}

const blueDotIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const redPinIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function RecenterMap({ coords }: { coords: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(coords, 14);
  }, [coords, map]);
  return null;
}

export default function MapCanvas() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<SavedLocation | null>(null);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (profile) => {
        const coords: [number, number] = [profile.coords.latitude, profile.coords.longitude];
        setPosition(coords);
        setMapCenter(coords);
      },
      (err) => {
        setError(`Location access denied or unavailable: ${err.message}`);
        const fallback: [number, number] = [43.6532, -79.3832];
        setPosition(fallback);
        setMapCenter(fallback);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }, []);

  const handleLocationSelect = (location: SavedLocation) => {
    setMapCenter([location.lat, location.lon]);
    setDestination(location);
  };

  const viewport = useMemo<SearchViewport | undefined>(
    () => (mapCenter ? { lat: mapCenter[0], lon: mapCenter[1], bbox: bbox ?? undefined } : undefined),
    [mapCenter, bbox],
  );

  if (error && !position) {
    return <div className="p-4 bg-red-100 text-red-700">{error}</div>;
  }

  if (!position || !mapCenter) {
    return <div className="p-4 text-gray-600">Prompting for location services...</div>;
  }

  return (
    <div style={{ height: '100vh', width: '100%' }} className="relative">
      <SearchBox onLocationSelect={handleLocationSelect} viewport={viewport} />
      <MapContainer
        center={mapCenter}
        zoom={13}
        scrollWheelZoom={true}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <ZoomControl position="bottomright" />
        <BoundsWatcher onChange={setBbox} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position} icon={blueDotIcon}>
          <Popup>You are here</Popup>
        </Marker>
        {destination && (
          <Marker position={[destination.lat, destination.lon]} icon={redPinIcon}>
            <Popup>
              <strong>{destination.primaryText}</strong>
              {destination.secondaryText && (
                <>
                  <br />
                  {destination.secondaryText}
                </>
              )}
            </Popup>
          </Marker>
        )}
        <RecenterMap coords={mapCenter} />
      </MapContainer>
    </div>
  );
}
