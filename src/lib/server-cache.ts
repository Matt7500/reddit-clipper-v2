import NodeCache from 'node-cache';

// Cache TTL (Time To Live) in seconds
const CACHE_TTL = 24 * 60 * 60; // 24 hours

interface CacheOptions {
  ttl?: number;
}

class ServerCache {
  private settingsCache: NodeCache;
  private profilesCache: NodeCache;
  private ttl: number;

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl || CACHE_TTL;
    this.settingsCache = new NodeCache({
      stdTTL: this.ttl,
      checkperiod: this.ttl * 0.2,
      useClones: false,
    });
    this.profilesCache = new NodeCache({
      stdTTL: this.ttl,
      checkperiod: this.ttl * 0.2,
      useClones: false,
    });
  }

  // Settings methods
  getSettings<T>(userId: string): T | null {
    const value = this.settingsCache.get<T>(userId);
    return value || null;
  }

  setSettings<T>(userId: string, value: T): void {
    this.settingsCache.set(userId, value, this.ttl);
  }

  deleteSettings(userId: string): void {
    this.settingsCache.del(userId);
  }

  // Profiles methods
  getProfiles<T>(userId: string): T[] | null {
    const value = this.profilesCache.get<T[]>(userId);
    return value || null;
  }

  setProfiles<T>(userId: string, value: T[]): void {
    this.profilesCache.set(userId, value, this.ttl);
  }

  deleteProfiles(userId: string): void {
    this.profilesCache.del(userId);
  }

  // Clear all caches
  clear(): void {
    this.settingsCache.flushAll();
    this.profilesCache.flushAll();
  }
}

export const serverCache = new ServerCache(); 