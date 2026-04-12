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

    // Clone so we never mutate the stack entry in place (#228 undo bug).
    let redoEntry = { ...undoStack[undoStack.length - 1] };

    if (redoEntry.type === 'add') {
      await orbsApi.deleteNode(redoEntry.nodeUid);
    } else {
      const node = await orbsApi.addNode(redoEntry.nodeType, redoEntry.properties);
      if (redoEntry.relationships) {
        for (const rel of redoEntry.relationships) {
          if (rel.type === 'USED_SKILL') {
            try {
              await orbsApi.linkSkill(node.uid, rel.target);
            } catch { /* best effort */ }
          }
        }
      }
      redoEntry = { ...redoEntry, nodeUid: node.uid };
    }

    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, redoEntry],
    }));
  },

  redo: async () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;

    let undoEntry = { ...redoStack[redoStack.length - 1] };

    if (undoEntry.type === 'add') {
      const node = await orbsApi.addNode(undoEntry.nodeType, undoEntry.properties);
      undoEntry = { ...undoEntry, nodeUid: node.uid };
    } else {
      await orbsApi.deleteNode(undoEntry.nodeUid);
    }

    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, undoEntry],
    }));
  },

  clear: () => set({ undoStack: [], redoStack: [] }),
}));
