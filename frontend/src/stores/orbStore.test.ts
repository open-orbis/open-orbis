import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useOrbStore } from './orbStore';
import type { OrbData, OrbNode } from '../api/orbs';

// Mock the API module
vi.mock('../api/orbs', () => ({
  getMyOrb: vi.fn(),
  getPublicOrb: vi.fn(),
  addNode: vi.fn(),
  updateNode: vi.fn(),
  deleteNode: vi.fn(),
  updateVisibility: vi.fn(),
}));

vi.mock('./toastStore', () => ({
  useToastStore: { getState: () => ({ addToast: vi.fn() }) },
}));

vi.mock('./undoStore', () => ({
  useUndoStore: { getState: () => ({ pushUndo: vi.fn() }) },
}));

import * as orbsApi from '../api/orbs';

const MOCK_NODE: OrbNode = { uid: 'node-1', _labels: ['Skill'], name: 'Python' };
const MOCK_DATA: OrbData = {
  person: { name: 'Test' },
  nodes: [MOCK_NODE],
  links: [{ source: 'node-1', target: 'node-2', type: 'USED_SKILL' }],
};

describe('orbStore', () => {
  beforeEach(() => {
    useOrbStore.setState({ data: null, loading: false, error: null });
    vi.clearAllMocks();
  });

  it('fetchOrb populates data on success', async () => {
    vi.mocked(orbsApi.getMyOrb).mockResolvedValue(MOCK_DATA);
    await useOrbStore.getState().fetchOrb();
    expect(useOrbStore.getState().data).toEqual(MOCK_DATA);
    expect(useOrbStore.getState().loading).toBe(false);
  });

  it('fetchOrb sets error on failure', async () => {
    vi.mocked(orbsApi.getMyOrb).mockRejectedValue(new Error('fail'));
    await useOrbStore.getState().fetchOrb();
    expect(useOrbStore.getState().error).toBe('fail');
    expect(useOrbStore.getState().data).toBeNull();
  });

  it('addNode calls API and refreshes orb', async () => {
    useOrbStore.setState({ data: { ...MOCK_DATA, nodes: [] } });
    const newNode: OrbNode = { uid: 'node-new', _labels: ['Skill'], name: 'React' };
    vi.mocked(orbsApi.addNode).mockResolvedValue(newNode);
    vi.mocked(orbsApi.getMyOrb).mockResolvedValue({
      ...MOCK_DATA,
      nodes: [newNode],
    });

    const result = await useOrbStore.getState().addNode('skill', { name: 'React' });
    expect(result.uid).toBe('node-new');
    expect(orbsApi.addNode).toHaveBeenCalledWith('skill', { name: 'React' });
  });

  it('updateNode calls API', async () => {
    useOrbStore.setState({ data: MOCK_DATA });
    const updated: OrbNode = { uid: 'node-1', _labels: ['Skill'], name: 'Python 3' };
    vi.mocked(orbsApi.updateNode).mockResolvedValue(updated);
    vi.mocked(orbsApi.getMyOrb).mockResolvedValue({
      ...MOCK_DATA,
      nodes: [updated],
    });

    await useOrbStore.getState().updateNode('node-1', { name: 'Python 3' });
    expect(orbsApi.updateNode).toHaveBeenCalledWith('node-1', { name: 'Python 3' });
  });

  it('deleteNode calls API', async () => {
    useOrbStore.setState({ data: MOCK_DATA });
    vi.mocked(orbsApi.deleteNode).mockResolvedValue(undefined);
    vi.mocked(orbsApi.getMyOrb).mockResolvedValue({
      ...MOCK_DATA,
      nodes: [],
      links: [],
    });

    await useOrbStore.getState().deleteNode('node-1');
    expect(orbsApi.deleteNode).toHaveBeenCalledWith('node-1');
  });

  it('updateVisibility calls API', async () => {
    useOrbStore.setState({ data: MOCK_DATA });
    vi.mocked(orbsApi.updateVisibility).mockResolvedValue(undefined);
    vi.mocked(orbsApi.getMyOrb).mockResolvedValue({
      ...MOCK_DATA,
      person: { ...MOCK_DATA.person, visibility: 'public' },
    });

    await useOrbStore.getState().updateVisibility('public');
    expect(orbsApi.updateVisibility).toHaveBeenCalled();
  });
});
