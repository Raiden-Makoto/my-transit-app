import { useRef, useState, type ReactNode } from 'react';
import { Search, X, Home, Briefcase, Clock, CornerUpRight, MapPin, Loader2, Trash2 } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useLocationHistory } from '../hooks/useLocationHistory';
import { usePlaceSearch, type SearchViewport } from '../hooks/usePlaceSearch';
import type { SavedLocation } from '../types/location';

type SearchBoxProps = {
  onLocationSelect?: (location: SavedLocation) => void;
  viewport?: SearchViewport;
};

type Slot = 'home' | 'work';

function formatAddress(loc: SavedLocation): string {
  return loc.secondaryText || loc.primaryText;
}

export default function SearchBox({ onLocationSelect, viewport }: SearchBoxProps) {
  const [homeLoc, setHomeLoc] = useLocalStorage<SavedLocation | null>('user_home', null);
  const [workLoc, setWorkLoc] = useLocalStorage<SavedLocation | null>('user_work', null);
  const { recents, addToHistory, removeFromHistory } = useLocationHistory();

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [assigning, setAssigning] = useState<Slot | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, loading, error } = usePlaceSearch(query, viewport);
  const hasQuery = query.trim().length > 0;

  const reset = () => {
    setQuery('');
    setAssigning(null);
    setFocused(false);
  };

  const selectLocation = (location: SavedLocation) => {
    if (assigning) {
      const saved: SavedLocation = {
        ...location,
        id: assigning,
        secondaryText: formatAddress(location),
      };
      if (assigning === 'home') setHomeLoc(saved);
      else setWorkLoc(saved);
      reset();
      return;
    }
    addToHistory(location);
    onLocationSelect?.(location);
    reset();
  };

  const clearSlot = (slot: Slot) => {
    if (slot === 'home') setHomeLoc(null);
    else setWorkLoc(null);
  };

  const startAssigning = (slot: Slot) => {
    setAssigning(slot);
    setQuery('');
    setFocused(true);
    inputRef.current?.focus();
  };

  const handleSubmit = () => {
    if (results.length > 0) selectLocation(results[0]);
  };

  const placeholder =
    assigning === 'home'
      ? 'Choose home location'
      : assigning === 'work'
        ? 'Choose work location'
        : 'Search Transit Map';

  const renderSavedRow = (slot: Slot, loc: SavedLocation | null, label: string, icon: ReactNode) => (
    <div className="group flex w-full items-center px-4 py-2.5 transition-colors hover:bg-[#f5f5f5]">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => loc && selectLocation(loc)}
        className="flex flex-1 items-center min-w-0 text-left"
      >
        <span className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full bg-[#f1f3f4] text-[#5f6368]">
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <h3 className="m-0 text-[15px] font-medium leading-tight text-[#202124] truncate">{label}</h3>
          <p className="m-0 text-[13px] leading-snug text-[#5f6368] truncate">{loc ? formatAddress(loc) : 'Set location'}</p>
        </span>
      </button>
      <div className="flex items-center shrink-0 ml-2">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => startAssigning(slot)}
          className={`rounded px-2 py-1 text-[13px] font-medium text-[#1a73e8] transition-opacity hover:bg-[#e8f0fe] ${
            loc ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
          }`}
        >
          {loc ? 'Edit' : 'Set'}
        </button>
        {loc && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => clearSlot(slot)}
            className="ml-1 rounded-full p-1.5 text-[#5f6368] opacity-0 transition-opacity hover:bg-[#f1f3f4] group-hover:opacity-100"
            aria-label={`Remove ${label}`}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="absolute top-3 left-3 z-[1000] w-[min(92vw,400px)] font-sans text-[#202124]">
      {/* Floating search pill */}
      <div className="flex items-center h-12 bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
        <span className="flex items-center justify-center pl-[14px] pr-2 text-[#5f6368]">
          <Search size={20} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') reset();
          }}
          placeholder={placeholder}
          className="flex-1 h-full bg-transparent border-none outline-none text-[15px] text-[#202124] placeholder:text-[#5f6368]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="p-2 mr-0.5 rounded-full text-[#5f6368] transition-colors hover:bg-[#f1f3f4]"
            aria-label="Clear search"
          >
            <X size={20} />
          </button>
        )}
        <span className="w-px h-6 bg-[#e0e0e0]" />
        <button
          type="button"
          className="flex items-center justify-center w-12 h-full rounded-r-lg text-[#1a73e8] transition-colors hover:bg-[#e8f0fe]"
          aria-label="Directions"
        >
          <CornerUpRight size={20} />
        </button>
      </div>

      {/* Suggestions sheet */}
      {focused && (
        <div className="mt-1.5 bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] overflow-hidden py-2">
          {assigning && (
            <div className="flex items-center justify-between px-4 py-2 mb-1 border-b border-[#eceff1]">
              <span className="text-[13px] font-medium text-[#5f6368]">
                Search for a place to set as {assigning === 'home' ? 'Home' : 'Work'}
              </span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={reset}
                className="text-[13px] font-medium text-[#1a73e8] hover:underline"
              >
                Cancel
              </button>
            </div>
          )}

          {hasQuery ? (
            <>
              {loading && (
                <div className="flex items-center gap-3 px-4 py-3 text-[14px] text-[#5f6368]">
                  <Loader2 size={18} className="animate-spin" />
                  Searching...
                </div>
              )}

              {!loading && error && <div className="px-4 py-3 text-[14px] text-[#b71c1c]">{error}</div>}

              {!loading && !error && results.length === 0 && (
                <div className="px-4 py-3 text-[14px] text-[#5f6368]">No results found</div>
              )}

              {!loading &&
                results.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectLocation(place)}
                    className="flex w-full items-center px-4 py-2.5 text-left transition-colors hover:bg-[#f5f5f5]"
                  >
                    <span className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full bg-[#f1f3f4] text-[#5f6368]">
                      <MapPin size={18} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <h3 className="m-0 text-[15px] leading-tight text-[#202124] truncate">{place.primaryText}</h3>
                      {place.secondaryText && (
                        <p className="m-0 text-[13px] leading-snug text-[#5f6368] truncate">{place.secondaryText}</p>
                      )}
                    </span>
                  </button>
                ))}
            </>
          ) : (
            <>
              {renderSavedRow('home', homeLoc, 'Home', <Home size={18} />)}
              {renderSavedRow('work', workLoc, 'Work', <Briefcase size={18} />)}

              {recents.length > 0 && <div className="h-px my-1.5 bg-[#eceff1]" />}

              {recents.map((recent) => (
                <div
                  key={recent.id}
                  className="group flex w-full items-center px-4 py-2.5 transition-colors hover:bg-[#f5f5f5]"
                >
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectLocation(recent)}
                    className="flex flex-1 items-center min-w-0 text-left"
                  >
                    <span className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full bg-[#f1f3f4] text-[#5f6368]">
                      <Clock size={18} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <h3 className="m-0 text-[15px] leading-tight text-[#202124] truncate">{recent.primaryText}</h3>
                      <p className="m-0 text-[13px] leading-snug text-[#5f6368] truncate">{recent.secondaryText}</p>
                    </span>
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => removeFromHistory(recent.id)}
                    className="ml-2 shrink-0 rounded-full p-1.5 text-[#5f6368] opacity-0 transition-opacity hover:bg-[#f1f3f4] group-hover:opacity-100"
                    aria-label={`Remove ${recent.primaryText} from history`}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
