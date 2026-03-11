import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  RecentlyViewedItem,
  ProductSnapshot,
  addRecentlyViewed,
  handleLogin,
  loadLocally,
  syncWithServer,
  trackOnServer,
} from "@/utils/recentlyViewed";

export const useRecentlyViewed = () => {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const userId = user?._id ?? null;
  const previousUserId = useRef<string | null>(null);

  const activeScope = useMemo(() => userId, [userId]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      setLoading(true);
      const localItems = await loadLocally(activeScope);
      if (!cancelled) {
        setItems(localItems);
        setLoading(false);
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, [activeScope]);

  useEffect(() => {
    let cancelled = false;
    const wasAnonymous = !previousUserId.current && !!userId;
    previousUserId.current = userId;

    if (!userId) {
      return;
    }

    const runSync = async () => {
      const syncedItems = wasAnonymous
        ? await handleLogin(userId)
        : await syncWithServer(userId);

      if (!cancelled) {
        setItems(syncedItems);
      }
    };

    runSync();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const addView = useCallback(
    async (productId: string, snapshot?: Partial<ProductSnapshot>) => {
      const updated = await addRecentlyViewed(productId, snapshot, activeScope);
      setItems(updated);

      if (!userId || !updated.length) {
        return updated;
      }

      try {
        const serverItems = await trackOnServer(userId, updated[0]);
        setItems(serverItems);
        return serverItems;
      } catch (error) {
        console.error("Failed to track recently viewed item", error);
        const syncedItems = await syncWithServer(userId);
        setItems(syncedItems);
        return syncedItems;
      }
    },
    [activeScope, userId]
  );

  const refresh = useCallback(async () => {
    setLoading(true);

    if (!userId) {
      const localItems = await loadLocally(null);
      setItems(localItems);
      setLoading(false);
      return localItems;
    }

    const syncedItems = await syncWithServer(userId);
    setItems(syncedItems);
    setLoading(false);
    return syncedItems;
  }, [userId]);

  return { items, loading, addView, refresh };
};
