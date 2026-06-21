import { useEffect, useState } from 'react';
import { searchPlaces } from '../services/geocode';
import type { SavedLocation } from '../types/location';

type PlaceSearchState = {
  results: SavedLocation[];
  loading: boolean;
  error: string | null;
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

/**
 * Debounced geocoding search. Returns ranked place predictions for the given
 * query, cancelling in-flight requests when the query changes or unmounts.
 */
export function usePlaceSearch(query: string, bias?: { lat: number; lon: number }): PlaceSearchState {
  const [state, setState] = useState<PlaceSearchState>({ results: [], loading: false, error: null });

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setState({ results: [], loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const timer = window.setTimeout(() => {
      searchPlaces(trimmed, { signal: controller.signal, lat: bias?.lat, lon: bias?.lon })
        .then((results) => setState({ results, loading: false, error: null }))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setState({ results: [], loading: false, error: 'Could not load results' });
        });
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, bias?.lat, bias?.lon]);

  return state;
}
