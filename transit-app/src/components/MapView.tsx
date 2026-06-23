import { useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { Star, FolderPlus, Route } from 'lucide-react';
import L from 'leaflet';
import type { PlaceCollection, SavedLocation, TripLeg } from '../types/location';
import rapidTransit from '../data/rapidTransit.json';

export type Bbox = [number, number, number, number];

type CorridorMode = 'skytrain' | 'wce' | 'seabus' | 'rapidbus' | 'bline';

interface CorridorFeature {
  properties: { name: string; mode: string; color: string };
  geometry: { coordinates: number[][] };
}

// Per-mode line styling for the always-on rapid-transit overlay. SkyTrain reads
// as a bold solid line; SeaBus is dashed (it's a ferry); bus corridors are
// slightly thinner so they sit visually beneath the rail spine.
const CORRIDOR_STYLE: Record<CorridorMode, L.PathOptions> = {
  skytrain: { weight: 5, opacity: 0.9 },
  wce: { weight: 4, opacity: 0.9, dashArray: '10 6' },
  seabus: { weight: 4, opacity: 0.9, dashArray: '2 9' },
  rapidbus: { weight: 4, opacity: 0.8 },
  bline: { weight: 4, opacity: 0.8 },
};

function TransitCorridors() {
  return (
    <>
      {(rapidTransit.features as CorridorFeature[]).map((f, i) => (
        <Polyline
          key={`corridor_${i}`}
          // GeoJSON stores [lon, lat]; Leaflet wants [lat, lon].
          positions={f.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])}
          pathOptions={{ color: f.properties.color, ...CORRIDOR_STYLE[f.properties.mode as CorridorMode] }}
          interactive={false}
        />
      ))}
    </>
  );
}

// Build a teardrop map-pin marker in an arbitrary color so list pins can
// match their list's color.
function coloredPinIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="26" height="38">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 24 12 24s12-15.5 12-24C24 5.373 18.627 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4.5" fill="white"/>
    </svg>`,
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    popupAnchor: [0, -32],
  });
}

// A circular numbered badge marker for ordered trip stops.
function numberedPinIcon(n: number) {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#1a73e8;color:#fff;font:700 13px system-ui,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

function FitBounds({ places }: { places: SavedLocation[] }) {
  const map = useMap();
  useEffect(() => {
    if (places.length === 0) return;
    const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
  }, [places, map]);
  return null;
}

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

const popupBtn = (filled = false, primary = false): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  border: primary ? 'none' : '1px solid #dadce0',
  borderRadius: 9999,
  background: primary ? '#1a73e8' : filled ? '#e8f0fe' : '#fff',
  color: primary ? '#fff' : '#1a73e8',
  font: '500 13px system-ui, sans-serif',
  cursor: 'pointer',
});

interface MapViewProps {
  position: [number, number];
  mapCenter: [number, number];
  destination: SavedLocation | null;
  viewedList: PlaceCollection | null;
  tripLegs: TripLeg[] | null;
  tripStops: SavedLocation[];
  aiStops: SavedLocation[] | null;
  showCorridors: boolean;
  onBboxChange: (bbox: Bbox) => void;
  isSaved: (id: string) => boolean;
  onToggleSaved: (place: SavedLocation) => void;
  onAddToList: (place: SavedLocation) => void;
  onGetDirections: (place: SavedLocation) => void;
}

export default function MapView({
  position,
  mapCenter,
  destination,
  viewedList,
  tripLegs,
  tripStops,
  aiStops,
  showCorridors,
  onBboxChange,
  isSaved,
  onToggleSaved,
  onAddToList,
  onGetDirections,
}: MapViewProps) {
  return (
    <MapContainer
      center={mapCenter}
      zoom={13}
      scrollWheelZoom={true}
      zoomControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <ZoomControl position="bottomright" />
      <BoundsWatcher onChange={onBboxChange} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {showCorridors && <TransitCorridors />}
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
            <span style={{ display: 'inline-flex', gap: 6, marginTop: 8 }}>
              <button type="button" onClick={() => onToggleSaved(destination)} style={popupBtn(isSaved(destination.id))}>
                <Star size={14} fill={isSaved(destination.id) ? 'currentColor' : 'none'} />
                {isSaved(destination.id) ? 'Saved' : 'Save'}
              </button>
              <button type="button" onClick={() => onAddToList(destination)} style={popupBtn()}>
                <FolderPlus size={14} />
                Add to list
              </button>
              <button type="button" onClick={() => onGetDirections(destination)} style={popupBtn(false, true)}>
                <Route size={14} />
                Directions
              </button>
            </span>
          </Popup>
        </Marker>
      )}
      {viewedList?.places.map((place) => (
        <Marker key={place.id} position={[place.lat, place.lon]} icon={coloredPinIcon(viewedList.color || '#1a73e8')}>
          <Popup>
            <strong>{place.primaryText}</strong>
            {place.secondaryText && (
              <>
                <br />
                {place.secondaryText}
              </>
            )}
            <br />
            <button type="button" onClick={() => onGetDirections(place)} style={{ ...popupBtn(false, true), marginTop: 8 }}>
              <Route size={14} />
              Directions
            </button>
          </Popup>
        </Marker>
      ))}
      {viewedList && viewedList.places.length > 0 && <FitBounds places={viewedList.places} />}

      {tripLegs?.map((leg) =>
        leg.from && leg.to ? (
          <Polyline
            key={leg.id}
            positions={[
              [leg.from.lat, leg.from.lon],
              [leg.to.lat, leg.to.lon],
            ]}
            pathOptions={{ color: '#1a73e8', weight: 4, opacity: 0.75 }}
          />
        ) : null,
      )}
      {tripStops.map((stop, i) => (
        <Marker key={`${stop.id}_${i}`} position={[stop.lat, stop.lon]} icon={numberedPinIcon(i + 1)}>
          <Popup>
            <strong>{stop.primaryText}</strong>
            {stop.secondaryText && (
              <>
                <br />
                {stop.secondaryText}
              </>
            )}
          </Popup>
        </Marker>
      ))}
      {tripStops.length > 0 && <FitBounds places={tripStops} />}

      {aiStops?.map((stop, i) => (
        <Marker key={`ai_${stop.id}_${i}`} position={[stop.lat, stop.lon]} icon={numberedPinIcon(i + 1)}>
          <Popup>
            <strong>{stop.primaryText}</strong>
            {stop.secondaryText && (
              <>
                <br />
                {stop.secondaryText}
              </>
            )}
          </Popup>
        </Marker>
      ))}
      {aiStops && aiStops.length > 0 && <FitBounds places={aiStops} />}
      <RecenterMap coords={mapCenter} />
    </MapContainer>
  );
}
