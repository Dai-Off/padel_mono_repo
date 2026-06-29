import type { StoreCategory, TiendaProduct } from "../api/store";

export type TiendaCategoryId = "all" | StoreCategory;

export type TiendaSortMode = "featured" | "price_low" | "price_high" | "name";

export type TiendaFilterFlags = {
  featuredOnly: boolean;
  flashOnly: boolean;
  favoritesOnly: boolean;
};

export const DEFAULT_TIENDA_FILTERS: TiendaFilterFlags = {
  featuredOnly: false,
  flashOnly: false,
  favoritesOnly: false,
};

export function countActiveFilters(flags: TiendaFilterFlags): number {
  return (
    Number(flags.featuredOnly) +
    Number(flags.flashOnly) +
    Number(flags.favoritesOnly)
  );
}

export function filterTiendaProducts(
  products: TiendaProduct[],
  options: {
    category: TiendaCategoryId;
    search: string;
    filters: TiendaFilterFlags;
    productIds?: string[] | null;
    favoriteIds?: ReadonlySet<string>;
  },
): TiendaProduct[] {
  let list = products.filter((p) => p.inStock);

  if (options.productIds?.length) {
    const allowed = new Set(options.productIds);
    list = list.filter((p) => allowed.has(p.id));
  }

  if (options.category !== "all") {
    list = list.filter((p) => p.category === options.category);
  }

  const q = options.search.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q),
    );
  }

  if (options.filters.featuredOnly) {
    list = list.filter((p) => p.isFeatured);
  }
  if (options.filters.flashOnly) {
    list = list.filter((p) => p.isFlashDeal);
  }
  if (options.filters.favoritesOnly) {
    const fav = options.favoriteIds;
    if (!fav || fav.size === 0) {
      list = [];
    } else {
      list = list.filter((p) => fav.has(p.id));
    }
  }

  return list;
}

export function sortTiendaProducts(
  products: TiendaProduct[],
  mode: TiendaSortMode,
): TiendaProduct[] {
  const list = [...products];

  if (mode === "price_low") {
    list.sort((a, b) => a.priceCents - b.priceCents);
    return list;
  }
  if (mode === "price_high") {
    list.sort((a, b) => b.priceCents - a.priceCents);
    return list;
  }
  if (mode === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name, "es"));
    return list;
  }

  list.sort((a, b) => {
    const aScore = (a.isFeatured ? 2 : 0) + (a.isFlashDeal ? 1 : 0);
    const bScore = (b.isFeatured ? 2 : 0) + (b.isFlashDeal ? 1 : 0);
    if (bScore !== aScore) return bScore - aScore;
    return a.name.localeCompare(b.name, "es");
  });
  return list;
}
