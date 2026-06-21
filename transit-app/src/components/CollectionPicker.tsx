import { useState } from 'react';
import { Check, Plus, FolderPlus } from 'lucide-react';
import { COLLECTION_PLACE_LIMIT, type CollectionsApi } from '../hooks/useCollections';
import type { SavedLocation } from '../types/location';

type CollectionPickerProps = {
  place: SavedLocation;
  collections: CollectionsApi;
  onClose: () => void;
};

export default function CollectionPicker({ place, collections, onClose }: CollectionPickerProps) {
  const [newName, setNewName] = useState('');
  const { collections: lists, createCollection, addPlaceToCollection, removePlaceFromCollection, isPlaceInCollection } =
    collections;

  const toggle = (id: string) => {
    if (isPlaceInCollection(id, place.id)) {
      removePlaceFromCollection(id, place.id);
    } else {
      addPlaceToCollection(id, place);
    }
  };

  const handleCreate = () => {
    const created = createCollection(newName);
    if (created) {
      addPlaceToCollection(created.id, place);
      setNewName('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 font-sans"
      onMouseDown={onClose}
    >
      <div
        className="w-[min(92vw,360px)] max-h-[80vh] overflow-hidden flex flex-col bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2">
          <h2 className="m-0 text-[17px] font-semibold text-black">Save to list</h2>
          <p className="m-0 text-[13px] text-[#5f6368] truncate">{place.primaryText}</p>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {lists.length === 0 && (
            <p className="px-4 py-3 text-[14px] text-[#5f6368]">No lists yet. Create one below.</p>
          )}
          {lists.map((list) => {
            const checked = isPlaceInCollection(list.id, place.id);
            const full = list.places.length >= COLLECTION_PLACE_LIMIT;
            const disabled = full && !checked;
            return (
              <button
                key={list.id}
                type="button"
                onClick={() => !disabled && toggle(list.id)}
                disabled={disabled}
                className={`flex w-full items-center px-4 py-2.5 text-left transition-colors ${
                  disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-[#f5f5f5]'
                }`}
              >
                <span
                  className={`flex items-center justify-center w-6 h-6 mr-3 shrink-0 rounded border ${
                    checked ? 'bg-[#1a73e8] border-[#1a73e8] text-white' : 'border-[#bdc1c6] text-transparent'
                  }`}
                >
                  <Check size={16} />
                </span>
                <span
                  className="w-3 h-3 mr-3 shrink-0 rounded-full"
                  style={{ backgroundColor: list.color || '#5f6368' }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] text-[#202124] truncate">{list.name}</span>
                  <span className="block text-[12px] text-[#5f6368]">
                    {list.places.length}/{COLLECTION_PLACE_LIMIT}
                    {full ? ' · Full' : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-[#eceff1]">
          <FolderPlus size={20} className="text-[#5f6368] shrink-0" />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="New list name"
            className="flex-1 min-w-0 outline-none text-[14px] text-[#202124] placeholder:text-[#5f6368] bg-transparent"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="flex items-center gap-1 shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-white bg-[#1a73e8] disabled:opacity-40"
          >
            <Plus size={16} />
            Create
          </button>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-[#eceff1]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-2 text-[14px] font-medium text-white bg-[#1a73e8] hover:bg-[#1765cc]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
