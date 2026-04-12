import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUndoStore } from './undoStore';

vi.mock('../api/orbs', () => ({
  addNode: vi.fn(),
  deleteNode: vi.fn(),
  linkSkill: vi.fn(),
}));

import * as orbsApi from '../api/orbs';

describe('undoStore', () => {
  beforeEach(() => {
    useUndoStore.setState({ undoStack: [], redoStack: [] });
    vi.clearAllMocks();
  });

  it('pushUndo adds to stack and clears redo', () => {
    useUndoStore.setState({ redoStack: [{ type: 'add', nodeUid: 'x', nodeType: 'skill', properties: {} }] });
    useUndoStore.getState().pushUndo({
      type: 'add',
      nodeUid: 'node-1',
      nodeType: 'skill',
      properties: { name: 'Python' },
    });

    const { undoStack, redoStack } = useUndoStore.getState();
    expect(undoStack).toHaveLength(1);
    expect(undoStack[0].nodeUid).toBe('node-1');
    expect(redoStack).toHaveLength(0);
  });

  it('undo of add calls deleteNode', async () => {
    vi.mocked(orbsApi.deleteNode).mockResolvedValue(undefined);
    useUndoStore.setState({
      undoStack: [{ type: 'add', nodeUid: 'node-1', nodeType: 'skill', properties: { name: 'Python' } }],
    });

    await useUndoStore.getState().undo();

    expect(orbsApi.deleteNode).toHaveBeenCalledWith('node-1');
    expect(useUndoStore.getState().undoStack).toHaveLength(0);
    expect(useUndoStore.getState().redoStack).toHaveLength(1);
  });

  it('undo of delete calls addNode and updates uid in redo stack', async () => {
    vi.mocked(orbsApi.addNode).mockResolvedValue({
      uid: 'node-new',
      _labels: ['Skill'],
      name: 'Python',
    });
    useUndoStore.setState({
      undoStack: [{
        type: 'delete' as const,
        nodeUid: 'node-old',
        nodeType: 'skill',
        properties: { name: 'Python' },
      }],
    });

    await useUndoStore.getState().undo();

    expect(orbsApi.addNode).toHaveBeenCalledWith('skill', { name: 'Python' });
    // The redo stack entry should have the NEW uid
    expect(useUndoStore.getState().redoStack[0].nodeUid).toBe('node-new');
  });

  it('clear resets both stacks', () => {
    useUndoStore.setState({
      undoStack: [{ type: 'add', nodeUid: 'x', nodeType: 'skill', properties: {} }],
      redoStack: [{ type: 'add', nodeUid: 'y', nodeType: 'skill', properties: {} }],
    });

    useUndoStore.getState().clear();

    expect(useUndoStore.getState().undoStack).toHaveLength(0);
    expect(useUndoStore.getState().redoStack).toHaveLength(0);
  });
});
