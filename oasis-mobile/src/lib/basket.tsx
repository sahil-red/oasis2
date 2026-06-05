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

const STORAGE_KEY = "scout_basket_slugs";

type BasketContextValue = {
  slugs: string[];
  add: (slug: string) => void;
  remove: (slug: string) => void;
  clear: () => void;
  has: (slug: string) => boolean;
  count: number;
};

const BasketContext = createContext<BasketContextValue | null>(null);

export function BasketProvider({ children }: { children: ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setSlugs(parsed);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const persist = useCallback((next: string[]) => {
    setSlugs(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const add = useCallback(
    (slug: string) => {
      persist([slug, ...slugs.filter((s) => s !== slug)].slice(0, 40));
    },
    [persist, slugs],
  );

  const remove = useCallback(
    (slug: string) => {
      persist(slugs.filter((s) => s !== slug));
    },
    [persist, slugs],
  );

  const clear = useCallback(() => persist([]), [persist]);

  const value = useMemo(
    () => ({
      slugs,
      add,
      remove,
      clear,
      has: (slug: string) => slugs.includes(slug),
      count: slugs.length,
    }),
    [slugs, add, remove, clear],
  );

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket() {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error("useBasket must be used within BasketProvider");
  return ctx;
}
