interface CacheItem<T> {
  data: T;
  timestamp: number;
  userId: string;
}

const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export function setCacheItem<T>(key: string, data: T, userId: string): void {
  const item: CacheItem<T> = {
    data,
    timestamp: Date.now(),
    userId
  };
  localStorage.setItem(`${key}_${userId}`, JSON.stringify(item));
}

export function getCacheItem<T>(key: string, userId: string): T | null {
  const item = localStorage.getItem(`${key}_${userId}`);
  if (!item) return null;

  try {
    const parsed = JSON.parse(item) as CacheItem<T>;
    
    // Check if cache is expired
    if (Date.now() - parsed.timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(`${key}_${userId}`);
      return null;
    }

    // Check if the cached item belongs to the current user
    if (parsed.userId !== userId) {
      localStorage.removeItem(`${key}_${userId}`);
      return null;
    }

    return parsed.data;
  } catch {
    localStorage.removeItem(`${key}_${userId}`);
    return null;
  }
}

export function removeCacheItem(key: string, userId: string): void {
  localStorage.removeItem(`${key}_${userId}`);
}

export function clearAllCache(): void {
  localStorage.clear();
}

export function clearUserCache(userId: string): void {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.endsWith(`_${userId}`)) {
      localStorage.removeItem(key);
    }
  }
} 