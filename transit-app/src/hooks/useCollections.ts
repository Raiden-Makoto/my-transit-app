import { useEffect, useMemo, useRef } from 'react';
import { useLocalStorage } from './useLocalStorage';
import type { PlaceCollection, SavedLocation } from '../types/location';

export const COLLECTION_PLACE_LIMIT = 10;

/** Fixed id of the built-in "Favorites" list that always exists. */
export const FAVORITES_ID = 'favorites';
const FAVORITES_COLOR = '#ea4335';

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

function makeFavorites(places: SavedLocation[] = []): PlaceCollection {
  return { id: FAVORITES_ID, name: 'Favorites', color: FAVORITES_COLOR, places, isDefault: true };
}

/**
 * Persisted user collections (Google Maps style "Lists"). A built-in
 * "Favorites" list always exists, is pinned first, can't be deleted/renamed and
 * has no place cap. Other lists are capped at COLLECTION_PLACE_LIMIT.
 */
export function useCollections(): CollectionsApi {
  const [collections, setCollections] = useLocalStorage<PlaceCollection[]>('user_collections', []);

  // Ensure the Favorites list exists exactly once, migrating any places from
  // the legacy "Saved" store (user_saved) into it.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    setCollections((prev) => {
      if (prev.some((c) => c.id === FAVORITES_ID)) return prev;
      let legacy: SavedLocation[] = [];
      try {
        const raw = window.localStorage.getItem('user_saved');
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) legacy = parsed;
      } catch {
        legacy = [];
      }
      return [makeFavorites(legacy), ...prev];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always expose Favorites first, even on the very first render before the
  // seeding effect has persisted it.
  const ordered = useMemo<PlaceCollection[]>(() => {
    const rest = collections.filter((c) => c.id !== FAVORITES_ID);
    const fav = collections.find((c) => c.id === FAVORITES_ID) ?? makeFavorites();
    return [fav, ...rest];
  }, [collections]);

  const isDefaultId = (id: string) => id === FAVORITES_ID;

  const createCollection = (name: string): PlaceCollection | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const color = COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length];
    const collection: PlaceCollection = { id: makeId(), name: trimmed, color, places: [] };
    setCollections((prev) => [...prev, collection]);
    return collection;
  };

  const renameCollection = (id: string, name: string) => {
    if (isDefaultId(id)) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, name: trimmed } : c)));
  };

  const setCollectionColor = (id: string, color: string) => {
    setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, color } : c)));
  };

  const deleteCollection = (id: string) => {
    if (isDefaultId(id)) return;
    setCollections((prev) => prev.filter((c) => c.id !== id));
  };

  const addPlaceToCollection = (id: string, place: SavedLocation): AddResult => {
    // Favorites may not be persisted yet on the first interaction — create it.
    if (isDefaultId(id) && !collections.some((c) => c.id === FAVORITES_ID)) {
      setCollections((prev) =>
        prev.some((c) => c.id === FAVORITES_ID) ? prev : [makeFavorites([place]), ...prev],
      );
      return 'added';
    }
    const target = collections.find((c) => c.id === id);
    if (!target) return 'missing';
    if (target.places.some((p) => p.id === place.id)) return 'exists';
    if (!target.isDefault && target.places.length >= COLLECTION_PLACE_LIMIT) return 'full';
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
    collections: ordered,
    createCollection,
    renameCollection,
    setCollectionColor,
    deleteCollection,
    addPlaceToCollection,
    removePlaceFromCollection,
    isPlaceInCollection,
  };
}
