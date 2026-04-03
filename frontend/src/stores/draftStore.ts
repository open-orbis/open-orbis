import { create } from 'zustand';
import * as draftsApi from '../api/drafts';
import type { DraftNote } from '../api/drafts';
import { useToastStore } from './toastStore';

interface DraftState {
  notes: DraftNote[];
  loading: boolean;
  error: string | null;
  fetchDrafts: () => Promise<void>;
  addDraft: (text: string, fromVoice?: boolean) => Promise<DraftNote>;
  updateDraft: (uid: string, text: string) => Promise<void>;
  deleteDraft: (uid: string) => Promise<void>;
  setNotes: (notes: DraftNote[]) => void;
}

export const useDraftStore = create<DraftState>((set, get) => ({
  notes: [],
  loading: false,
  error: null,

  setNotes: (notes) => set({ notes }),

  fetchDrafts: async () => {
    set({ loading: true, error: null });
    try {
      const notes = await draftsApi.getDrafts();
      set({ notes, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  addDraft: async (text: string, fromVoice = false) => {
    try {
      const note = await draftsApi.createDraft(text, fromVoice);
      set({ notes: [note, ...get().notes] });
      return note;
    } catch (e) {
      useToastStore.getState().addToast('Failed to save draft', 'error');
      throw e;
    }
  },

  updateDraft: async (uid: string, text: string) => {
    try {
      const updated = await draftsApi.updateDraft(uid, text);
      set({
        notes: get().notes.map((n) => (n.uid === uid ? updated : n)),
      });
    } catch (e) {
      useToastStore.getState().addToast('Failed to update draft', 'error');
      throw e;
    }
  },

  deleteDraft: async (uid: string) => {
    try {
      await draftsApi.deleteDraft(uid);
      set({
        notes: get().notes.filter((n) => n.uid !== uid),
      });
    } catch (e) {
      useToastStore.getState().addToast('Failed to delete draft', 'error');
      throw e;
    }
  },
}));
