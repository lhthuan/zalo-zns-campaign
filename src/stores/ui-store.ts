import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/translations";

interface UiState {
  locale: Locale;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  setLocale: (locale: Locale) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      sidebarCollapsed: false,
      mobileNavOpen: false,
      setLocale: (locale) => set({ locale }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
    }),
    {
      name: "zns-ui",
      partialize: (s) => ({ locale: s.locale, sidebarCollapsed: s.sidebarCollapsed }),
      // Rehydrated from <Providers> after mount, so the first client render
      // matches the server-rendered HTML (default locale, expanded sidebar).
      skipHydration: true,
    }
  )
);
