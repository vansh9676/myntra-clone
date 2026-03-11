import * as SecureStore from "expo-secure-store";

const API_BASE_URL = "https://myntra-clone-xj36.onrender.com";
const STORAGE_PREFIX = "@myntra/recently_viewed";
const ANONYMOUS_SCOPE = "anonymous";

export const MAX_RECENTLY_VIEWED_ITEMS = 20;

export interface ProductSnapshot {
  name: string;
  image: string;
  price: number;
}

export interface RecentlyViewedItem {
  productId: string;
  viewedAt: number;
  productSnapshot?: ProductSnapshot;
}

const getStorageKey = (userId: string | null | undefined) =>
  `${STORAGE_PREFIX}:${userId ?? ANONYMOUS_SCOPE}`;

const normalizeSnapshot = (
  snapshot?: Partial<ProductSnapshot>
): ProductSnapshot | undefined => {
  if (!snapshot) {
    return undefined;
  }

  const name = typeof snapshot.name === "string" ? snapshot.name : "";
  const image = typeof snapshot.image === "string" ? snapshot.image : "";
  const price =
    typeof snapshot.price === "number" && Number.isFinite(snapshot.price)
      ? snapshot.price
      : 0;

  if (!name && !image && !price) {
    return undefined;
  }

  return { name, image, price };
};

const normalizeItem = (item: unknown): RecentlyViewedItem | null => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const candidate = item as {
    productId?: unknown;
    viewedAt?: unknown;
    productSnapshot?: unknown;
  };

  if (typeof candidate.productId !== "string" || !candidate.productId.trim()) {
    return null;
  }

  const viewedAt = Number(candidate.viewedAt);
  if (!Number.isFinite(viewedAt)) {
    return null;
  }

  const productSnapshot =
    candidate.productSnapshot && typeof candidate.productSnapshot === "object"
      ? normalizeSnapshot(candidate.productSnapshot as Partial<ProductSnapshot>)
      : undefined;

  return {
    productId: candidate.productId,
    viewedAt,
    productSnapshot,
  };
};

export const mergeLists = (...lists: RecentlyViewedItem[][]): RecentlyViewedItem[] => {
  const deduped = new Map<string, RecentlyViewedItem>();

  for (const list of lists) {
    for (const rawItem of list) {
      const item = normalizeItem(rawItem);
      if (!item) {
        continue;
      }

      const existing = deduped.get(item.productId);
      if (!existing || item.viewedAt > existing.viewedAt) {
        deduped.set(item.productId, item);
      }
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .slice(0, MAX_RECENTLY_VIEWED_ITEMS);
};

export const loadLocally = async (
  userId: string | null = null
): Promise<RecentlyViewedItem[]> => {
  try {
    const raw = await SecureStore.getItemAsync(getStorageKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return mergeLists(parsed);
  } catch (error) {
    console.error("Failed to load recently viewed data", error);
    return [];
  }
};

export const saveLocally = async (
  items: RecentlyViewedItem[],
  userId: string | null = null
): Promise<RecentlyViewedItem[]> => {
  const normalized = mergeLists(items);

  try {
    await SecureStore.setItemAsync(
      getStorageKey(userId),
      JSON.stringify(normalized)
    );
  } catch (error) {
    console.error("Failed to save recently viewed data", error);
  }

  return normalized;
};

export const clearLocally = async (userId: string | null = null): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(getStorageKey(userId));
  } catch (error) {
    console.error("Failed to clear recently viewed data", error);
  }
};

export const addRecentlyViewed = async (
  productId: string,
  productSnapshot?: Partial<ProductSnapshot>,
  userId: string | null = null
): Promise<RecentlyViewedItem[]> => {
  const current = await loadLocally(userId);
  const nextItem: RecentlyViewedItem = {
    productId,
    viewedAt: Date.now(),
    productSnapshot: normalizeSnapshot(productSnapshot),
  };

  const updated = mergeLists([nextItem], current);
  return saveLocally(updated, userId);
};

const fetchServerHistory = async (userId: string): Promise<RecentlyViewedItem[]> => {
  const response = await fetch(
    `${API_BASE_URL}/recently-viewed/${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch server history");
  }

  const data = await response.json();
  return Array.isArray(data) ? mergeLists(data) : [];
};

const pushHistoryToServer = async (
  userId: string,
  items: RecentlyViewedItem[]
): Promise<RecentlyViewedItem[]> => {
  const response = await fetch(
    `${API_BASE_URL}/recently-viewed/sync/${encodeURIComponent(userId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: mergeLists(items) }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to sync history");
  }

  const data = await response.json();
  return Array.isArray(data) ? mergeLists(data) : [];
};

export const trackOnServer = async (
  userId: string,
  item: RecentlyViewedItem
): Promise<RecentlyViewedItem[]> => {
  const response = await fetch(`${API_BASE_URL}/recently-viewed/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      productId: item.productId,
      viewedAt: item.viewedAt,
      productSnapshot: item.productSnapshot,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to track recently viewed item");
  }

  const data = await response.json();
  return Array.isArray(data) ? mergeLists(data) : [];
};

export const syncWithServer = async (
  userId: string
): Promise<RecentlyViewedItem[]> => {
  const local = await loadLocally(userId);

  try {
    const server = await fetchServerHistory(userId);
    const merged = mergeLists(local, server);
    const synced = await pushHistoryToServer(userId, merged);
    await saveLocally(synced, userId);
    return synced;
  } catch (error) {
    console.error("Recently viewed sync failed", error);
    return local;
  }
};

export const handleLogin = async (userId: string): Promise<RecentlyViewedItem[]> => {
  const [anonymousLocal, userLocal] = await Promise.all([
    loadLocally(null),
    loadLocally(userId),
  ]);

  let merged = mergeLists(anonymousLocal, userLocal);

  try {
    const server = await fetchServerHistory(userId);
    merged = mergeLists(merged, server);
    const synced = await pushHistoryToServer(userId, merged);
    await Promise.all([saveLocally(synced, userId), clearLocally(null)]);
    return synced;
  } catch (error) {
    console.error("Failed to merge anonymous history on login", error);
    await Promise.all([saveLocally(merged, userId), clearLocally(null)]);
    return merged;
  }
};
