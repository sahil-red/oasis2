export type BasketEntry = {
  slug: string;
  name: string;
  qty: number;
  addedAt: number;
};

const KEY = "oasis-basket-v1";

export function readBasket(): BasketEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BasketEntry[];
  } catch {
    return [];
  }
}

export function writeBasket(entries: BasketEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export function addToBasket(slug: string, name: string): BasketEntry[] {
  const list = readBasket();
  const existing = list.find((e) => e.slug === slug);
  if (existing) existing.qty += 1;
  else list.push({ slug, name, qty: 1, addedAt: Date.now() });
  writeBasket(list);
  window.dispatchEvent(new Event("oasis-basket"));
  return list;
}

export function removeFromBasket(slug: string): BasketEntry[] {
  const list = readBasket().filter((e) => e.slug !== slug);
  writeBasket(list);
  window.dispatchEvent(new Event("oasis-basket"));
  return list;
}

/** Replace one cart line with a swap — keeps quantity. */
export function replaceInBasket(fromSlug: string, toSlug: string, toName: string): BasketEntry[] {
  const list = readBasket();
  const entry = list.find((e) => e.slug === fromSlug);
  if (!entry) return list;
  const existingTarget = list.find((e) => e.slug === toSlug);
  if (existingTarget && existingTarget !== entry) {
    existingTarget.qty += entry.qty;
    const next = list.filter((e) => e.slug !== fromSlug);
    writeBasket(next);
    window.dispatchEvent(new Event("oasis-basket"));
    return next;
  }
  entry.slug = toSlug;
  entry.name = toName;
  entry.addedAt = Date.now();
  writeBasket(list);
  window.dispatchEvent(new Event("oasis-basket"));
  return list;
}

export function decrementBasket(slug: string): BasketEntry[] {
  const list = readBasket();
  const entry = list.find((e) => e.slug === slug);
  if (!entry) return list;
  if (entry.qty <= 1) return removeFromBasket(slug);
  entry.qty -= 1;
  writeBasket(list);
  window.dispatchEvent(new Event("oasis-basket"));
  return list;
}

export function clearBasket(): void {
  writeBasket([]);
  window.dispatchEvent(new Event("oasis-basket"));
}

export function basketCount(): number {
  return readBasket().reduce((n, e) => n + e.qty, 0);
}
