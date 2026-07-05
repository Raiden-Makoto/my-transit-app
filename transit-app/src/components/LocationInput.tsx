import { useEffect, useState, type ReactNode } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';
import { usePlaceSearch, type SearchViewport } from '../hooks/usePlaceSearch';
import type { SavedLocation } from '../types/location';

type LocationInputProps = {
  value: SavedLocation | null;
  onChange: (location: SavedLocation | null) => void;
  placeholder?: string;
  viewport?: SearchViewport;
  leadingIcon?: ReactNode;
};

export default function LocationInput({ value, onChange, placeholder, viewport, leadingIcon }: LocationInputProps) {
  const [query, setQuery] = useState(value ? value.primaryText : '');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setQuery(value ? value.primaryText : '');
  }, [value]);

  const { results, loading } = usePlaceSearch(focused ? query : '', viewport);
  const showResults = focused && query.trim().length > 0 && (loading || results.length > 0);

  const select = (place: SavedLocation) => {
    onChange(place);
    setQuery(place.primaryText);
    setFocused(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center h-10 px-3 bg-[#f1f3f4] dark:bg-[#3a3a3e] rounded-lg focus-within:bg-white dark:focus-within:bg-[#2a2a2e] focus-within:ring-2 focus-within:ring-[#1a73e8]">
        <span className="mr-2 shrink-0 text-[#5f6368] dark:text-[#9aa0a6]">{leadingIcon ?? <MapPin size={18} />}</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocused(true);
            if (value) onChange(null);
          }}
          onFocus={() => setFocused(true)}
          onClick={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder ?? 'Choose location'}
          className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-[#202124] dark:text-[#e8eaed] placeholder:text-[#5f6368] dark:placeholder:text-[#9aa0a6]"
        />
        {query && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('');
              onChange(null);
            }}
            className="ml-1 shrink-0 rounded-full p-1 text-[#5f6368] dark:text-[#9aa0a6] hover:bg-[#e0e0e0] dark:hover:bg-[#4a4a4e]"
            aria-label="Clear"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {showResults && (
        <div className="absolute left-0 right-0 top-[44px] z-10 bg-white dark:bg-[#2a2a2e] rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.25)] overflow-hidden py-1">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-[13px] text-[#5f6368] dark:text-[#9aa0a6]">
              <Loader2 size={16} className="animate-spin" />
              Searching...
            </div>
          )}
          {!loading &&
            results.map((place) => (
              <button
                key={place.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(place)}
                className="flex w-full items-center px-3 py-2 text-left transition-colors hover:bg-[#f5f5f5] dark:hover:bg-[#3a3a3e]"
              >
                <MapPin size={16} className="mr-3 shrink-0 text-[#5f6368] dark:text-[#9aa0a6]" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] text-[#202124] dark:text-[#e8eaed] truncate">{place.primaryText}</span>
                  {place.secondaryText && (
                    <span className="block text-[12px] text-[#5f6368] dark:text-[#9aa0a6] truncate">{place.secondaryText}</span>
                  )}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
