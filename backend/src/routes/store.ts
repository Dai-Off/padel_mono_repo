import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { isStoreCategory, isStoreProductInStock, STORE_PRODUCT_FIELDS } from '../lib/storeProducts';
import {
  getStoreTiendaSettings,
  isFlashCampaignActive,
  listActiveCollectionsWithProducts,
  listActiveFlashProducts,
  normalizeFlashTitle,
  STORE_COLLECTION_FIELDS,
} from '../lib/storeTiendaExtras';

const router = Router();

/**
 * GET /store/flash
 * Campaña de ofertas flash activa + productos.
 */
router.get('/flash', async (_req: Request, res: Response) => {
  try {
    const settings = await getStoreTiendaSettings();
    const active = isFlashCampaignActive(settings);
    const products = active ? await listActiveFlashProducts() : [];
    return res.json({
      ok: true,
      campaign: {
        enabled: active,
        ends_at: settings.flash_enabled ? settings.flash_ends_at : null,
        title: normalizeFlashTitle(settings.flash_title),
      },
      products,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /store/collections
 */
router.get('/collections', async (_req: Request, res: Response) => {
  try {
    const collections = await listActiveCollectionsWithProducts();
    return res.json({ ok: true, collections });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /store/collections/:id
 */
router.get('/collections/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: collection, error } = await supabase
      .from('store_collections')
      .select(STORE_COLLECTION_FIELDS)
      .eq('id', req.params.id)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!collection) return res.status(404).json({ ok: false, error: 'Colección no encontrada' });

    const collections = await listActiveCollectionsWithProducts();
    const match = collections.find((c) => c.id === collection.id);
    if (!match) {
      return res.status(404).json({ ok: false, error: 'Colección no disponible' });
    }
    return res.json({ ok: true, collection: match });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /store/products
 * Catálogo público para mobile-app (solo productos activos).
 */
router.get('/products', async (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const featured = req.query.featured === 'true';
  const flash = req.query.flash === 'true';

  try {
    const supabase = getSupabaseServiceRoleClient();
    let query = supabase
      .from('store_products')
      .select(STORE_PRODUCT_FIELDS)
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .not('image_url', 'is', null)
      .neq('image_url', '')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (category && isStoreCategory(category)) {
      query = query.eq('category', category);
    }
    if (featured) {
      query = query.eq('is_featured', true);
    }
    if (flash) {
      query = query.eq('is_flash_deal', true);
    }
    if (q) {
      const pattern = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      query = query.or(`name.ilike.${pattern},brand.ilike.${pattern},sku.ilike.${pattern}`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const settings = await getStoreTiendaSettings();
    const flashActive = isFlashCampaignActive(settings);

    return res.json({
      ok: true,
      products: data ?? [],
      flash: {
        enabled: flashActive,
        ends_at: settings.flash_enabled ? settings.flash_ends_at : null,
        title: normalizeFlashTitle(settings.flash_title),
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /store/products/:id
 */
router.get('/products/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('store_products')
      .select(STORE_PRODUCT_FIELDS)
      .eq('id', id)
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .not('image_url', 'is', null)
      .neq('image_url', '')
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    if (!isStoreProductInStock(data.stock_quantity)) {
      return res.status(404).json({ ok: false, error: 'Producto no disponible' });
    }
    return res.json({ ok: true, product: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
