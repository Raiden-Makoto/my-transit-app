import { useRef, useState, type ReactNode } from 'react';
import {
  Search,
  X,
  Home,
  Briefcase,
  Clock,
  CornerUpRight,
  MapPin,
  Loader2,
  Trash2,
  Star,
  FolderPlus,
  Folder,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
} from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { HistoryApi } from '../hooks/useLocationHistory';
import type { SavedPlacesApi } from '../hooks/useSavedPlaces';
import { COLLECTION_PLACE_LIMIT, COLLECTION_COLORS, type CollectionsApi } from '../hooks/useCollections';
import { usePlaceSearch, type SearchViewport } from '../hooks/usePlaceSearch';
import type { SavedLocation } from '../types/location';

type SearchBoxProps = {
  onLocationSelect?: (location: SavedLocation) => void;
  viewport?: SearchViewport;
  savedPlaces: SavedPlacesApi;
  collections: CollectionsApi;
  history: HistoryApi;
  onAddToList: (place: SavedLocation) => void;
};

type Slot = 'home' | 'work';

function formatAddress(loc: SavedLocation): string {
  return loc.secondaryText || loc.primaryText;
}

export default function SearchBox({
  onLocationSelect,
  viewport,
  savedPlaces,
  collections,
  history,
  onAddToList,
}: SearchBoxProps) {
  const [homeLoc, setHomeLoc] = useLocalStorage<SavedLocation | null>('user_home', null);
  const [workLoc, setWorkLoc] = useLocalStorage<SavedLocation | null>('user_work', null);
  const { recents, addToHistory, removeFromHistory } = history;
  const { saved, isSaved, toggleSaved, removeSaved } = savedPlaces;

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [assigning, setAssigning] = useState<Slot | null>(null);
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [renamingList, setRenamingList] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, loading, error } = usePlaceSearch(query, viewport);
  const hasQuery = query.trim().length > 0;

  const reset = () => {
    setQuery('');
    setAssigning(null);
    setFocused(false);
  };

  const selectLocation = (location: SavedLocation) => {
    if (assigning) {
      const saved: SavedLocation = {
        ...location,
        id: assigning,
        secondaryText: formatAddress(location),
      };
      if (assigning === 'home') setHomeLoc(saved);
      else setWorkLoc(saved);
      reset();
      return;
    }
    addToHistory(location);
    onLocationSelect?.(location);
    reset();
  };

  const clearSlot = (slot: Slot) => {
    if (slot === 'home') setHomeLoc(null);
    else setWorkLoc(null);
  };

  const submitNewList = () => {
    if (collections.createCollection(newListName)) {
      setNewListName('');
      setCreatingList(false);
    }
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingList(id);
    setRenameValue(currentName);
  };

  const submitRename = () => {
    if (renamingList) collections.renameCollection(renamingList, renameValue);
    setRenamingList(null);
    setRenameValue('');
  };

  const startAssigning = (slot: Slot) => {
    setAssigning(slot);
    setQuery('');
    setFocused(true);
    inputRef.current?.focus();
  };

  const handleSubmit = () => {
    if (results.length > 0) selectLocation(results[0]);
  };

  const placeholder =
    assigning === 'home'
      ? 'Choose home location'
      : assigning === 'work'
        ? 'Choose work location'
        : 'Search Transit Map';

  const renderSavedRow = (slot: Slot, loc: SavedLocation | null, label: string, icon: ReactNode) => (
    <div className="group flex w-full items-center px-4 py-2.5 transition-colors hover:bg-[#f5f5f5]">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => loc && selectLocation(loc)}
        className="flex flex-1 items-center min-w-0 text-left"
      >
        <span className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full bg-[#f1f3f4] text-[#5f6368]">
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <h3 className="m-0 text-[15px] font-medium leading-tight text-[#202124] truncate">{label}</h3>
          <p className="m-0 text-[13px] leading-snug text-[#5f6368] truncate">{loc ? formatAddress(loc) : 'Set location'}</p>
        </span>
      </button>
      <div className="flex items-center shrink-0 ml-2">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => startAssigning(slot)}
          className={`rounded px-2 py-1 text-[13px] font-medium text-[#1a73e8] transition-opacity hover:bg-[#e8f0fe] ${
            loc ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
          }`}
        >
          {loc ? 'Edit' : 'Set'}
        </button>
        {loc && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => clearSlot(slot)}
            className="ml-1 rounded-full p-1.5 text-[#5f6368] opacity-0 transition-opacity hover:bg-[#f1f3f4] group-hover:opacity-100"
            aria-label={`Remove ${label}`}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="absolute top-3 left-3 z-[1000] w-[min(92vw,400px)] font-sans text-[#202124]"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        // Keep the sheet open while focus moves between elements inside the box
        // (e.g. the search input -> the new-list field).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
    >
      {/* Floating search pill */}
      <div className="flex items-center h-12 bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.35)] focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
        <span className="flex items-center justify-center pl-[14px] pr-2 text-[#5f6368]">
          <Search size={20} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') reset();
          }}
          placeholder={placeholder}
          className="flex-1 h-full bg-transparent border-none outline-none text-[15px] text-[#202124] placeholder:text-[#5f6368]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="p-2 mr-0.5 rounded-full text-[#5f6368] transition-colors hover:bg-[#f1f3f4]"
            aria-label="Clear search"
          >
            <X size={20} />
          </button>
        )}
        <span className="w-px h-6 bg-[#e0e0e0]" />
        <button
          type="button"
          className="flex items-center justify-center w-12 h-full rounded-r-lg text-[#1a73e8] transition-colors hover:bg-[#e8f0fe]"
          aria-label="Directions"
        >
          <CornerUpRight size={20} />
        </button>
      </div>

      {/* Suggestions sheet */}
      {focused && (
        <div className="mt-1.5 bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.3)] overflow-hidden py-2">
          {assigning && (
            <div className="flex items-center justify-between px-4 py-2 mb-1 border-b border-[#eceff1]">
              <span className="text-[13px] font-medium text-[#5f6368]">
                Search for a place to set as {assigning === 'home' ? 'Home' : 'Work'}
              </span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={reset}
                className="text-[13px] font-medium text-[#1a73e8] hover:underline"
              >
                Cancel
              </button>
            </div>
          )}

          {hasQuery ? (
            <>
              {loading && (
                <div className="flex items-center gap-3 px-4 py-3 text-[14px] text-[#5f6368]">
                  <Loader2 size={18} className="animate-spin" />
                  Searching...
                </div>
              )}

              {!loading && error && <div className="px-4 py-3 text-[14px] text-[#b71c1c]">{error}</div>}

              {!loading && !error && results.length === 0 && (
                <div className="px-4 py-3 text-[14px] text-[#5f6368]">No results found</div>
              )}

              {!loading &&
                results.map((place) => {
                  const starred = isSaved(place.id);
                  return (
                    <div
                      key={place.id}
                      className="group flex w-full items-center px-4 py-2.5 transition-colors hover:bg-[#f5f5f5]"
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectLocation(place)}
                        className="flex flex-1 items-center min-w-0 text-left"
                      >
                        <span className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full bg-[#f1f3f4] text-[#5f6368]">
                          <MapPin size={18} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <h3 className="m-0 text-[15px] leading-tight text-[#202124] truncate">{place.primaryText}</h3>
                          {place.secondaryText && (
                            <p className="m-0 text-[13px] leading-snug text-[#5f6368] truncate">{place.secondaryText}</p>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onAddToList(place)}
                        className="ml-1 shrink-0 rounded-full p-1.5 text-[#5f6368] opacity-0 transition-opacity hover:bg-[#f1f3f4] group-hover:opacity-100"
                        aria-label={`Add ${place.primaryText} to a list`}
                      >
                        <FolderPlus size={18} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => toggleSaved(place)}
                        className={`ml-1 shrink-0 rounded-full p-1.5 transition-opacity hover:bg-[#f1f3f4] ${
                          starred ? 'text-[#1a73e8] opacity-100' : 'text-[#5f6368] opacity-0 group-hover:opacity-100'
                        }`}
                        aria-label={starred ? `Unsave ${place.primaryText}` : `Save ${place.primaryText}`}
                        aria-pressed={starred}
                      >
                        <Star size={18} fill={starred ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  );
                })}
            </>
          ) : (
            <>
              {renderSavedRow('home', homeLoc, 'Home', <Home size={18} />)}
              {renderSavedRow('work', workLoc, 'Work', <Briefcase size={18} />)}

              {saved.length > 0 && (
                <>
                  <div className="h-px my-1.5 bg-[#eceff1]" />
                  <p className="px-4 pt-1 pb-1 text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">Saved</p>
                  {saved.map((place) => (
                    <div
                      key={place.id}
                      className="group flex w-full items-center px-4 py-2.5 transition-colors hover:bg-[#f5f5f5]"
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectLocation(place)}
                        className="flex flex-1 items-center min-w-0 text-left"
                      >
                        <span className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full bg-[#e8f0fe] text-[#1a73e8]">
                          <Star size={18} fill="currentColor" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <h3 className="m-0 text-[15px] leading-tight text-[#202124] truncate">{place.primaryText}</h3>
                          {place.secondaryText && (
                            <p className="m-0 text-[13px] leading-snug text-[#5f6368] truncate">{place.secondaryText}</p>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => removeSaved(place.id)}
                        className="ml-2 shrink-0 rounded-full p-1.5 text-[#5f6368] opacity-0 transition-opacity hover:bg-[#f1f3f4] group-hover:opacity-100"
                        aria-label={`Remove ${place.primaryText} from saved`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              <div className="h-px my-1.5 bg-[#eceff1]" />
              <div className="flex items-center justify-between px-4 pt-1 pb-1">
                <p className="m-0 text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">Your lists</p>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setCreatingList((v) => !v)}
                  className="text-[13px] font-medium text-[#1a73e8] hover:underline"
                >
                  New list
                </button>
              </div>

              {creatingList && (
                <div className="flex items-center gap-2 px-4 py-2">
                  <FolderPlus size={18} className="shrink-0 text-[#5f6368]" />
                  <input
                    autoFocus
                    type="text"
                    value={newListName}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitNewList();
                      if (e.key === 'Escape') {
                        setCreatingList(false);
                        setNewListName('');
                      }
                    }}
                    placeholder="New list name"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-[#202124] placeholder:text-[#5f6368]"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={submitNewList}
                    disabled={!newListName.trim()}
                    className="shrink-0 rounded-full px-3 py-1 text-[13px] font-medium text-white bg-[#1a73e8] disabled:opacity-40"
                  >
                    Create
                  </button>
                </div>
              )}

              {collections.collections.length === 0 && !creatingList && (
                <p className="px-4 py-2 text-[13px] text-[#5f6368]">No lists yet</p>
              )}

              {collections.collections.map((list) => {
                const expanded = expandedList === list.id;
                return (
                  <div key={list.id}>
                    <div className="group flex w-full items-center px-4 py-2.5 transition-colors hover:bg-[#f5f5f5]">
                      <span
                        className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full"
                        style={{ backgroundColor: `${list.color || '#5f6368'}22`, color: list.color || '#5f6368' }}
                      >
                        <Folder size={18} />
                      </span>

                      {renamingList === list.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={renameValue}
                          onMouseDown={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename();
                            if (e.key === 'Escape') {
                              setRenamingList(null);
                              setRenameValue('');
                            }
                          }}
                          className="flex-1 min-w-0 bg-transparent outline-none border-b border-[#1a73e8] text-[15px] text-[#202124]"
                        />
                      ) : (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setExpandedList(expanded ? null : list.id)}
                          className="flex flex-1 items-center min-w-0 text-left"
                        >
                          <span className="flex-1 min-w-0">
                            <h3 className="m-0 text-[15px] leading-tight text-[#202124] truncate">{list.name}</h3>
                            <p className="m-0 text-[13px] leading-snug text-[#5f6368]">
                              {list.places.length}/{COLLECTION_PLACE_LIMIT} places
                            </p>
                          </span>
                          <span className="ml-2 shrink-0 text-[#5f6368]">
                            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </span>
                        </button>
                      )}

                      {renamingList === list.id ? (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={submitRename}
                          className="ml-1 shrink-0 rounded-full p-1.5 text-[#1a73e8] hover:bg-[#e8f0fe]"
                          aria-label="Save list name"
                        >
                          <Check size={16} />
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => startRename(list.id, list.name)}
                            className="ml-1 shrink-0 rounded-full p-1.5 text-[#5f6368] opacity-0 transition-opacity hover:bg-[#f1f3f4] group-hover:opacity-100"
                            aria-label={`Rename list ${list.name}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => collections.deleteCollection(list.id)}
                            className="ml-1 shrink-0 rounded-full p-1.5 text-[#5f6368] opacity-0 transition-opacity hover:bg-[#f1f3f4] group-hover:opacity-100"
                            aria-label={`Delete list ${list.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>

                    {expanded && (
                      <div className="flex items-center gap-2 pl-[60px] pr-4 pb-2">
                        {COLLECTION_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => collections.setCollectionColor(list.id, color)}
                            className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                            style={{
                              backgroundColor: color,
                              outline: list.color === color ? `2px solid ${color}` : 'none',
                              outlineOffset: 2,
                            }}
                            aria-label={`Set ${list.name} color`}
                          />
                        ))}
                      </div>
                    )}

                    {expanded &&
                      (list.places.length === 0 ? (
                        <p className="pl-[68px] pr-4 py-2 text-[13px] text-[#5f6368]">No places yet</p>
                      ) : (
                        list.places.map((place) => (
                          <div
                            key={place.id}
                            className="group/place flex w-full items-center pl-[60px] pr-4 py-2 transition-colors hover:bg-[#f5f5f5]"
                          >
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectLocation(place)}
                              className="flex flex-1 items-center min-w-0 text-left"
                            >
                              <MapPin size={16} className="mr-3 shrink-0 text-[#5f6368]" />
                              <span className="flex-1 min-w-0">
                                <span className="block text-[14px] text-[#202124] truncate">{place.primaryText}</span>
                                {place.secondaryText && (
                                  <span className="block text-[12px] text-[#5f6368] truncate">{place.secondaryText}</span>
                                )}
                              </span>
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => collections.removePlaceFromCollection(list.id, place.id)}
                              className="ml-2 shrink-0 rounded-full p-1.5 text-[#5f6368] opacity-0 transition-opacity hover:bg-[#f1f3f4] group-hover/place:opacity-100"
                              aria-label={`Remove ${place.primaryText} from ${list.name}`}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))
                      ))}
                  </div>
                );
              })}

              {recents.length > 0 && <div className="h-px my-1.5 bg-[#eceff1]" />}

              {recents.map((recent) => (
                <div
                  key={recent.id}
                  className="group flex w-full items-center px-4 py-2.5 transition-colors hover:bg-[#f5f5f5]"
                >
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectLocation(recent)}
                    className="flex flex-1 items-center min-w-0 text-left"
                  >
                    <span className="flex items-center justify-center w-9 h-9 mr-4 shrink-0 rounded-full bg-[#f1f3f4] text-[#5f6368]">
                      <Clock size={18} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <h3 className="m-0 text-[15px] leading-tight text-[#202124] truncate">{recent.primaryText}</h3>
                      <p className="m-0 text-[13px] leading-snug text-[#5f6368] truncate">{recent.secondaryText}</p>
                    </span>
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => removeFromHistory(recent.id)}
                    className="ml-2 shrink-0 rounded-full p-1.5 text-[#5f6368] opacity-0 transition-opacity hover:bg-[#f1f3f4] group-hover:opacity-100"
                    aria-label={`Remove ${recent.primaryText} from history`}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
