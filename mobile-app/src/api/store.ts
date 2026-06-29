import { API_URL } from "../config";

export type StoreCategory =
  | "palas"
  | "pelotas"
  | "calzado"
  | "ropa"
  | "accesorios";

export interface StoreProduct {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  brand: string | null;
  description: string | null;
  category: StoreCategory;
  sku: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_flash_deal: boolean;
  sort_order: number;
}

export interface StoreProductsResponse {
  ok: boolean;
  products?: StoreProduct[];
  flash?: StoreFlashCampaign;
  error?: string;
}

export interface StoreProductResponse {
  ok: boolean;
  product?: StoreProduct;
  error?: string;
}

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&fit=crop";

export function formatStorePriceEuros(cents: number): string {
  const euros = cents / 100;
  if (Number.isInteger(euros)) {
    return `${euros}€`;
  }
  return `${euros.toFixed(2).replace(".", ",")}€`;
}

function discountBadge(
  priceCents: number,
  compareCents: number | null,
): string | undefined {
  if (compareCents == null || compareCents <= priceCents) return undefined;
  const pct = Math.round((1 - priceCents / compareCents) * 100);
  if (pct <= 0) return undefined;
  return `-${pct}%`;
}

export type TiendaStockDisplay =
  | { kind: "last_units"; count: number }
  | { kind: "remaining"; count: number };

export type TiendaProduct = {
  id: string;
  brand: string;
  name: string;
  sku: string;
  price: string;
  priceCents: number;
  oldPrice?: string;
  image: string;
  badgePct?: string;
  stockDisplay?: TiendaStockDisplay;
  inStock: boolean;
  category: StoreCategory;
  isFeatured: boolean;
  isFlashDeal: boolean;
};

export function resolveTiendaStockDisplay(
  stockQuantity: number,
  lowStockThreshold: number,
): TiendaStockDisplay | undefined {
  if (stockQuantity <= 0) return undefined;
  if (lowStockThreshold > 0 && stockQuantity <= lowStockThreshold) {
    if (stockQuantity <= 3) {
      return { kind: "last_units", count: stockQuantity };
    }
    return { kind: "remaining", count: stockQuantity };
  }
  return undefined;
}

export function mapStoreProductToTienda(product: StoreProduct): TiendaProduct | null {
  if (product.stock_quantity <= 0) return null;

  const badgePct = discountBadge(
    product.price_cents,
    product.compare_at_price_cents,
  );

  return {
    id: product.id,
    brand: product.brand?.trim() || "",
    name: product.name,
    sku: product.sku?.trim() || "",
    price: formatStorePriceEuros(product.price_cents),
    priceCents: product.price_cents,
    oldPrice:
      product.compare_at_price_cents != null &&
      product.compare_at_price_cents > product.price_cents
        ? formatStorePriceEuros(product.compare_at_price_cents)
        : undefined,
    image: product.image_url?.trim() || PLACEHOLDER_IMAGE,
    badgePct,
    stockDisplay: resolveTiendaStockDisplay(
      product.stock_quantity,
      product.low_stock_threshold,
    ),
    inStock: true,
    category: product.category,
    isFeatured: product.is_featured,
    isFlashDeal: product.is_flash_deal,
  };
}

export function mapStoreProductsToTienda(products: StoreProduct[]): TiendaProduct[] {
  const mapped: TiendaProduct[] = [];
  for (const product of products) {
    const item = mapStoreProductToTienda(product);
    if (item) mapped.push(item);
  }
  return mapped;
}

export async function fetchStoreProducts(params?: {
  category?: StoreCategory;
  q?: string;
  featured?: boolean;
  flash?: boolean;
}): Promise<StoreProductsResponse> {
  const query = new URLSearchParams();
  if (params?.category) query.append("category", params.category);
  if (params?.q?.trim()) query.append("q", params.q.trim());
  if (params?.featured) query.append("featured", "true");
  if (params?.flash) query.append("flash", "true");

  const qs = query.toString();
  const url = `${API_URL}/store/products${qs ? `?${qs}` : ""}`;

  const res = await fetch(url);
  const data = (await res.json()) as StoreProductsResponse;
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data.error || `Error ${res.status}`,
    };
  }
  return data;
}

export async function fetchStoreProduct(
  id: string,
): Promise<StoreProductResponse> {
  const res = await fetch(`${API_URL}/store/products/${id}`);
  const data = (await res.json()) as StoreProductResponse;
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data.error || `Error ${res.status}`,
    };
  }
  return data;
}

export interface StoreFlashCampaign {
  enabled: boolean;
  ends_at: string | null;
  title: string | null;
}

export interface StoreFlashResponse {
  ok: boolean;
  campaign?: StoreFlashCampaign;
  products?: StoreProduct[];
  error?: string;
}

export interface StoreCollectionPublic {
  id: string;
  title: string;
  subtitle: string | null;
  cta_text: string | null;
  image_url: string | null;
  sort_order: number;
  product_ids: string[];
  products: StoreProduct[];
}

export interface StoreCollectionsResponse {
  ok: boolean;
  collections?: StoreCollectionPublic[];
  error?: string;
}

export async function fetchStoreFlash(): Promise<StoreFlashResponse> {
  const res = await fetch(`${API_URL}/store/flash`);
  const data = (await res.json()) as StoreFlashResponse;
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data.error || `Error ${res.status}`,
    };
  }
  return data;
}

export async function fetchStoreCollections(): Promise<StoreCollectionsResponse> {
  const res = await fetch(`${API_URL}/store/collections`);
  const data = (await res.json()) as StoreCollectionsResponse;
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data.error || `Error ${res.status}`,
    };
  }
  return data;
}
