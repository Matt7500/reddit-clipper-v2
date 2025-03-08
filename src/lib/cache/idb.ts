import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'reddit-clipper-cache';
const DB_VERSION = 1;

interface CacheItem<T> {
  data: T;
  timestamp: number;
  userId: string;
}

const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

class IndexedDBCache {
  private db: Promise<IDBPDatabase>;

  constructor() {
    this.db = this.initDB();
  }

  private async initDB() {
    return openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create stores for different types of data
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
        if (!db.objectStoreNames.contains('profiles')) {
          db.createObjectStore('profiles');
        }
      },
    });
  }

  async set<T>(store: string, key: string, data: T, userId: string): Promise<void> {
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      userId,
    };

    const db = await this.db;
    await db.put(store, item, `${key}_${userId}`);
  }

  async get<T>(store: string, key: string, userId: string): Promise<T | null> {
    try {
      const db = await this.db;
      const item = await db.get(store, `${key}_${userId}`) as CacheItem<T> | undefined;

      if (!item) return null;

      // Check if cache is expired
      if (Date.now() - item.timestamp > CACHE_EXPIRY) {
        await this.delete(store, key, userId);
        return null;
      }

      // Check if the cached item belongs to the current user
      if (item.userId !== userId) {
        await this.delete(store, key, userId);
        return null;
      }

      return item.data;
    } catch (error) {
      console.error('Error reading from IndexedDB:', error);
      return null;
    }
  }

  async delete(store: string, key: string, userId: string): Promise<void> {
    const db = await this.db;
    await db.delete(store, `${key}_${userId}`);
  }

  async clear(store: string): Promise<void> {
    const db = await this.db;
    await db.clear(store);
  }

  async clearUserData(store: string, userId: string): Promise<void> {
    const db = await this.db;
    const keys = await db.getAllKeys(store);
    const userKeys = keys.filter(key => typeof key === 'string' && key.endsWith(`_${userId}`));
    
    for (const key of userKeys) {
      await db.delete(store, key);
    }
  }
}

export const idbCache = new IndexedDBCache(); 