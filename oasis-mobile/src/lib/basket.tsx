import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "scout-basket-v1";
const LEGACY_SLUGS_KEY = "scout_basket_slugs";

export type BasketEntry = {
  slug: string;
  name: string;
  qty: number;
  addedAt: number;
};

type BasketContextValue = {
  entries: BasketEntry[];
  slugs: string[];
  hydrated: boolean;
  add: (slug: string, name?: string) => void;
  remove: (slug: string) => void;
  decrement: (slug: string) => void;
  replace: (fromSlug: string, toSlug: string, toName: string) => void;
  clear: () => void;
  has: (slug: string) => boolean;
  count: number;
};

const BasketContext = createContext<BasketContextValue | null>(null);

function normalizeEntries(raw: unknown): BasketEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: BasketEntry[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      out.push({ slug: item.trim(), name: "", qty: 1, addedAt: Date.now() });
      continue;
    }
    if (item && typeof item === "object" && "slug" in item) {
      const e = item as Partial<BasketEntry>;
      if (typeof e.slug !== "string" || !e.slug.trim()) continue;
      out.push({
        slug: e.slug.trim(),
        name: typeof e.name === "string" ? e.name : "",
        qty: typeof e.qty === "number" && e.qty > 0 ? Math.floor(e.qty) : 1,
        addedAt: typeof e.addedAt === "number" ? e.addedAt : Date.now(),
      });
    }
  }
  return out.slice(0, 40);
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<BasketEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const current = await AsyncStorage.getItem(STORAGE_KEY);
        if (current) {
          setEntries(normalizeEntries(JSON.parse(current)));
          return;
        }
        const legacy = await AsyncStorage.getItem(LEGACY_SLUGS_KEY);
        if (legacy) {
          const migrated = normalizeEntries(JSON.parse(legacy));
          setEntries(migrated);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          await AsyncStorage.removeItem(LEGACY_SLUGS_KEY);
        }
      } catch {
        /* ignore corrupt storage */
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries, hydrated]);

  const add = useCallback((slug: string, name = "") => {
    setEntries((prev) => {
      const existing = prev.find((e) => e.slug === slug);
      if (existing) {
        return prev.map((e) =>
          e.slug === slug
            ? { ...e, qty: e.qty + 1, name: name || e.name, addedAt: Date.now() }
            : e,
        );
      }
      return [{ slug, name, qty: 1, addedAt: Date.now() }, ...prev].slice(0, 40);
    });
  }, []);

  const remove = useCallback((slug: string) => {
    setEntries((prev) => prev.filter((e) => e.slug !== slug));
  }, []);

  const decrement = useCallback((slug: string) => {
    setEntries((prev) => {
      const entry = prev.find((e) => e.slug === slug);
      if (!entry) return prev;
      if (entry.qty <= 1) return prev.filter((e) => e.slug !== slug);
      return prev.map((e) => (e.slug === slug ? { ...e, qty: e.qty - 1 } : e));
    });
  }, []);

  const replace = useCallback((fromSlug: string, toSlug: string, toName: string) => {
    setEntries((prev) => {
      const entry = prev.find((e) => e.slug === fromSlug);
      if (!entry) return prev;
      const existingTarget = prev.find((e) => e.slug === toSlug);
      if (existingTarget && existingTarget.slug !== fromSlug) {
        return prev
          .filter((e) => e.slug !== fromSlug)
          .map((e) =>
            e.slug === toSlug ? { ...e, qty: e.qty + entry.qty, name: toName || e.name } : e,
          );
      }
      return prev.map((e) =>
        e.slug === fromSlug
          ? { ...e, slug: toSlug, name: toName, addedAt: Date.now() }
          : e,
      );
    });
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const slugs = useMemo(() => [...new Set(entries.map((e) => e.slug))], [entries]);

  const value = useMemo(
    () => ({
      entries,
      slugs,
      hydrated,
      add,
      remove,
      decrement,
      replace,
      clear,
      has: (slug: string) => entries.some((e) => e.slug === slug),
      count: entries.reduce((n, e) => n + e.qty, 0),
    }),
    [entries, slugs, hydrated, add, remove, decrement, replace, clear],
  );

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket() {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error("useBasket must be used within BasketProvider");
  return ctx;
}
