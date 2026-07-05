import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { FolderPlus, Route, Clock } from 'lucide-react';
import L from 'leaflet';
import type { PlaceCollection, SavedLocation, TripLeg } from '../types/location';
import type { OtpLeg, RouteStatus } from '../services/otp';
import { fetchVehiclePositions, type VehiclePosition } from '../services/otp';
import { isTransitStop } from '../services/geocode';
import rapidTransit from '../data/rapidTransit.json';

export type Bbox = [number, number, number, number];

// Operating status per corridor line, keyed by the feature `name`.
export type RouteStatusMap = Record<string, RouteStatus>;

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

// Thin the lines out when zoomed out (otherwise they look very fat at the
// metro-wide view) and let them grow toward full weight as you zoom in.
function zoomWeightFactor(zoom: number) {
  return Math.max(0.4, Math.min(1.2, 0.4 + (zoom - 10) * 0.13));
}

// Fallback colours per OTP mode when the GTFS route has no colour assigned.
const MODE_COLOR: Record<string, string> = {
  BUS: '#1a73e8',
  SUBWAY: '#0033a0',
  RAIL: '#87189d',
  TRAM: '#008522',
  FERRY: '#746661',
  GONDOLA: '#008522',
};

// Style a single OTP itinerary leg. Walking legs read as a dotted line; transit
// legs use the GTFS route colour (falling back to a per-mode default). Note:
// `dashArray` is set explicitly in BOTH branches. Leaflet's setStyle MERGES
// options, so an omitted `dashArray` would keep a stale value from whatever leg
// previously occupied the same polyline slot — making transit legs inherit the
// walking dashes and render the whole trip as if it were on foot.
function otpLegStyle(leg: OtpLeg): L.PathOptions {
  if (leg.mode === 'WALK') {
    return { color: '#5f6368', weight: 4, opacity: 0.95, dashArray: '1 8', lineCap: 'round' };
  }
  const color = leg.route?.color ? `#${leg.route.color}` : MODE_COLOR[leg.mode] ?? '#1a73e8';
  return { color, weight: 6, opacity: 1, dashArray: undefined, lineCap: 'butt' };
}

// A contrasting casing drawn beneath each leg so the active itinerary stands
// out from the always-on corridor overlay it sits on top of (e.g. a SkyTrain
// route over the same-coloured corridor line, or a SeaBus leg over the SeaBus
// corridor). White in dark mode, black in light mode.
function otpCasingStyle(leg: OtpLeg, theme: 'light' | 'dark'): L.PathOptions {
  return {
    color: theme === 'dark' ? '#ffffff' : '#000000',
    weight: leg.mode === 'WALK' ? 7 : 10,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round',
  };
}

// Fit the map to a set of raw [lat, lon] points (decoded OTP geometry).
function FitGeometry({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 16 });
  }, [points, map]);
  return null;
}

function TransitCorridors({ routeStatus }: { routeStatus: RouteStatusMap | null }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const factor = zoomWeightFactor(zoom);

  return (
    <>
      {(rapidTransit.features as CorridorFeature[])
        // Hide a line only when we KNOW it isn't running now (operating === false).
        // Unknown/unloaded status keeps the line visible so a lookup hiccup never
        // blanks the map.
        .filter((f) => !routeStatus || routeStatus[f.properties.name]?.operating !== false)
        .map((f, i) => {
        const base = CORRIDOR_STYLE[f.properties.mode as CorridorMode];
        return (
          <Polyline
            key={`corridor_${i}`}
            // GeoJSON stores [lon, lat]; Leaflet wants [lat, lon].
            positions={f.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])}
            pathOptions={{
              ...base,
              color: f.properties.color,
              weight: Math.round((base.weight ?? 4) * factor * 10) / 10,
            }}
            interactive={false}
          />
        );
      })}
    </>
  );
}

// Live bus markers for the transit legs of the shown itinerary. Polls every 30s
// (only while a route is on screen) and drops a pulsing bus at each leg's
// vehicle's current position. Legs whose trip has no live vehicle show nothing.
function LiveVehicles({ otpLegs }: { otpLegs: OtpLeg[] | null }) {
  const [vehicles, setVehicles] = useState<VehiclePosition[]>([]);

  // Serialize the trackable legs so the poller only resets when the actual
  // trips change — not on every unrelated map re-render.
  const legsKey = useMemo(
    () =>
      (otpLegs ?? [])
        .filter((l) => l.mode !== 'WALK' && l.route?.gtfsId && l.tripId)
        .map((l) => `${l.route!.gtfsId}|${l.tripId}`)
        .join(','),
    [otpLegs],
  );

  useEffect(() => {
    const legs = legsKey
      ? legsKey.split(',').map((s) => {
          const [routeId, tripId] = s.split('|');
          return { routeId, tripId };
        })
      : [];
    let active = true;
    // fetchVehiclePositions([]) resolves to [], so this also clears stale
    // markers when the route is cleared — without a synchronous setState.
    const poll = async () => {
      const v = await fetchVehiclePositions(legs);
      if (active) setVehicles(v);
    };
    poll();
    const id = legs.length > 0 ? window.setInterval(poll, 30_000) : undefined;
    return () => {
      active = false;
      if (id) window.clearInterval(id);
    };
  }, [legsKey]);

  return (
    <>
      {vehicles.map((v) => {
        const color = v.color ? `#${v.color}` : MODE_COLOR[v.mode ?? ''] ?? '#1a73e8';
        return (
          <Marker key={v.tripId} position={[v.lat, v.lon]} icon={vehicleIcon(color)} zIndexOffset={1000}>
            <Popup>
              <strong>{v.shortName || v.longName || 'Vehicle'}</strong>
              {v.stopName && <div style={{ marginTop: 2 }}>Next stop: {v.stopName}</div>}
              {v.label && <div style={{ color: '#5f6368', marginTop: 2 }}>Vehicle {v.label}</div>}
            </Popup>
          </Marker>
        );
      })}
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

// A live-vehicle marker: a coloured circular badge with a bus glyph and a
// pulsing ring, so a moving bus reads as "live" and matches its route colour.
function vehicleIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:30px;height:30px">
      <span style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.35;animation:vehiclePing 1.8s cubic-bezier(0,0,0.2,1) infinite"></span>
      <div style="position:absolute;inset:3px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.45)">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6 2 7"/><path d="M10 6h4"/><path d="m22 7-2-1"/>
          <rect width="16" height="16" x="4" y="3" rx="2"/>
          <path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/>
          <path d="M6 19v2"/><path d="M18 21v-2"/>
        </svg>
      </div>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
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

// Clamp how far the user can zoom out. Set imperatively because react-leaflet
// only reads MapContainer's minZoom prop on first init (e.g. it's ignored on
// hot-reload / prop changes).
const MIN_ZOOM = 10;

// Keep the user within the transit-service area (Metro Vancouver + Fraser Valley
// out to the West Coast Express terminus); panning to the other side of the
// world defeats the purpose of the app. [[south, west], [north, east]].
const MAX_BOUNDS = L.latLngBounds([48.9, -123.6], [49.65, -121.8]);

function MapConstraints() {
  const map = useMap();
  useEffect(() => {
    map.setMinZoom(MIN_ZOOM);
    if (map.getZoom() < MIN_ZOOM) map.setZoom(MIN_ZOOM);
    // Hard wall at the region edges (viscosity comes from the MapContainer prop).
    map.setMaxBounds(MAX_BOUNDS);
  }, [map]);
  return null;
}

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
  font: '500 12px system-ui, sans-serif',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  lineHeight: 1.2,
  cursor: 'pointer',
});

interface MapViewProps {
  position: [number, number];
  mapCenter: [number, number];
  destination: SavedLocation | null;
  viewedList: PlaceCollection | null;
  tripLegs: TripLeg[] | null;
  tripStops: SavedLocation[];
  otpLegs: OtpLeg[] | null;
  routing: boolean;
  showCorridors: boolean;
  routeStatus: RouteStatusMap | null;
  theme: 'light' | 'dark';
  onBboxChange: (bbox: Bbox) => void;
  onAddToList: (place: SavedLocation) => void;
  onGetDirections: (place: SavedLocation) => void;
  onViewDepartures: (place: SavedLocation) => void;
}

export default function MapView({
  position,
  mapCenter,
  destination,
  viewedList,
  tripLegs,
  tripStops,
  otpLegs,
  routing,
  showCorridors,
  routeStatus,
  theme,
  onBboxChange,
  onAddToList,
  onGetDirections,
  onViewDepartures,
}: MapViewProps) {
  // Memoised so the reference is stable across unrelated re-renders (e.g. map
  // pan/zoom updating the bbox); otherwise FitGeometry would refit on every
  // render and prevent the user from zooming after a route is shown.
  const otpPoints = useMemo<[number, number][]>(
    () => (otpLegs ? otpLegs.flatMap((leg) => leg.geometry) : []),
    [otpLegs],
  );
  return (
    <MapContainer
      center={mapCenter}
      zoom={13}
      minZoom={10}
      maxBounds={MAX_BOUNDS}
      maxBoundsViscosity={1.0}
      scrollWheelZoom={true}
      zoomControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <MapConstraints />
      <BoundsWatcher onChange={onBboxChange} />
      <TileLayer
        key={theme}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={
          theme === 'dark'
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        }
      />
      {showCorridors && <TransitCorridors routeStatus={routeStatus} />}
      <Marker position={position} icon={blueDotIcon}>
        <Popup>You are here</Popup>
      </Marker>
      {destination && (
        <Marker position={[destination.lat, destination.lon]} icon={redPinIcon}>
          <Popup maxWidth={400} minWidth={0}>
            <strong>{destination.primaryText}</strong>
            {destination.secondaryText && (
              <>
                <br />
                {destination.secondaryText}
              </>
            )}
            <br />
            <span style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, marginTop: 8 }}>
              <button type="button" onClick={() => onAddToList(destination)} style={popupBtn()}>
                <FolderPlus size={14} />
                Add to list
              </button>
              <button type="button" onClick={() => onGetDirections(destination)} style={popupBtn(false, true)}>
                <Route size={14} />
                Directions
              </button>
              {isTransitStop(destination) && (
                <button type="button" onClick={() => onViewDepartures(destination)} style={popupBtn()}>
                  <Clock size={14} />
                  Departures
                </button>
              )}
            </span>
          </Popup>
        </Marker>
      )}
      {viewedList?.places.map((place) => (
        <Marker key={place.id} position={[place.lat, place.lon]} icon={coloredPinIcon(viewedList.color || '#1a73e8')}>
          <Popup maxWidth={400} minWidth={0}>
            <strong>{place.primaryText}</strong>
            {place.secondaryText && (
              <>
                <br />
                {place.secondaryText}
              </>
            )}
            <br />
            <span style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, marginTop: 8 }}>
              <button type="button" onClick={() => onAddToList(place)} style={popupBtn()}>
                <FolderPlus size={14} />
                Add to list
              </button>
              <button type="button" onClick={() => onGetDirections(place)} style={popupBtn(false, true)}>
                <Route size={14} />
                Directions
              </button>
              {isTransitStop(place) && (
                <button type="button" onClick={() => onViewDepartures(place)} style={popupBtn()}>
                  <Clock size={14} />
                  Departures
                </button>
              )}
            </span>
          </Popup>
        </Marker>
      ))}
      {viewedList && viewedList.places.length > 0 && <FitBounds places={viewedList.places} />}

      {otpLegs ? (
        <>
          {/* Casings first so they sit beneath every coloured leg. */}
          {otpLegs.map((leg, i) =>
            leg.geometry.length > 1 ? (
              <Polyline key={`case_${i}`} positions={leg.geometry} pathOptions={otpCasingStyle(leg, theme)} />
            ) : null,
          )}
          {otpLegs.map((leg, i) =>
            leg.geometry.length > 1 ? (
              <Polyline key={`otp_${i}`} positions={leg.geometry} pathOptions={otpLegStyle(leg)} />
            ) : null,
          )}
          {/* Live buses currently operating this itinerary's transit legs. */}
          <LiveVehicles otpLegs={otpLegs} />
        </>
      ) : // Only fall back to straight lines once routing has finished without a
      // result (no route / error). During routing we draw nothing so the
      // straight line never flashes before the real geometry appears.
      !routing ? (
        tripLegs?.map((leg) =>
          leg.from && leg.to ? (
            <Polyline
              key={leg.id}
              positions={[
                [leg.from.lat, leg.from.lon],
                [leg.to.lat, leg.to.lon],
              ]}
              pathOptions={{ color: '#1a73e8', weight: 4, opacity: 0.75, dashArray: '6 8' }}
            />
          ) : null,
        )
      ) : null}
      {otpPoints.length > 1 && <FitGeometry points={otpPoints} />}
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
      {otpPoints.length === 0 && tripStops.length > 0 && <FitBounds places={tripStops} />}

      <RecenterMap coords={mapCenter} />
    </MapContainer>
  );
}
