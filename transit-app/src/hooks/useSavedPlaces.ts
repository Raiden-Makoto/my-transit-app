import { useLocalStorage } from './useLocalStorage';
import type { SavedLocation } from '../types/location';

export type SavedPlacesApi = {
  saved: SavedLocation[];
  isSaved: (id: string) => boolean;
  toggleSaved: (location: SavedLocation) => void;
  removeSaved: (id: string) => void;
};

/**
 * Persisted list of user-starred places (like Google Maps "Saved").
 */
export function useSavedPlaces(): SavedPlacesApi {
  const [saved, setSaved] = useLocalStorage<SavedLocation[]>('user_saved', []);

  const isSaved = (id: string) => saved.some((loc) => loc.id === id);

  const toggleSaved = (location: SavedLocation) => {
    setSaved((prev) =>
      prev.some((loc) => loc.id === location.id)
        ? prev.filter((loc) => loc.id !== location.id)
        : [location, ...prev],
    );
  };

  const removeSaved = (id: string) => {
    setSaved((prev) => prev.filter((loc) => loc.id !== id));
  };

  return { saved, isSaved, toggleSaved, removeSaved };
}
