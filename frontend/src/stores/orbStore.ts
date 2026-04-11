import { create } from 'zustand';
import * as orbsApi from '../api/orbs';
import type { OrbData, OrbNode, OrbVisibility } from '../api/orbs';
import { useToastStore } from './toastStore';
import { useUndoStore } from './undoStore';

interface OrbState {
  data: OrbData | null;
  loading: boolean;
  error: string | null;
  fetchOrb: () => Promise<void>;
  fetchPublicOrb: (orbId: string, token?: string | null) => Promise<void>;
  addNode: (nodeType: string, properties: Record<string, unknown>) => Promise<OrbNode>;
  updateNode: (uid: string, properties: Record<string, unknown>) => Promise<void>;
  deleteNode: (uid: string, nodeType?: string, properties?: Record<string, unknown>, relationships?: Array<{ source: string; target: string; type: string }>) => Promise<void>;
  updateVisibility: (visibility: OrbVisibility) => Promise<void>;
}

export const useOrbStore = create<OrbState>((set, get) => ({
  data: null,
  loading: false,
  error: null,

  fetchOrb: async () => {
    set({ loading: true, error: null });
    try {
      const data = await orbsApi.getMyOrb();
      set({ data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchPublicOrb: async (orbId: string, token?: string | null) => {
    set({ loading: true, error: null });
    try {
      const data = await orbsApi.getPublicOrb(orbId, token);
      set({ data, loading: false });
    } catch (e) {
      // Prefer FastAPI's detail message so UI can distinguish private vs invalid token
      const err = e as { response?: { status?: number; data?: { detail?: string } }; message?: string };
      const detail = err?.response?.data?.detail;
      const status = err?.response?.status;
      const message = detail
        ? `${status ?? ''} ${detail}`.trim()
        : err?.message ?? 'Failed to load orb';
      set({ error: message, loading: false });
    }
  },

  addNode: async (nodeType: string, properties: Record<string, unknown>) => {
    try {
      const node = await orbsApi.addNode(nodeType, properties);
      await get().fetchOrb();
      useToastStore.getState().addToast('Entry added to your orbis', 'success');
      useUndoStore.getState().pushUndo({
        type: 'add',
        nodeUid: node.uid,
        nodeType,
        properties,
      });
      return node;
    } catch (e) {
      useToastStore.getState().addToast('Failed to add entry', 'error');
      throw e;
    }
  },

  updateNode: async (uid: string, properties: Record<string, unknown>) => {
    try {
      await orbsApi.updateNode(uid, properties);
      await get().fetchOrb();
      useToastStore.getState().addToast('Entry updated', 'success');
    } catch (e) {
      useToastStore.getState().addToast('Failed to update entry', 'error');
      throw e;
    }
  },

  deleteNode: async (uid: string, nodeType?: string, properties?: Record<string, unknown>, relationships?: Array<{ source: string; target: string; type: string }>) => {
    try {
      await orbsApi.deleteNode(uid);
      await get().fetchOrb();
      useToastStore.getState().addToast('Entry deleted', 'success');
      if (nodeType && properties) {
        useUndoStore.getState().pushUndo({
          type: 'delete',
          nodeUid: uid,
          nodeType,
          properties,
          relationships,
        });
      }
    } catch (e) {
      useToastStore.getState().addToast('Failed to delete entry', 'error');
      throw e;
    }
  },

  updateVisibility: async (visibility: OrbVisibility) => {
    try {
      await orbsApi.updateVisibility(visibility);
      await get().fetchOrb();
    } catch (e) {
      useToastStore.getState().addToast('Failed to update visibility', 'error');
      throw e;
    }
  },
}));
