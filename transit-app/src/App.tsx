import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Menu, X, Route, Sparkles, TrainFront, Sun, Moon, Loader2 } from 'lucide-react';
import SearchBox from './components/SearchBox';
import CollectionPicker from './components/CollectionPicker';
import Sidebar from './components/Sidebar';
import TripPlanner from './components/TripPlanner';
import { legTiming } from './services/tripTiming';
import MapView, { type Bbox } from './components/MapView';
import ItineraryOptions from './components/ItineraryOptions';

// Lazy-loaded so react-markdown only loads when the AI planner is opened.
const AiTripPlanner = lazy(() => import('./components/AiTripPlanner'));
import {
  planTransit,
  prefsToModes,
  DEFAULT_ROUTE_PREFS,
  type LegPlan,
  type OtpItinerary,
  type OtpLeg,
  type RoutePrefs,
} from './services/otp';
import { useSavedPlaces } from './hooks/useSavedPlaces';
import { useCollections } from './hooks/useCollections';
import { useLocationHistory } from './hooks/useLocationHistory';
import { useTheme } from './hooks/useTheme';
import type { SearchViewport } from './hooks/usePlaceSearch';
import type { PlaceCollection, SavedLocation, TripLeg } from './types/location';

// OTP often lists the direct walk first even when a transit trip is much
// faster, so sort by duration to put the quickest option first.
function rankItineraries(its: OtpItinerary[]): OtpItinerary[] {
  return [...its].sort((a, b) => a.duration - b.duration);
}

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
  const [legPlans, setLegPlans] = useState<LegPlan[] | null>(null);
  const [activeLeg, setActiveLeg] = useState(0);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routePrefs, setRoutePrefs] = useState<RoutePrefs>(DEFAULT_ROUTE_PREFS);
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null);
  const [tripInitialLegs, setTripInitialLegs] = useState<TripLeg[] | null>(null);
  const [aiStops, setAiStops] = useState<SavedLocation[] | null>(null);
  const [showCorridors, setShowCorridors] = useState(true);
  const { theme, toggleTheme } = useTheme();
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

  const clearRoute = () => {
    setTripLegs(null);
    setLegPlans(null);
    setActiveLeg(0);
    setRouteError(null);
    setRouting(false);
  };

  const handleLocationSelect = (location: SavedLocation) => {
    setMapCenter([location.lat, location.lon]);
    setDestination(location);
    setViewedList(null);
    clearRoute();
    setAiStops(null);
  };

  const handleViewList = (list: PlaceCollection) => {
    setDestination(null);
    clearRoute();
    setAiStops(null);
    setViewedList(list);
  };

  const runPlan = async (legs: TripLeg[], prefs: RoutePrefs) => {
    setLegPlans(null);
    setActiveLeg(0);
    setRouteError(null);
    setRouting(true);

    const valid = legs.filter((leg) => leg.from && leg.to);
    const baseOpts = { numItineraries: 8, modes: prefsToModes(prefs) };

    // If the request is slow, the OTP Space is likely cold-starting. Surface a
    // toast while the proxy retries (it waits up to ~2 minutes for it to wake).
    const slowTimer = window.setTimeout(() => {
      setToast({
        message: 'Server is currently down. Reconnecting — this can take up to 2 minutes…',
        tone: 'info',
      });
    }, 4000);

    try {
      if (valid.length === 0) {
        setRouteError('Pick a start and destination.');
        return;
      }

      // Plan every leg independently so the user can string together their own
      // combination of itineraries (multi-city flight style). Each leg keeps its
      // own departure/arrival timing.
      const plans: LegPlan[] = [];
      for (const leg of valid) {
        const itineraries = await planTransit(
          { lat: leg.from!.lat, lon: leg.from!.lon },
          { lat: leg.to!.lat, lon: leg.to!.lon },
          { ...baseOpts, ...legTiming(leg) },
        );
        plans.push({
          id: leg.id,
          fromName: leg.from!.primaryText,
          toName: leg.to!.primaryText,
          options: rankItineraries(itineraries).slice(0, 5),
          selected: 0,
        });
      }

      if (plans.every((plan) => plan.options.length === 0)) {
        setRouteError('No route found for these filters.');
      } else {
        setLegPlans(plans);
      }
      setToast(null);
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : 'Routing failed.');
      setToast({
        message: 'Server is currently down. Please try again in a minute.',
        tone: 'error',
      });
      window.setTimeout(() => setToast(null), 8000);
    } finally {
      window.clearTimeout(slowTimer);
      setRouting(false);
    }
  };

  const selectLegOption = (legIndex: number, optionIndex: number) => {
    setLegPlans((prev) =>
      prev ? prev.map((plan, i) => (i === legIndex ? { ...plan, selected: optionIndex } : plan)) : prev,
    );
  };

  const handleShowRoute = (legs: TripLeg[]) => {
    setDestination(null);
    setViewedList(null);
    setAiStops(null);
    setTripLegs(legs);
    void runPlan(legs, routePrefs);
  };

  // Re-run the current trip when the user changes mode filters; each leg keeps
  // its own timing.
  const handlePrefsChange = (next: RoutePrefs) => {
    setRoutePrefs(next);
    if (tripLegs) void runPlan(tripLegs, next);
  };

  const handleShowAiStops = (places: SavedLocation[]) => {
    setDestination(null);
    setViewedList(null);
    clearRoute();
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

  // Only draw the leg the user is currently viewing — showing every leg at once
  // gets cluttered on the map.
  const otpLegs = useMemo<OtpLeg[] | null>(() => {
    if (!legPlans) return null;
    const plan = legPlans[Math.min(activeLeg, legPlans.length - 1)];
    const opt = plan?.options[plan.selected];
    return opt && opt.legs.length > 0 ? opt.legs : null;
  }, [legPlans, activeLeg]);

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
        className="absolute top-3 left-3 z-[1000] flex items-center justify-center w-12 h-12 bg-white dark:bg-[#2a2a2e] rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] text-[#5f6368] dark:text-[#9aa0a6] hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-shadow"
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
            showCorridors
              ? 'bg-[#1a73e8] text-white hover:bg-[#1765cc]'
              : 'bg-white text-[#202124] hover:bg-[#f1f3f4] dark:bg-[#2a2a2e] dark:text-[#e8eaed] dark:hover:bg-[#3a3a3e]'
          }`}
          aria-label="Toggle rapid transit corridors"
        >
          <TrainFront size={18} />
          Transit lines
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center justify-center w-11 h-11 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.3)] bg-white text-[#202124] hover:bg-[#f1f3f4] dark:bg-[#2a2a2e] dark:text-[#e8eaed] dark:hover:bg-[#3a3a3e] transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {showCorridors && (
        <div className="absolute bottom-4 right-3 z-[1000] bg-white dark:bg-[#2a2a2e] rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] px-3 py-2.5 font-sans">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5f6368] dark:text-[#9aa0a6] mb-1.5">
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
              <li key={row.name} className="flex items-center gap-2 text-[12px] text-[#202124] dark:text-[#e8eaed]">
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
          className="absolute top-3 right-3 z-[1000] flex items-center gap-2 h-10 pl-4 pr-3 bg-white dark:bg-[#2a2a2e] rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.3)] text-[14px] font-medium text-[#202124] dark:text-[#e8eaed] hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-shadow font-sans"
          aria-label="Clear list pins"
        >
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: viewedList.color || '#1a73e8' }}
          />
          <span className="max-w-[160px] truncate">{viewedList.name}</span>
          <span className="flex items-center justify-center rounded-full p-1 text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3a3a3e]">
            <X size={16} />
          </span>
        </button>
      )}

      {(legPlans || routing || routeError) && tripLegs && (
        <ItineraryOptions
          legPlans={legPlans ?? []}
          activeLeg={activeLeg}
          onActiveLegChange={setActiveLeg}
          onSelectOption={selectLegOption}
          onClose={clearRoute}
          prefs={routePrefs}
          onPrefsChange={handlePrefsChange}
          loading={routing}
          error={routeError}
        />
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
          className="absolute top-3 right-3 z-[1000] flex items-center gap-2 h-10 pl-4 pr-3 bg-white dark:bg-[#2a2a2e] rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.3)] text-[14px] font-medium text-[#202124] dark:text-[#e8eaed] hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-shadow font-sans"
          aria-label="Clear AI itinerary pins"
        >
          <Sparkles size={16} className="text-[#7b1fa2]" />
          <span>AI itinerary</span>
          <span className="flex items-center justify-center rounded-full p-1 text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3a3a3e]">
            <X size={16} />
          </span>
        </button>
      )}

      {pickerPlace && (
        <CollectionPicker place={pickerPlace} collections={collections} onClose={() => setPickerPlace(null)} />
      )}

      {toast && (
        <div
          role="status"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1300] flex items-center gap-2.5 max-w-[90vw] rounded-lg px-4 py-2.5 shadow-[0_2px_10px_rgba(0,0,0,0.3)] font-sans text-[14px] bg-white text-[#202124] dark:bg-[#2a2a2e] dark:text-[#e8eaed]"
        >
          {toast.tone === 'info' ? (
            <Loader2 size={16} className="shrink-0 animate-spin text-[#1a73e8]" />
          ) : (
            <span className="shrink-0 w-2 h-2 rounded-full bg-[#d93025]" />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-1 shrink-0 rounded-full p-1 text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#f1f3f4] dark:hover:bg-[#3a3a3e]"
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <MapView
        position={position}
        mapCenter={mapCenter}
        destination={destination}
        viewedList={viewedList}
        tripLegs={tripLegs}
        tripStops={tripStops}
        otpLegs={otpLegs}
        routing={routing}
        aiStops={aiStops}
        showCorridors={showCorridors}
        theme={theme}
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
