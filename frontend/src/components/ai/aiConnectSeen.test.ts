import { describe, it, expect, beforeEach } from 'vitest';
import {
  isAiConnectSeen,
  markAiConnectSeen,
  resetAiConnectSeen,
  shouldAutoOpenAiConnect,
} from './aiConnectSeen';

describe('aiConnectSeen', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to not seen', () => {
    expect(isAiConnectSeen()).toBe(false);
  });

  it('mark then reset toggles the flag', () => {
    markAiConnectSeen();
    expect(isAiConnectSeen()).toBe(true);
    resetAiConnectSeen();
    expect(isAiConnectSeen()).toBe(false);
  });

  it('auto-opens only when the tour is complete and it was not seen', () => {
    expect(shouldAutoOpenAiConnect(true, false)).toBe(true);
    expect(shouldAutoOpenAiConnect(true, true)).toBe(false);
    expect(shouldAutoOpenAiConnect(false, false)).toBe(false);
    expect(shouldAutoOpenAiConnect(false, true)).toBe(false);
  });
});
