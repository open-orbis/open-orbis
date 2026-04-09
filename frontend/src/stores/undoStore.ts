import { create } from 'zustand';
import * as orbsApi from '../api/orbs';

interface UndoEntry {
  type: 'add' | 'delete';
  nodeUid: string;
  nodeType: string;
  properties: Record<string, unknown>;
  relationships?: Array<{ source: string; target: string; type: string }>;
}

interface UndoState {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  pushUndo: (entry: UndoEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
}

const MAX_UNDO_STEPS = 100;

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushUndo: (entry: UndoEntry) => {
    set((state) => ({
      undoStack: [...state.undoStack, entry].slice(-MAX_UNDO_STEPS),
      redoStack: [],
    }));
  },

  undo: async () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;

    const entry = undoStack[undoStack.length - 1];

    if (entry.type === 'add') {
      await orbsApi.deleteNode(entry.nodeUid);
    } else {
      const node = await orbsApi.addNode(entry.nodeType, entry.properties);
      if (entry.relationships) {
        for (const rel of entry.relationships) {
          if (rel.type === 'USED_SKILL') {
            try {
              await orbsApi.linkSkill(node.uid, rel.target);
            } catch { /* best effort */ }
          }
        }
      }
      entry.nodeUid = node.uid;
    }

    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, entry],
    }));
  },

  redo: async () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;

    const entry = redoStack[redoStack.length - 1];

    if (entry.type === 'add') {
      const node = await orbsApi.addNode(entry.nodeType, entry.properties);
      entry.nodeUid = node.uid;
    } else {
      await orbsApi.deleteNode(entry.nodeUid);
    }

    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, entry],
    }));
  },

  clear: () => set({ undoStack: [], redoStack: [] }),
}));
