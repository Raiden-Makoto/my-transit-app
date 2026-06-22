import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { Star, FolderPlus, Menu, X, Route, Sparkles } from 'lucide-react';
import L from 'leaflet';
import SearchBox from './SearchBox';
import CollectionPicker from './CollectionPicker';
import Sidebar from './Sidebar';
import TripPlanner from './TripPlanner';
import AiTripPlanner from './AiTripPlanner';
import { useSavedPlaces } from '../hooks/useSavedPlaces';
import { useCollections } from '../hooks/useCollections';
import { useLocationHistory } from '../hooks/useLocationHistory';
import type { SearchViewport } from '../hooks/usePlaceSearch';
import type { PlaceCollection, SavedLocation, TripLeg } from '../types/location';

type Bbox = [number, number, number, number];

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

export default function MapCanvas() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<SavedLocation | null>(null);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerPlace, setPickerPlace] = useState<SavedLocation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewedList, setViewedList] = useState<PlaceCollection | null>(null);
  const [aiList, setAiList] = useState<PlaceCollection | null>(null);
  const [tripOpen, setTripOpen] = useState(false);
  const [tripLegs, setTripLegs] = useState<TripLeg[] | null>(null);
  const [tripInitialLegs, setTripInitialLegs] = useState<TripLeg[] | null>(null);
  const [aiStops, setAiStops] = useState<SavedLocation[] | null>(null);
  const savedPlaces = useSavedPlaces();
  const collections = useCollections();
  const history = useLocationHistory();

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
    setViewedList(null);
    setTripLegs(null);
    setAiStops(null);
  };

  const handleViewList = (list: PlaceCollection) => {
    setDestination(null);
    setTripLegs(null);
    setAiStops(null);
    setViewedList(list);
  };

  const handleShowRoute = (legs: TripLeg[]) => {
    setDestination(null);
    setViewedList(null);
    setAiStops(null);
    setTripLegs(legs);
  };

  const handleShowAiStops = (places: SavedLocation[]) => {
    setDestination(null);
    setViewedList(null);
    setTripLegs(null);
    setAiStops(places);
    setAiList(null);
  };

  const handleGetDirections = (place: SavedLocation) => {
    const origin: SavedLocation | null = position
      ? { id: 'current-location', primaryText: 'Your location', secondaryText: '', lat: position[0], lon: position[1] }
      : null;
    setTripInitialLegs([
      { id: `leg_${Date.now().toString(36)}`, from: origin, to: place },
    ]);
    setTripOpen(true);
  };

  const viewport = useMemo<SearchViewport | undefined>(
    () => (mapCenter ? { lat: mapCenter[0], lon: mapCenter[1], bbox: bbox ?? undefined } : undefined),
    [mapCenter, bbox],
  );

  // Ordered, de-duplicated list of stops across all trip legs.
  const tripStops = useMemo<SavedLocation[]>(() => {
    if (!tripLegs) return [];
    const pts: SavedLocation[] = [];
    const pushUnique = (loc: SavedLocation | null) => {
      if (loc && (pts.length === 0 || pts[pts.length - 1].id !== loc.id)) pts.push(loc);
    };
    tripLegs.forEach((leg) => {
      pushUnique(leg.from);
      pushUnique(leg.to);
    });
    return pts;
  }, [tripLegs]);

  if (error && !position) {
    return <div className="p-4 bg-red-100 text-red-700">{error}</div>;
  }

  if (!position || !mapCenter) {
    return <div className="p-4 text-gray-600">Prompting for location services...</div>;
  }

  return (
    <div style={{ height: '100vh', width: '100%' }} className="relative">
      <SearchBox
        onLocationSelect={handleLocationSelect}
        viewport={viewport}
        savedPlaces={savedPlaces}
        collections={collections}
        history={history}
        onAddToList={setPickerPlace}
      />

      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="absolute top-3 left-3 z-[1000] flex items-center justify-center w-12 h-12 bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] text-[#5f6368] hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-shadow"
        aria-label="Open your places"
      >
        <Menu size={22} />
      </button>

      <button
        type="button"
        onClick={() => {
          setTripInitialLegs(null);
          setTripOpen(true);
        }}
        className="absolute bottom-6 left-3 z-[1000] flex items-center gap-2 h-11 px-4 bg-[#1a73e8] rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.3)] text-[14px] font-medium text-white hover:bg-[#1765cc] transition-colors font-sans"
        aria-label="Plan a trip"
      >
        <Route size={18} />
        Plan trip
      </button>

      <TripPlanner
        open={tripOpen}
        onClose={() => {
          setTripOpen(false);
          setTripInitialLegs(null);
        }}
        viewport={viewport}
        onShowRoute={handleShowRoute}
        initialLegs={tripInitialLegs}
      />

      {viewedList && (
        <button
          type="button"
          onClick={() => setViewedList(null)}
          className="absolute top-3 right-3 z-[1000] flex items-center gap-2 h-10 pl-4 pr-3 bg-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.3)] text-[14px] font-medium text-[#202124] hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-shadow font-sans"
          aria-label="Clear list pins"
        >
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: viewedList.color || '#1a73e8' }}
          />
          <span className="max-w-[160px] truncate">{viewedList.name}</span>
          <span className="flex items-center justify-center rounded-full p-1 text-[#5f6368] hover:bg-[#f1f3f4]">
            <X size={16} />
          </span>
        </button>
      )}

      {tripLegs && (
        <button
          type="button"
          onClick={() => setTripLegs(null)}
          className="absolute top-3 right-3 z-[1000] flex items-center gap-2 h-10 pl-4 pr-3 bg-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.3)] text-[14px] font-medium text-[#202124] hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-shadow font-sans"
          aria-label="Clear trip route"
        >
          <Route size={16} className="text-[#1a73e8]" />
          <span>Trip route</span>
          <span className="flex items-center justify-center rounded-full p-1 text-[#5f6368] hover:bg-[#f1f3f4]">
            <X size={16} />
          </span>
        </button>
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        savedPlaces={savedPlaces}
        history={history}
        collections={collections}
        onLocationSelect={handleLocationSelect}
        onViewList={handleViewList}
        onPlanWithAi={setAiList}
      />

      <AiTripPlanner list={aiList} onClose={() => setAiList(null)} onShowOnMap={handleShowAiStops} />

      {aiStops && aiStops.length > 0 && (
        <button
          type="button"
          onClick={() => setAiStops(null)}
          className="absolute top-3 right-3 z-[1000] flex items-center gap-2 h-10 pl-4 pr-3 bg-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.3)] text-[14px] font-medium text-[#202124] hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-shadow font-sans"
          aria-label="Clear AI itinerary pins"
        >
          <Sparkles size={16} className="text-[#7b1fa2]" />
          <span>AI itinerary</span>
          <span className="flex items-center justify-center rounded-full p-1 text-[#5f6368] hover:bg-[#f1f3f4]">
            <X size={16} />
          </span>
        </button>
      )}

      {pickerPlace && (
        <CollectionPicker place={pickerPlace} collections={collections} onClose={() => setPickerPlace(null)} />
      )}
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
              <span style={{ display: 'inline-flex', gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => savedPlaces.toggleSaved(destination)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
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
                <button
                  type="button"
                  onClick={() => setPickerPlace(destination)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    border: '1px solid #dadce0',
                    borderRadius: 9999,
                    background: '#fff',
                    color: '#1a73e8',
                    font: '500 13px system-ui, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  <FolderPlus size={14} />
                  Add to list
                </button>
                <button
                  type="button"
                  onClick={() => handleGetDirections(destination)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    border: 'none',
                    borderRadius: 9999,
                    background: '#1a73e8',
                    color: '#fff',
                    font: '500 13px system-ui, sans-serif',
                    cursor: 'pointer',
                  }}
                >
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
              <button
                type="button"
                onClick={() => handleGetDirections(place)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  padding: '4px 10px',
                  border: 'none',
                  borderRadius: 9999,
                  background: '#1a73e8',
                  color: '#fff',
                  font: '500 13px system-ui, sans-serif',
                  cursor: 'pointer',
                }}
              >
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
    </div>
  );
}
