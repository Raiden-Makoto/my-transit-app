import { useLocalStorage } from './useLocalStorage';
import type { PlaceCollection, SavedLocation } from '../types/location';

export const COLLECTION_PLACE_LIMIT = 10;

export const COLLECTION_COLORS = [
  '#1a73e8',
  '#34a853',
  '#ea4335',
  '#fbbc04',
  '#a142f4',
  '#ff6d01',
  '#00acc1',
  '#5f6368',
];

export type AddResult = 'added' | 'exists' | 'full' | 'missing';

export type CollectionsApi = {
  collections: PlaceCollection[];
  createCollection: (name: string) => PlaceCollection | null;
  renameCollection: (id: string, name: string) => void;
  setCollectionColor: (id: string, color: string) => void;
  deleteCollection: (id: string) => void;
  addPlaceToCollection: (id: string, place: SavedLocation) => AddResult;
  removePlaceFromCollection: (id: string, placeId: string) => void;
  isPlaceInCollection: (id: string, placeId: string) => boolean;
};

function makeId() {
  return `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Persisted user collections (Google Maps style "Lists"), each capped at
 * COLLECTION_PLACE_LIMIT saved places.
 */
export function useCollections(): CollectionsApi {
  const [collections, setCollections] = useLocalStorage<PlaceCollection[]>('user_collections', []);

  const createCollection = (name: string): PlaceCollection | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const color = COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length];
    const collection: PlaceCollection = { id: makeId(), name: trimmed, color, places: [] };
    setCollections((prev) => [...prev, collection]);
    return collection;
  };

  const renameCollection = (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, name: trimmed } : c)));
  };

  const setCollectionColor = (id: string, color: string) => {
    setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, color } : c)));
  };

  const deleteCollection = (id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
  };

  const addPlaceToCollection = (id: string, place: SavedLocation): AddResult => {
    const target = collections.find((c) => c.id === id);
    if (!target) return 'missing';
    if (target.places.some((p) => p.id === place.id)) return 'exists';
    if (target.places.length >= COLLECTION_PLACE_LIMIT) return 'full';
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, places: [place, ...c.places] } : c)),
    );
    return 'added';
  };

  const removePlaceFromCollection = (id: string, placeId: string) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, places: c.places.filter((p) => p.id !== placeId) } : c)),
    );
  };

  const isPlaceInCollection = (id: string, placeId: string) =>
    collections.find((c) => c.id === id)?.places.some((p) => p.id === placeId) ?? false;

  return {
    collections,
    createCollection,
    renameCollection,
    setCollectionColor,
    deleteCollection,
    addPlaceToCollection,
    removePlaceFromCollection,
    isPlaceInCollection,
  };
}
