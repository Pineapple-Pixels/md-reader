import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface NavState {
  openTabs: string[];
  favorites: string[];
  openTab: (file: string) => void;
  closeTab: (file: string) => void;
  toggleFavorite: (file: string) => void;
  isFavorite: (file: string) => boolean;
  recents: () => string[];
}

const useFavoritesStore = create<{ favorites: string[]; toggle: (f: string) => void }>()(
  persist(
    (set, get) => ({
      favorites: [],
      toggle: (file: string) => {
        const favs = get().favorites;
        set({ favorites: favs.includes(file) ? favs.filter(f => f !== file) : [...favs, file] });
      },
    }),
    { name: 'md-reader-favorites', storage: createJSONStorage(() => localStorage) },
  ),
);

export const useNavStore = create<NavState>()(
  persist(
    (set, get) => ({
      openTabs: [],
      get favorites() { return useFavoritesStore.getState().favorites; },
      openTab: (file: string) => {
        const tabs = get().openTabs;
        if (!tabs.includes(file)) set({ openTabs: [...tabs, file] });
      },
      closeTab: (file: string) => {
        set({ openTabs: get().openTabs.filter(t => t !== file) });
      },
      toggleFavorite: (file: string) => {
        useFavoritesStore.getState().toggle(file);
      },
      isFavorite: (file: string) => {
        return useFavoritesStore.getState().favorites.includes(file);
      },
      recents: () => {
        const favs = useFavoritesStore.getState().favorites;
        return get().openTabs.filter(t => !favs.includes(t)).slice(-3).reverse();
      },
    }),
    {
      name: 'md-reader-nav',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ openTabs: state.openTabs }),
    },
  ),
);

export const useFavorites = () => useFavoritesStore((s) => s.favorites);
