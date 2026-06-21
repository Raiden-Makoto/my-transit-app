import { useLocalStorage } from './useLocalStorage';
import type { SavedLocation } from '../types/location';

const DEFAULT_RECENTS: SavedLocation[] = [];

export type HistoryApi = {
  recents: SavedLocation[];
  addToHistory: (location: SavedLocation) => void;
  removeFromHistory: (id: string) => void;
};

export function useLocationHistory(): HistoryApi {
  const [recents, setRecents] = useLocalStorage<SavedLocation[]>('user_recents', DEFAULT_RECENTS);

  const addToHistory = (newLocation: SavedLocation) => {
    setRecents((prev) => {
      const filtered = prev.filter((loc) => loc.id !== newLocation.id);
      return [newLocation, ...filtered].slice(0, 3);
    });
  };

  const removeFromHistory = (id: string) => {
    setRecents((prev) => prev.filter((loc) => loc.id !== id));
  };

  return { recents, addToHistory, removeFromHistory };
}
