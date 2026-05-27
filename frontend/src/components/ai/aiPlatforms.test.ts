import { describe, it, expect } from 'vitest';
import {
  PLATFORMS,
  STARTER_PROMPTS,
  LAST_VERIFIED,
  type PlatformId,
} from './aiPlatforms';

describe('aiPlatforms', () => {
  it('defines the five expected platforms in order', () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(ids).toEqual<PlatformId[]>([
      'claude',
      'chatgpt',
      'perplexity',
      'gemini',
      'lovable',
    ]);
  });

  it('every platform has complete, well-formed content', () => {
    for (const p of PLATFORMS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.icon.length).toBeGreaterThan(0);
      expect(p.supportHint.length).toBeGreaterThan(0);
      expect(p.authBadge.length).toBeGreaterThan(0);
      expect(p.steps.length).toBeGreaterThanOrEqual(3);
      expect(p.steps.every((s) => s.trim().length > 0)).toBe(true);
      expect(p.docsUrl).toMatch(/^https:\/\//);
    }
  });

  it('flags the platforms that need a caveat', () => {
    const byId = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));
    expect(byId.gemini.caveat).toBeTruthy();
    expect(byId.lovable.caveat).toBeTruthy();
  });

  it('exposes a YYYY-MM-DD verification date', () => {
    expect(LAST_VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('provides starter prompts incl. a Lovable-specific one', () => {
    expect(STARTER_PROMPTS.length).toBeGreaterThanOrEqual(3);
    expect(STARTER_PROMPTS.some((p) => p.platformId === 'lovable')).toBe(true);
    expect(STARTER_PROMPTS.some((p) => !p.platformId)).toBe(true);
  });
});
