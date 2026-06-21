import { useState } from 'react';
import { Search, X, Home, Briefcase, Clock, CornerUpRight } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useLocationHistory } from '../hooks/useLocationHistory';
import type { SavedLocation } from '../types/location';

type SearchBoxProps = {
  onLocationSelect?: (location: SavedLocation) => void;
};

export default function SearchBox({ onLocationSelect }: SearchBoxProps) {
  const [homeLoc] = useLocalStorage<SavedLocation | null>('user_home', null);

  const [workLoc] = useLocalStorage<SavedLocation | null>('user_work', null);
  const { recents, addToHistory } = useLocationHistory();

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const selectLocation = (location: SavedLocation) => {
    addToHistory(location);
    onLocationSelect?.(location);
    setFocused(false);
  };

  return (
    <div className="absolute top-3 left-3 z-[1000] w-[min(92vw,400px)] font-sans text-[#202124]">
      {/* Floating search pill */}
      <div className="flex items-center h-12 bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
        <span className="flex items-center justify-center pl-[14px] pr-2 text-[#5f6368]">
          <Search size={20} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          placeholder="Search Transit Map"
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
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => homeLoc && selectLocation(homeLoc)}
            className="group flex w-full items-center px-4 py-2.5 text-left transition-colors hover:bg-[#f5f5f5]"
          >
            <span className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full bg-[#f1f3f4] text-[#5f6368]">
              <Home size={18} />
            </span>
            <span className="flex-1 min-w-0">
              <h3 className="m-0 text-[15px] font-medium leading-tight text-[#202124] truncate">Home</h3>
              <p className="m-0 text-[13px] leading-snug text-[#5f6368] truncate">{homeLoc?.secondaryText || 'Set location'}</p>
            </span>
            <span className="ml-2 text-[13px] font-medium text-[#1a73e8] opacity-0 transition-opacity group-hover:opacity-100">
              {homeLoc ? 'Edit' : 'Set'}
            </span>
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => workLoc && selectLocation(workLoc)}
            className="group flex w-full items-center px-4 py-2.5 text-left transition-colors hover:bg-[#f5f5f5]"
          >
            <span className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full bg-[#f1f3f4] text-[#5f6368]">
              <Briefcase size={18} />
            </span>
            <span className="flex-1 min-w-0">
              <h3 className="m-0 text-[15px] font-medium leading-tight text-[#202124] truncate">Work</h3>
              <p className="m-0 text-[13px] leading-snug text-[#5f6368] truncate">{workLoc?.secondaryText || 'Set location'}</p>
            </span>
            <span className="ml-2 text-[13px] font-medium text-[#1a73e8] opacity-0 transition-opacity group-hover:opacity-100">
              {workLoc ? 'Edit' : 'Set'}
            </span>
          </button>

          <div className="h-px my-1.5 bg-[#eceff1]" />

          {recents.map((recent) => (
            <button
              key={recent.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectLocation(recent)}
              className="flex w-full items-center px-4 py-2.5 text-left transition-colors hover:bg-[#f5f5f5]"
            >
              <span className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full bg-[#f1f3f4] text-[#5f6368]">
                <Clock size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <h3 className="m-0 text-[15px] leading-tight text-[#202124] truncate">{recent.primaryText}</h3>
                <p className="m-0 text-[13px] leading-snug text-[#5f6368] truncate">{recent.secondaryText}</p>
              </span>
            </button>
          ))}

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            className="w-full px-4 py-2.5 text-left text-[14px] font-medium text-[#1a73e8] transition-colors hover:bg-[#f5f5f5]"
          >
            More from recent history
          </button>
        </div>
      )}
    </div>
  );
}
