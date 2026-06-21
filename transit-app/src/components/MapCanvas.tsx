import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { Star } from 'lucide-react';
import L from 'leaflet';
import SearchBox from './SearchBox';
import { useSavedPlaces } from '../hooks/useSavedPlaces';
import type { SearchViewport } from '../hooks/usePlaceSearch';
import type { SavedLocation } from '../types/location';

type Bbox = [number, number, number, number];

// Never search a box smaller than ~25 km half-width, so that when zoomed in
// tight we still find nearby places instead of an overly limited set.
const MIN_HALF_HEIGHT_DEG = 0.22; // ~25 km in latitude

function BoundsWatcher({ onChange }: { onChange: (bbox: Bbox) => void }) {
  const emit = useCallback(
    (map: L.Map) => {
      // Pad the visible bounds so nearby off-screen results are allowed.
      const b = map.getBounds().pad(1);
      const center = b.getCenter();

      // Enforce a minimum span so high zoom levels don't over-restrict results.
      // Scale the longitude floor by latitude so the box stays roughly square.
      const lonScale = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.1);
      const minHalfLat = MIN_HALF_HEIGHT_DEG;
      const minHalfLon = MIN_HALF_HEIGHT_DEG / lonScale;

      const halfLat = Math.max((b.getNorth() - b.getSouth()) / 2, minHalfLat);
      const halfLon = Math.max((b.getEast() - b.getWest()) / 2, minHalfLon);

      onChange([
        center.lng - halfLon,
        center.lat - halfLat,
        center.lng + halfLon,
        center.lat + halfLat,
      ]);
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
  const savedPlaces = useSavedPlaces();

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
      <SearchBox onLocationSelect={handleLocationSelect} viewport={viewport} savedPlaces={savedPlaces} />
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
              <br />
              <button
                type="button"
                onClick={() => savedPlaces.toggleSaved(destination)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  padding: '4px 10px',
                  border: '1px solid #dadce0',
                  borderRadius: 9999,
                  background: savedPlaces.isSaved(destination.id) ? '#e8f0fe' : '#fff',
                  color: '#1a73e8',
                  font: '500 13px system-ui, sans-serif',
                  cursor: 'pointer',
                }}
              >
                <Star size={14} fill={savedPlaces.isSaved(destination.id) ? 'currentColor' : 'none'} />
                {savedPlaces.isSaved(destination.id) ? 'Saved' : 'Save'}
              </button>
            </Popup>
          </Marker>
        )}
        <RecenterMap coords={mapCenter} />
      </MapContainer>
    </div>
  );
}
