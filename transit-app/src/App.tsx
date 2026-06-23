import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Menu, X, Route, Sparkles, TrainFront } from 'lucide-react';
import SearchBox from './components/SearchBox';
import CollectionPicker from './components/CollectionPicker';
import Sidebar from './components/Sidebar';
import TripPlanner from './components/TripPlanner';
import MapView, { type Bbox } from './components/MapView';

// Lazy-loaded so react-markdown only loads when the AI planner is opened.
const AiTripPlanner = lazy(() => import('./components/AiTripPlanner'));
import { useSavedPlaces } from './hooks/useSavedPlaces';
import { useCollections } from './hooks/useCollections';
import { useLocationHistory } from './hooks/useLocationHistory';
import type { SearchViewport } from './hooks/usePlaceSearch';
import type { PlaceCollection, SavedLocation, TripLeg } from './types/location';

function App() {
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
  const [showCorridors, setShowCorridors] = useState(true);
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

      <div className="absolute bottom-6 left-3 z-[1000] flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTripInitialLegs(null);
            setTripOpen(true);
          }}
          className="flex items-center gap-2 h-11 px-4 bg-[#1a73e8] rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.3)] text-[14px] font-medium text-white hover:bg-[#1765cc] transition-colors font-sans"
          aria-label="Plan a trip"
        >
          <Route size={18} />
          Plan trip
        </button>

        <button
          type="button"
          onClick={() => setShowCorridors((v) => !v)}
          aria-pressed={showCorridors}
          className={`flex items-center gap-2 h-11 px-4 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.3)] text-[14px] font-medium transition-colors font-sans ${
            showCorridors ? 'bg-[#1a73e8] text-white hover:bg-[#1765cc]' : 'bg-white text-[#202124] hover:bg-[#f1f3f4]'
          }`}
          aria-label="Toggle rapid transit corridors"
        >
          <TrainFront size={18} />
          Transit lines
        </button>
      </div>

      {showCorridors && (
        <div className="absolute bottom-[92px] right-3 z-[1000] bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] px-3 py-2.5 font-sans">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5f6368] mb-1.5">
            Rapid transit
          </div>
          <ul className="space-y-1.5">
            {[
              { name: 'Expo Line', color: '#0033a0' },
              { name: 'Millennium Line', color: '#ffcd00' },
              { name: 'Canada Line', color: '#007c9f' },
              { name: 'West Coast Express', color: '#87189d', dashed: true },
              { name: 'SeaBus', color: '#746661', dashed: true },
              { name: 'RapidBus', color: '#008522' },
              { name: '99 B-Line', color: '#d04110' },
            ].map((row) => (
              <li key={row.name} className="flex items-center gap-2 text-[12px] text-[#202124]">
                <span
                  className="inline-block w-5 h-[3px] rounded-full"
                  style={
                    row.dashed
                      ? { backgroundImage: `repeating-linear-gradient(to right, ${row.color} 0 3px, transparent 3px 6px)` }
                      : { backgroundColor: row.color }
                  }
                />
                {row.name}
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {aiList && (
        <Suspense fallback={null}>
          <AiTripPlanner list={aiList} onClose={() => setAiList(null)} onShowOnMap={handleShowAiStops} />
        </Suspense>
      )}

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

      <MapView
        position={position}
        mapCenter={mapCenter}
        destination={destination}
        viewedList={viewedList}
        tripLegs={tripLegs}
        tripStops={tripStops}
        aiStops={aiStops}
        showCorridors={showCorridors}
        onBboxChange={setBbox}
        isSaved={savedPlaces.isSaved}
        onToggleSaved={savedPlaces.toggleSaved}
        onAddToList={setPickerPlace}
        onGetDirections={handleGetDirections}
      />
    </div>
  );
}

export default App;
