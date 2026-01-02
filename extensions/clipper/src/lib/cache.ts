/**
 * API Response Cache for Browser Extension
 *
 * Two-tier caching:
 * 1. In-memory Map for fast access within session
 * 2. IndexedDB for persistence across sessions
 *
 * Default TTL: 10 minutes (academic metadata rarely changes)
 */

const DB_NAME = "extenote-clipper-cache";
const DB_VERSION = 1;
const STORE_NAME = "api-responses";
const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  url: string;
}

// In-memory cache for fast access
const memoryCache = new Map<string, CacheEntry<unknown>>();

// IndexedDB instance (lazy initialized)
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open or create the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.warn("[Cache] IndexedDB open failed:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "url" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Get entry from IndexedDB
 */
async function getFromDB<T>(url: string): Promise<CacheEntry<T> | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.warn("[Cache] IndexedDB get failed:", request.error);
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Save entry to IndexedDB
 */
async function saveToDB<T>(entry: CacheEntry<T>): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.warn("[Cache] IndexedDB save failed:", tx.error);
        resolve();
      };
    });
  } catch {
    // Silently fail - caching is optional
  }
}

/**
 * Check if entry is still valid
 */
function isValid<T>(entry: CacheEntry<T> | null, ttl: number): entry is CacheEntry<T> {
  if (!entry) return false;
  return Date.now() - entry.timestamp < ttl;
}

/**
 * Get cached response or null if not found/expired
 */
export async function getCached<T>(url: string, ttl = DEFAULT_TTL): Promise<T | null> {
  // Check memory cache first
  const memEntry = memoryCache.get(url) as CacheEntry<T> | undefined;
  if (isValid(memEntry ?? null, ttl)) {
    return memEntry!.data;
  }

  // Check IndexedDB
  const dbEntry = await getFromDB<T>(url);
  if (isValid(dbEntry, ttl)) {
    // Promote to memory cache
    memoryCache.set(url, dbEntry);
    return dbEntry.data;
  }

  return null;
}

/**
 * Save response to cache
 */
export async function setCache<T>(url: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = {
    url,
    data,
    timestamp: Date.now(),
  };

  // Save to memory
  memoryCache.set(url, entry);

  // Save to IndexedDB (async, don't wait)
  saveToDB(entry);
}

/**
 * Cached fetch wrapper
 * Checks cache first, fetches if not found/expired, caches result
 */
export async function cachedFetch<T>(
  url: string,
  options?: RequestInit,
  ttl = DEFAULT_TTL
): Promise<T | null> {
  // Check cache
  const cached = await getCached<T>(url, ttl);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      return null;
    }

    const data = await response.json() as T;

    // Cache the result
    await setCache(url, data);

    return data;
  } catch {
    return null;
  }
}

/**
 * Clear all cached data
 */
export async function clearCache(): Promise<void> {
  memoryCache.clear();

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  memoryEntries: number;
  dbEntries: number;
}> {
  let dbEntries = 0;

  try {
    const db = await openDB();
    dbEntries = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();
      countReq.onsuccess = () => resolve(countReq.result);
      countReq.onerror = () => resolve(0);
    });
  } catch {
    // Ignore
  }

  return {
    memoryEntries: memoryCache.size,
    dbEntries,
  };
}

/**
 * Clean up expired entries from IndexedDB
 * Call this periodically to prevent unbounded growth
 */
export async function cleanupExpired(ttl = DEFAULT_TTL): Promise<number> {
  const cutoff = Date.now() - ttl;
  let deleted = 0;

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("timestamp");
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => resolve(deleted);
    });
  } catch {
    return 0;
  }
}
