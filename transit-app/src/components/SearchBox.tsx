import { useState } from 'react';
import { Search, X, Home, Briefcase, Clock, CornerUpRight } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useLocationHistory } from '../hooks/useLocationHistory';
import type { SavedLocation } from '../types/location';
import './SearchBox.css';

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

  return (
    <div className="gmaps-search">
      <div className="gmaps-search__bar">
        <span className="gmaps-search__icon">
          <Search size={20} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          placeholder="Search Transit Map"
          className="gmaps-search__input"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="gmaps-search__icon-btn"
            aria-label="Clear search"
          >
            <X size={20} />
          </button>
        )}
        <span className="gmaps-search__divider" />
        <button type="button" className="gmaps-search__directions" aria-label="Directions">
          <CornerUpRight size={20} />
        </button>
      </div>

      {focused && (
        <div className="gmaps-search__sheet">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => homeLoc && selectLocation(homeLoc)}
            className="gmaps-search__row"
          >
            <span className="gmaps-search__avatar">
              <Home size={18} />
            </span>
            <span className="gmaps-search__text">
              <h3 className="gmaps-search__title">Home</h3>
              <p className="gmaps-search__subtitle">{homeLoc?.secondaryText || 'Set location'}</p>
            </span>
            <span className="gmaps-search__action">Edit</span>
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => workLoc && selectLocation(workLoc)}
            className="gmaps-search__row"
          >
            <span className="gmaps-search__avatar">
              <Briefcase size={18} />
            </span>
            <span className="gmaps-search__text">
              <h3 className="gmaps-search__title">Work</h3>
              <p className="gmaps-search__subtitle">{workLoc?.secondaryText || 'Set location'}</p>
            </span>
            <span className="gmaps-search__action">{workLoc ? 'Edit' : 'Set'}</span>
          </button>

          <div className="gmaps-search__separator" />

          {recents.map((recent) => (
            <button
              key={recent.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectLocation(recent)}
              className="gmaps-search__row"
            >
              <span className="gmaps-search__avatar">
                <Clock size={18} />
              </span>
              <span className="gmaps-search__text">
                <h3 className="gmaps-search__title gmaps-search__title--regular">{recent.primaryText}</h3>
                <p className="gmaps-search__subtitle">{recent.secondaryText}</p>
              </span>
            </button>
          ))}

          <button type="button" onMouseDown={(e) => e.preventDefault()} className="gmaps-search__more">
            More from recent history
          </button>
        </div>
      )}
    </div>
  );
}
