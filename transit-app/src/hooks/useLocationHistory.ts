import { useLocalStorage } from './useLocalStorage';
import type { SavedLocation } from '../types/location';

const DEFAULT_RECENTS: SavedLocation[] = [
  { id: 'r1', primaryText: 'White Rock Centre @ Bay 10', secondaryText: 'Surrey, BC', lat: 49.032, lon: -122.802 },
  { id: 'r2', primaryText: 'Southbound Campbell Valley Park...', secondaryText: 'Langley Township, BC', lat: 49.006, lon: -122.628 },
  { id: 'r3', primaryText: 'Campbell Valley Regional Park', secondaryText: '8 Avenue, Langley Township, BC', lat: 49.006, lon: -122.628 },
];

export function useLocationHistory() {
  const [recents, setRecents] = useLocalStorage<SavedLocation[]>('user_recents', DEFAULT_RECENTS);

  const addToHistory = (newLocation: SavedLocation) => {
    setRecents((prev) => {
      const filtered = prev.filter((loc) => loc.id !== newLocation.id);
      return [newLocation, ...filtered].slice(0, 3);
    });
  };

  return { recents, addToHistory };
}
