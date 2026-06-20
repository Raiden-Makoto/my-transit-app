import { Search, Navigation, Home, Briefcase, Clock } from 'lucide-react';
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

  const selectLocation = (location: SavedLocation) => {
    addToHistory(location);
    onLocationSelect?.(location);
  };

  return (
    <div className="absolute top-4 left-4 z-[1000] w-96 bg-white rounded-2xl shadow-lg font-sans overflow-hidden">
      <div className="flex items-center px-4 py-3 border-b border-gray-100">
        <Search className="w-5 h-5 text-gray-500 mr-3" />
        <input
          type="text"
          placeholder="Search Transit Map"
          className="flex-1 outline-none text-base text-gray-800 placeholder-gray-500 bg-transparent"
        />
        <button type="button" className="p-2 hover:bg-blue-50 rounded-full transition-colors">
          <Navigation className="w-5 h-5 text-blue-600 fill-blue-600" />
        </button>
      </div>

      <div className="py-2">
        <button
          type="button"
          onClick={() => homeLoc && selectLocation(homeLoc)}
          className="flex w-full items-center px-4 py-3 hover:bg-gray-50 cursor-pointer group text-left"
        >
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mr-4">
            <Home className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-medium text-gray-900">Home</h3>
            <p className="text-sm text-gray-500 truncate">{homeLoc?.secondaryText || 'Set location'}</p>
          </div>
          <span className="text-sm font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
        </button>

        <button
          type="button"
          onClick={() => workLoc && selectLocation(workLoc)}
          className="flex w-full items-center px-4 py-3 hover:bg-gray-50 cursor-pointer text-left"
        >
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mr-4">
            <Briefcase className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-medium text-gray-900">Work</h3>
            <p className="text-sm text-gray-500 truncate">{workLoc?.secondaryText || 'Set location'}</p>
          </div>
          <span className="text-sm font-medium text-blue-600">{workLoc ? 'Edit' : 'Set location'}</span>
        </button>

        <div className="h-px bg-gray-100 my-2 mx-4" />

        {recents.map((recent) => (
          <button
            key={recent.id}
            type="button"
            onClick={() => selectLocation(recent)}
            className="flex w-full items-center px-4 py-3 hover:bg-gray-50 cursor-pointer text-left"
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mr-4">
              <Clock className="w-5 h-5 text-gray-600" />
            </div>
            <div className="flex-1 overflow-hidden">
              <h3 className="text-base font-medium text-gray-900 truncate">{recent.primaryText}</h3>
              <p className="text-sm text-gray-500 truncate">{recent.secondaryText}</p>
            </div>
          </button>
        ))}

        <button type="button" className="w-full text-center py-3 text-sm font-medium text-blue-600 hover:bg-gray-50 mt-2">
          More from recent history
        </button>
      </div>
    </div>
  );
}
