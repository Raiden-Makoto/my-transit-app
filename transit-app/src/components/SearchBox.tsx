import { useState } from 'react';
import { Search, X, Home, Briefcase, Clock, CornerUpRight } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useLocationHistory } from '../hooks/useLocationHistory';
import type { SavedLocation } from '../types/location';

type SearchBoxProps = {
  onLocationSelect?: (location: SavedLocation) => void;
};

export default function SearchBox({ onLocationSelect }: SearchBoxProps) {
  const [homeLoc] = useLocalStorage<SavedLocation | null>('user_home', {
    id: 'home',
    primaryText: 'Home',
    secondaryText: 'McNicoll Ave at Picola Crt, North York...',
    lat: 43.811,
    lon: -79.345,
  });

  const [workLoc] = useLocalStorage<SavedLocation | null>('user_work', null);
  const { recents, addToHistory } = useLocationHistory();

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const selectLocation = (location: SavedLocation) => {
    addToHistory(location);
    onLocationSelect?.(location);
    setFocused(false);
  };

  const showPanel = focused;

  return (
    <div className="absolute top-3 left-3 z-[1000] w-[min(92vw,400px)] font-sans">
      {/* Search bar — floating pill like Google Maps */}
      <div className="flex items-center h-12 bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-shadow">
        <div className="pl-4 pr-3 text-gray-500">
          <Search className="w-5 h-5" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          placeholder="Search Transit Map"
          className="flex-1 h-full outline-none text-[15px] text-gray-800 placeholder-gray-500 bg-transparent"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="p-2 mr-1 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Clear search"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="w-px h-6 bg-gray-200" />
        <button
          type="button"
          className="flex items-center justify-center w-12 h-full text-blue-600 hover:bg-blue-50 rounded-r-lg transition-colors"
          aria-label="Directions"
        >
          <CornerUpRight className="w-5 h-5" />
        </button>
      </div>

      {/* Suggestions sheet — only while focused, mimics Maps dropdown */}
      {showPanel && (
        <div className="mt-1.5 bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] overflow-hidden py-2">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => homeLoc && selectLocation(homeLoc)}
            className="flex w-full items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer group text-left"
          >
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center mr-4 shrink-0">
              <Home className="w-[18px] h-[18px] text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-medium text-gray-900 leading-tight">Home</h3>
              <p className="text-[13px] text-gray-500 truncate">{homeLoc?.secondaryText || 'Set location'}</p>
            </div>
            <span className="text-[13px] font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => workLoc && selectLocation(workLoc)}
            className="flex w-full items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer group text-left"
          >
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center mr-4 shrink-0">
              <Briefcase className="w-[18px] h-[18px] text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-medium text-gray-900 leading-tight">Work</h3>
              <p className="text-[13px] text-gray-500 truncate">{workLoc?.secondaryText || 'Set location'}</p>
            </div>
            <span className="text-[13px] font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
              {workLoc ? 'Edit' : 'Set'}
            </span>
          </button>

          <div className="h-px bg-gray-100 my-1.5" />

          {recents.map((recent) => (
            <button
              key={recent.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectLocation(recent)}
              className="flex w-full items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer text-left"
            >
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center mr-4 shrink-0">
                <Clock className="w-[18px] h-[18px] text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] text-gray-900 leading-tight truncate">{recent.primaryText}</h3>
                <p className="text-[13px] text-gray-500 truncate">{recent.secondaryText}</p>
              </div>
            </button>
          ))}

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            className="w-full text-left px-4 py-2.5 text-[14px] font-medium text-blue-600 hover:bg-gray-50"
          >
            More from recent history
          </button>
        </div>
      )}
    </div>
  );
}
