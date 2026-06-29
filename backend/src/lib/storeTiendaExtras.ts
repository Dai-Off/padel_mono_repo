import { getSupabaseServiceRoleClient } from './supabase';
import { STORE_PRODUCT_FIELDS, isStoreProductInStock } from './storeProducts';

export const FLASH_TITLE_MAX_LEN = 24;

export function normalizeFlashTitle(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return null;
  if (trimmed.length <= FLASH_TITLE_MAX_LEN) return trimmed;
  return `${trimmed.slice(0, FLASH_TITLE_MAX_LEN - 1).trimEnd()}…`;
}

export const STORE_COLLECTION_FIELDS =
  'id, created_at, updated_at, name, title, subtitle, cta_text, image_url, is_active, sort_order';

export const STORE_TIENDA_SETTINGS_FIELDS =
  'id, flash_enabled, flash_ends_at, flash_title, updated_at';

export type StoreTiendaSettings = {
  id: number;
  flash_enabled: boolean;
  flash_ends_at: string | null;
  flash_title: string | null;
  updated_at: string;
};

export type StoreCollection = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  title: string;
  subtitle: string | null;
  cta_text: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
};

export function isFlashCampaignActive(settings: StoreTiendaSettings): boolean {
  if (!settings.flash_enabled) return false;
  if (!settings.flash_ends_at) return false;
  return new Date(settings.flash_ends_at).getTime() > Date.now();
}

export async function getStoreTiendaSettings(): Promise<StoreTiendaSettings> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('store_tienda_settings')
    .select(STORE_TIENDA_SETTINGS_FIELDS)
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as StoreTiendaSettings;
  return {
    id: 1,
    flash_enabled: false,
    flash_ends_at: null,
    flash_title: null,
    updated_at: new Date().toISOString(),
  };
}

export async function listActiveFlashProducts() {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('store_products')
    .select(STORE_PRODUCT_FIELDS)
    .eq('is_active', true)
    .eq('is_flash_deal', true)
    .gt('stock_quantity', 0)
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listCollectionProductIds(collectionId: string): Promise<string[]> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('store_collection_products')
    .select('product_id, sort_order')
    .eq('collection_id', collectionId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.product_id as string);
}

export async function listActiveCollectionsWithProducts() {
  const supabase = getSupabaseServiceRoleClient();
  const { data: collections, error } = await supabase
    .from('store_collections')
    .select(STORE_COLLECTION_FIELDS)
    .eq('is_active', true)
    .not('image_url', 'is', null)
    .neq('image_url', '')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;

  const result = [];
  for (const collection of collections ?? []) {
    const productIds = await listCollectionProductIds(collection.id);
    if (productIds.length === 0) continue;

    const { data: products, error: productsErr } = await supabase
      .from('store_products')
      .select(STORE_PRODUCT_FIELDS)
      .in('id', productIds)
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .not('image_url', 'is', null)
      .neq('image_url', '');
    if (productsErr) throw productsErr;

    const byId = new Map((products ?? []).map((p) => [p.id as string, p]));
    const orderedProducts = productIds
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p && isStoreProductInStock(p.stock_quantity)));

    if (orderedProducts.length === 0) continue;

    result.push({
      ...collection,
      product_ids: orderedProducts.map((p) => p.id),
      products: orderedProducts,
    });
  }

  return result;
}
