import { useLocalStorage } from './useLocalStorage';
import type { SavedLocation } from '../types/location';

const DEFAULT_RECENTS: SavedLocation[] = [];

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
