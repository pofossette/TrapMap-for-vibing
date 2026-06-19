import { create } from 'zustand';

type UiStore = {
  confirmDialog: {
    body: string;
    open: boolean;
    title: string;
  };
  sidebarOpen: boolean;
  closeConfirmDialog: () => void;
  openConfirmDialog: (title: string, body: string) => void;
  toggleSidebar: () => void;
};

export const useUiStore = create<UiStore>((set) => ({
  confirmDialog: {
    open: false,
    title: '',
    body: '',
  },
  sidebarOpen: false,
  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),
  openConfirmDialog: (title, body) =>
    set({
      confirmDialog: {
        open: true,
        title,
        body,
      },
    }),
  closeConfirmDialog: () =>
    set({
      confirmDialog: {
        open: false,
        title: '',
        body: '',
      },
    }),
}));
