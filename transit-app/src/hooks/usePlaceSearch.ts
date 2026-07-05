import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../services/geocode';
import type { SavedLocation } from '../types/location';

type PlaceSearchState = {
  results: SavedLocation[];
  loading: boolean;
  error: string | null;
};

export type SearchViewport = {
  lat: number;
  lon: number;
  /** [minLon, minLat, maxLon, maxLat] used to keep results local. */
  bbox?: [number, number, number, number];
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

/**
 * Debounced geocoding search. Returns ranked place predictions for the given
 * query, cancelling in-flight requests when the query changes or unmounts.
 * The viewport biases and bounds results to the area currently in view.
 */
export function usePlaceSearch(query: string, viewport?: SearchViewport): PlaceSearchState {
  const [state, setState] = useState<PlaceSearchState>({ results: [], loading: false, error: null });

  // Read the viewport lazily at fetch time so map panning/settling (which
  // updates lat/lon/bbox) doesn't cancel and restart an in-flight search. The
  // search should only react to the query changing.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setState({ results: [], loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const timer = window.setTimeout(() => {
      const vp = viewportRef.current;
      searchPlaces(trimmed, {
        signal: controller.signal,
        lat: vp?.lat,
        lon: vp?.lon,
        bbox: vp?.bbox,
      })
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
  }, [query]);

  return state;
}
