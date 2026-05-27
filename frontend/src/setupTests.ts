import '@testing-library/jest-dom';

// Node 22+ ships a native Web Storage API that can shadow jsdom's
// localStorage inside the vitest worker — its methods throw without a
// backing file, breaking tests that touch localStorage. Install a
// deterministic in-memory implementation so tests get a consistent
// localStorage on every Node version (20, 22, 25, …) and in CI.
class MemoryStorage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage() as unknown as Storage,
});
