import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { requireMobileAdmin } from '../middleware/requireMobileAdmin';
import {
  isStoreCategory,
  isUniqueViolation,
  parseNonNegativeIntWithDefault,
  parseOptionalNonNegativeInt,
  parseRequiredNonNegativeInt,
  STORE_PRODUCT_FIELDS,
} from '../lib/storeProducts';
import { assertReachableImageUrl } from '../lib/validateImageUrl';
import {
  getStoreTiendaSettings,
  listCollectionProductIds,
  normalizeFlashTitle,
  STORE_COLLECTION_FIELDS,
  STORE_TIENDA_SETTINGS_FIELDS,
} from '../lib/storeTiendaExtras';
import { getStoreSalesSummary, parseStoreSalesPeriod } from '../lib/storeSales';
import {
  isPromoDiscountType,
  isValidDiscountValue,
  normalizePromoCode,
  type PromoDiscountType,
} from '../lib/promoCodes';

const router = Router();
router.use(requireMobileAdmin);

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const IMAGE_BUCKET = 'store-products';

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato no permitido. Usa JPEG, PNG o WebP.'));
    }
  },
});

async function getMobileAdminId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization ?? req.headers['Authorization'];
  const raw = typeof authHeader === 'string' ? authHeader : '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim() || null;
  if (!token) return null;
  const supabase = getSupabaseServiceRoleClient();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data: admin } = await supabase
    .from('mobile_admins')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  return admin?.id ?? null;
}

async function validatePublishableImage(
  imageUrl: unknown,
  isActive: boolean
): Promise<string | null> {
  if (!isActive) return null;
  const url = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  const checked = await assertReachableImageUrl(url, 'La imagen del producto');
  return checked.ok ? null : checked.error;
}

function buildProductInsert(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: 'El nombre del producto es obligatorio' };
  if (name.length > 200) return { error: 'El nombre no puede superar 200 caracteres' };

  const category = typeof body.category === 'string' ? body.category.trim() : '';
  if (!isStoreCategory(category)) {
    return { error: 'Elegí una categoría válida: palas, pelotas, calzado, ropa o accesorios' };
  }

  const priceParsed = parseRequiredNonNegativeInt(body.price_cents, 'El precio');
  if (!priceParsed.ok) return { error: priceParsed.error };

  const stockParsed = parseNonNegativeIntWithDefault(body.stock_quantity, 'El stock inicial', 0);
  if (!stockParsed.ok) return { error: stockParsed.error };

  const compareParsed = parseOptionalNonNegativeInt(body.compare_at_price_cents, 'El precio anterior');
  if (!compareParsed.ok) return { error: compareParsed.error };

  const lowStockParsed = parseNonNegativeIntWithDefault(body.low_stock_threshold, 'El umbral de stock bajo', 5);
  if (!lowStockParsed.ok) return { error: lowStockParsed.error };

  const sortParsed = parseNonNegativeIntWithDefault(body.sort_order, 'El orden', 0);
  if (!sortParsed.ok) return { error: sortParsed.error };

  if (
    compareParsed.value !== null &&
    compareParsed.value <= priceParsed.value
  ) {
    return { error: 'El precio anterior debe ser mayor que el precio de venta' };
  }

  const skuRaw = typeof body.sku === 'string' ? body.sku.trim() : '';
  if (skuRaw.length > 64) return { error: 'El SKU no puede superar 64 caracteres' };

  const brandRaw = typeof body.brand === 'string' ? body.brand.trim() : '';
  const descriptionRaw = typeof body.description === 'string' ? body.description.trim() : '';
  const imageUrlRaw = typeof body.image_url === 'string' ? body.image_url.trim() : '';

  return {
    data: {
      name,
      brand: brandRaw || null,
      description: descriptionRaw || null,
      category,
      sku: skuRaw || null,
      price_cents: priceParsed.value,
      compare_at_price_cents: compareParsed.value,
      stock_quantity: stockParsed.value,
      low_stock_threshold: lowStockParsed.value,
      image_url: imageUrlRaw || null,
      is_active: body.is_active !== false,
      is_featured: body.is_featured === true,
      is_flash_deal: body.is_flash_deal === true,
      sort_order: sortParsed.value,
      updated_at: new Date().toISOString(),
    },
  };
}

function buildProductUpdate(body: Record<string, unknown>) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return { error: 'El nombre no puede estar vacío' };
    if (name.length > 200) return { error: 'El nombre no puede superar 200 caracteres' };
    update.name = name;
  }
  if (body.brand !== undefined) {
    update.brand = typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null;
  }
  if (body.description !== undefined) {
    update.description =
      typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
  }
  if (body.category !== undefined) {
    if (!isStoreCategory(body.category)) {
      return { error: 'Elegí una categoría válida' };
    }
    update.category = body.category;
  }
  if (body.sku !== undefined) {
    const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
    if (sku.length > 64) return { error: 'El SKU no puede superar 64 caracteres' };
    update.sku = sku || null;
  }
  if (body.price_cents !== undefined) {
    const priceParsed = parseRequiredNonNegativeInt(body.price_cents, 'El precio');
    if (!priceParsed.ok) return { error: priceParsed.error };
    update.price_cents = priceParsed.value;
  }
  if (body.compare_at_price_cents !== undefined) {
    const compareParsed = parseOptionalNonNegativeInt(body.compare_at_price_cents, 'El precio anterior');
    if (!compareParsed.ok) return { error: compareParsed.error };
    update.compare_at_price_cents = compareParsed.value;
  }
  if (body.low_stock_threshold !== undefined) {
    const lowStockParsed = parseRequiredNonNegativeInt(body.low_stock_threshold, 'El umbral de stock bajo');
    if (!lowStockParsed.ok) return { error: lowStockParsed.error };
    update.low_stock_threshold = lowStockParsed.value;
  }
  if (body.image_url !== undefined) {
    update.image_url =
      typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null;
  }
  if (body.is_active !== undefined) update.is_active = Boolean(body.is_active);
  if (body.is_featured !== undefined) update.is_featured = Boolean(body.is_featured);
  if (body.is_flash_deal !== undefined) update.is_flash_deal = Boolean(body.is_flash_deal);
  if (body.sort_order !== undefined) {
    const sortParsed = parseRequiredNonNegativeInt(body.sort_order, 'El orden');
    if (!sortParsed.ok) return { error: sortParsed.error };
    update.sort_order = sortParsed.value;
  }

  if (Object.keys(update).length <= 1) {
    return { error: 'No hay cambios para guardar' };
  }
  return { data: update };
}

function mapStoreDbError(error: { code?: string; message?: string }): { status: number; message: string } | null {
  if (isUniqueViolation(error)) {
    return { status: 409, message: 'Ya existe un producto con ese SKU' };
  }
  return null;
}

async function recordStockMovement(
  productId: string,
  quantityDelta: number,
  quantityAfter: number,
  reason: string,
  note: string | null,
  mobileAdminId: string | null
) {
  const supabase = getSupabaseServiceRoleClient();
  await supabase.from('store_stock_movements').insert({
    product_id: productId,
    quantity_delta: quantityDelta,
    quantity_after: quantityAfter,
    reason,
    note,
    mobile_admin_id: mobileAdminId,
  });
}

/**
 * GET /mobile-admin/store/sales?period=7d|30d|month
 * Resumen de ventas reales de la tienda (pedidos pagados): KPIs, gráfico,
 * top productos y pedidos recientes.
 */
router.get('/sales', async (req: Request, res: Response) => {
  try {
    const period = parseStoreSalesPeriod(req.query.period);
    const summary = await getStoreSalesSummary(period);
    return res.json({ ok: true, ...summary });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /mobile-admin/store/products
 */
router.get('/products', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const includeInactive = req.query.include_inactive === 'true';

  try {
    const supabase = getSupabaseServiceRoleClient();
    let query = supabase
      .from('store_products')
      .select(STORE_PRODUCT_FIELDS)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    if (category && isStoreCategory(category)) {
      query = query.eq('category', category);
    }
    if (q) {
      const pattern = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      query = query.or(`name.ilike.${pattern},brand.ilike.${pattern},sku.ilike.${pattern}`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, products: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /mobile-admin/store/products/:id
 */
router.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('store_products')
      .select(STORE_PRODUCT_FIELDS)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    return res.json({ ok: true, product: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /mobile-admin/store/products
 */
router.post('/products', async (req: Request, res: Response) => {
  const built = buildProductInsert(req.body ?? {});
  if ('error' in built) return res.status(400).json({ ok: false, error: built.error });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const imageError = await validatePublishableImage(built.data.image_url, built.data.is_active);
    if (imageError) return res.status(400).json({ ok: false, error: imageError });

    const mobileAdminId = await getMobileAdminId(req);
    const { data, error } = await supabase
      .from('store_products')
      .insert(built.data)
      .select(STORE_PRODUCT_FIELDS)
      .single();
    if (error) {
      const mapped = mapStoreDbError(error);
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.message });
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (data.stock_quantity > 0) {
      await recordStockMovement(
        data.id,
        data.stock_quantity,
        data.stock_quantity,
        'initial',
        'Stock inicial al crear producto',
        mobileAdminId
      );
    }

    return res.status(201).json({ ok: true, product: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * PUT /mobile-admin/store/products/:id
 */
router.put('/products/:id', async (req: Request, res: Response) => {
  const built = buildProductUpdate(req.body ?? {});
  if ('error' in built) return res.status(400).json({ ok: false, error: built.error });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: fetchErr } = await supabase
      .from('store_products')
      .select('id, price_cents, compare_at_price_cents, image_url, is_active')
      .eq('id', req.params.id)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

    const nextImage =
      'image_url' in built.data ? (built.data.image_url as string | null) : existing.image_url;
    const nextActive =
      'is_active' in built.data ? Boolean(built.data.is_active) : existing.is_active;
    const imageError = await validatePublishableImage(nextImage, nextActive);
    if (imageError) return res.status(400).json({ ok: false, error: imageError });

    const nextPrice =
      typeof built.data.price_cents === 'number' ? built.data.price_cents : existing.price_cents;
    const nextCompare =
      'compare_at_price_cents' in built.data
        ? (built.data.compare_at_price_cents as number | null)
        : existing.compare_at_price_cents;
    if (nextCompare !== null && nextCompare <= nextPrice) {
      return res.status(400).json({
        ok: false,
        error: 'El precio anterior debe ser mayor que el precio de venta',
      });
    }

    const { data, error } = await supabase
      .from('store_products')
      .update(built.data)
      .eq('id', req.params.id)
      .select(STORE_PRODUCT_FIELDS)
      .single();
    if (error) {
      const mapped = mapStoreDbError(error);
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.message });
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.json({ ok: true, product: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /mobile-admin/store/products/:id/stock
 * Ajusta stock: body { quantity_delta, reason?, note? }
 */
router.post('/products/:id/stock', async (req: Request, res: Response) => {
  const quantityDelta = Number(req.body?.quantity_delta);
  if (!Number.isFinite(quantityDelta) || !Number.isInteger(quantityDelta) || quantityDelta === 0) {
    return res.status(400).json({ ok: false, error: 'quantity_delta debe ser un entero distinto de 0' });
  }

  const reasonRaw = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const allowedReasons = ['restock', 'sale', 'adjustment', 'return'] as const;
  const reason = allowedReasons.includes(reasonRaw as (typeof allowedReasons)[number])
    ? (reasonRaw as (typeof allowedReasons)[number])
    : quantityDelta > 0
      ? 'restock'
      : 'adjustment';

  const note = typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim() : null;

  try {
    const supabase = getSupabaseServiceRoleClient();
    const mobileAdminId = await getMobileAdminId(req);

    const { data: existing, error: fetchErr } = await supabase
      .from('store_products')
      .select('id, stock_quantity')
      .eq('id', req.params.id)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

    const quantityAfter = existing.stock_quantity + quantityDelta;
    if (quantityAfter < 0) {
      return res.status(400).json({ ok: false, error: 'Stock insuficiente para este ajuste' });
    }

    const { data, error } = await supabase
      .from('store_products')
      .update({ stock_quantity: quantityAfter, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(STORE_PRODUCT_FIELDS)
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });

    await recordStockMovement(
      existing.id,
      quantityDelta,
      quantityAfter,
      reason,
      note,
      mobileAdminId
    );

    return res.json({ ok: true, product: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * DELETE /mobile-admin/store/products/:id
 * Elimina el producto del catálogo (y su historial de stock por cascade).
 */
router.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: fetchErr } = await supabase
      .from('store_products')
      .select('id, name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

    const { error } = await supabase.from('store_products').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted_id: existing.id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /mobile-admin/store/upload-image
 * Sube al bucket `store-products` y devuelve URL pública.
 */
router.post('/upload-image', (req: Request, res: Response, next: NextFunction) => {
  upload.single('image')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir';
      const isLimit = err && typeof err === 'object' && 'code' in err && err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ ok: false, error: isLimit ? 'La imagen supera el límite de 5 MB' : msg });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ ok: false, error: 'Envía la imagen en el campo "image"' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const ext = extFromMime(file.mimetype);
    const path = `${req.query.folder === 'collections' ? 'collections' : 'products'}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { error: upErr } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message });

    const { data: pub } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;
    return res.json({ ok: true, url: publicUrl });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /mobile-admin/store/flash-settings
 */
router.get('/flash-settings', async (_req: Request, res: Response) => {
  try {
    const settings = await getStoreTiendaSettings();
    return res.json({ ok: true, settings });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * PUT /mobile-admin/store/flash-settings
 * body: { flash_enabled, flash_ends_at?, flash_title? }
 */
router.put('/flash-settings', async (req: Request, res: Response) => {
  const flashEnabled = Boolean(req.body?.flash_enabled);
  const flashTitle =
    typeof req.body?.flash_title === 'string' ? req.body.flash_title.trim() : '';
  const flashEndsRaw = req.body?.flash_ends_at;

  let flashEndsAt: string | null = null;
  if (flashEndsRaw != null && flashEndsRaw !== '') {
    const parsed = new Date(flashEndsRaw);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ ok: false, error: 'La fecha de fin de la oferta flash no es válida' });
    }
    flashEndsAt = parsed.toISOString();
  }

  if (flashEnabled && !flashEndsAt) {
    return res.status(400).json({
      ok: false,
      error: 'Indicá cuándo termina la oferta flash para activarla',
    });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('store_tienda_settings')
      .upsert({
        id: 1,
        flash_enabled: flashEnabled,
        flash_ends_at: flashEndsAt,
        flash_title: normalizeFlashTitle(flashTitle),
        updated_at: new Date().toISOString(),
      })
      .select(STORE_TIENDA_SETTINGS_FIELDS)
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, settings: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

function buildCollectionBody(body: Record<string, unknown>, partial = false) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return { error: 'El nombre interno de la colección es obligatorio' };
    update.name = name;
  }
  if (!partial || body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return { error: 'El título del banner es obligatorio' };
    update.title = title;
  }
  if (body.subtitle !== undefined) {
    update.subtitle =
      typeof body.subtitle === 'string' && body.subtitle.trim() ? body.subtitle.trim() : null;
  }
  if (body.cta_text !== undefined) {
    update.cta_text =
      typeof body.cta_text === 'string' && body.cta_text.trim() ? body.cta_text.trim() : null;
  }
  if (body.image_url !== undefined) {
    update.image_url =
      typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url.trim() : null;
  }
  if (body.is_active !== undefined) update.is_active = Boolean(body.is_active);
  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order);
    if (!Number.isInteger(n) || n < 0) return { error: 'El orden debe ser un entero ≥ 0' };
    update.sort_order = n;
  }

  return { data: update };
}

/**
 * GET /mobile-admin/store/collections
 */
router.get('/collections', async (req: Request, res: Response) => {
  const includeInactive = req.query.include_inactive === 'true';
  try {
    const supabase = getSupabaseServiceRoleClient();
    let query = supabase
      .from('store_collections')
      .select(STORE_COLLECTION_FIELDS)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const collections = [];
    for (const row of data ?? []) {
      const productIds = await listCollectionProductIds(row.id);
      collections.push({ ...row, product_ids: productIds, product_count: productIds.length });
    }
    return res.json({ ok: true, collections });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /mobile-admin/store/collections
 */
router.post('/collections', async (req: Request, res: Response) => {
  const built = buildCollectionBody(req.body ?? {});
  if ('error' in built) return res.status(400).json({ ok: false, error: built.error });

  if (built.data.is_active !== false) {
    const imageUrl = built.data.image_url as string | null | undefined;
    if (!imageUrl) {
      return res.status(400).json({ ok: false, error: 'Subí una imagen para publicar la colección' });
    }
    const imageError = await assertReachableImageUrl(imageUrl, 'La imagen de la colección');
    if (!imageError.ok) return res.status(400).json({ ok: false, error: imageError.error });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('store_collections')
      .insert({
        sort_order: 0,
        is_active: true,
        ...built.data,
      })
      .select(STORE_COLLECTION_FIELDS)
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, collection: { ...data, product_ids: [], product_count: 0 } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * PUT /mobile-admin/store/collections/:id
 */
router.put('/collections/:id', async (req: Request, res: Response) => {
  const built = buildCollectionBody(req.body ?? {}, true);
  if ('error' in built) return res.status(400).json({ ok: false, error: built.error });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: fetchErr } = await supabase
      .from('store_collections')
      .select('id, is_active, image_url')
      .eq('id', req.params.id)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Colección no encontrada' });

    const nextActive =
      'is_active' in built.data ? Boolean(built.data.is_active) : existing.is_active;
    const nextImage =
      'image_url' in built.data ? (built.data.image_url as string | null) : existing.image_url;

    if (nextActive) {
      if (!nextImage?.trim()) {
        return res.status(400).json({ ok: false, error: 'Subí una imagen para publicar la colección' });
      }
      const imageError = await assertReachableImageUrl(nextImage, 'La imagen de la colección');
      if (!imageError.ok) return res.status(400).json({ ok: false, error: imageError.error });
    }

    const { data, error } = await supabase
      .from('store_collections')
      .update(built.data)
      .eq('id', req.params.id)
      .select(STORE_COLLECTION_FIELDS)
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const productIds = await listCollectionProductIds(data.id);
    return res.json({
      ok: true,
      collection: { ...data, product_ids: productIds, product_count: productIds.length },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * DELETE /mobile-admin/store/collections/:id
 */
router.delete('/collections/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase.from('store_collections').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted_id: req.params.id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * PUT /mobile-admin/store/collections/:id/products
 * body: { product_ids: string[] }
 */
router.put('/collections/:id/products', async (req: Request, res: Response) => {
  const raw = req.body?.product_ids;
  if (!Array.isArray(raw)) {
    return res.status(400).json({ ok: false, error: 'product_ids debe ser un array' });
  }
  const productIds = raw
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim());

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: collection, error: colErr } = await supabase
      .from('store_collections')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (colErr) return res.status(500).json({ ok: false, error: colErr.message });
    if (!collection) return res.status(404).json({ ok: false, error: 'Colección no encontrada' });

    if (productIds.length > 0) {
      const { data: products, error: prodErr } = await supabase
        .from('store_products')
        .select('id')
        .in('id', productIds);
      if (prodErr) return res.status(500).json({ ok: false, error: prodErr.message });
      if ((products ?? []).length !== productIds.length) {
        return res.status(400).json({ ok: false, error: 'Uno o más productos no existen' });
      }
    }

    const { error: delErr } = await supabase
      .from('store_collection_products')
      .delete()
      .eq('collection_id', req.params.id);
    if (delErr) return res.status(500).json({ ok: false, error: delErr.message });

    if (productIds.length > 0) {
      const rows = productIds.map((product_id, index) => ({
        collection_id: req.params.id,
        product_id,
        sort_order: index,
      }));
      const { error: insErr } = await supabase.from('store_collection_products').insert(rows);
      if (insErr) return res.status(500).json({ ok: false, error: insErr.message });
    }

    return res.json({ ok: true, product_ids: productIds });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

const PROMO_CODE_FIELDS = 'id, created_at, code, discount_type, discount_value, is_active';

function buildPromoCodeInsert(
  body: Record<string, unknown>,
): { data: { code: string; discount_type: PromoDiscountType; discount_value: number; is_active: boolean } } | { error: string } {
  const code = normalizePromoCode(body.code);
  if (!code) return { error: 'El código es obligatorio' };
  if (code.length > 40) return { error: 'El código es demasiado largo' };
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    return { error: 'El código solo puede tener letras, números, guion y guion bajo' };
  }

  const discountType = body.discount_type;
  if (!isPromoDiscountType(discountType)) {
    return { error: 'Tipo de descuento inválido' };
  }

  const discountValue = Number(body.discount_value);
  if (!isValidDiscountValue(discountType, discountValue)) {
    return {
      error:
        discountType === 'percent'
          ? 'El porcentaje debe ser un entero entre 1 y 100'
          : 'El importe debe ser un entero de céntimos mayor a 0',
    };
  }

  const isActive = body.is_active === undefined ? true : Boolean(body.is_active);
  return { data: { code, discount_type: discountType, discount_value: discountValue, is_active: isActive } };
}

/**
 * GET /mobile-admin/store/promo-codes
 */
router.get('/promo-codes', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('promo_codes')
      .select(PROMO_CODE_FIELDS)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, promo_codes: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /mobile-admin/store/promo-codes
 * body: { code, discount_type: 'percent'|'fixed', discount_value, is_active? }
 */
router.post('/promo-codes', async (req: Request, res: Response) => {
  const built = buildPromoCodeInsert(req.body ?? {});
  if ('error' in built) return res.status(400).json({ ok: false, error: built.error });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('promo_codes')
      .insert(built.data)
      .select(PROMO_CODE_FIELDS)
      .single();
    if (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ ok: false, error: 'Ya existe un código con ese nombre' });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.status(201).json({ ok: true, promo_code: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * PUT /mobile-admin/store/promo-codes/:id
 * body: { is_active?, discount_value? } — edición parcial (básica).
 */
router.put('/promo-codes/:id', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if ('is_active' in body) update.is_active = Boolean(body.is_active);

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: fetchErr } = await supabase
      .from('promo_codes')
      .select('id, discount_type')
      .eq('id', req.params.id)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Código no encontrado' });

    if ('discount_value' in body) {
      const value = Number(body.discount_value);
      if (!isValidDiscountValue(existing.discount_type as PromoDiscountType, value)) {
        return res.status(400).json({ ok: false, error: 'Valor de descuento inválido' });
      }
      update.discount_value = value;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ ok: false, error: 'Nada para actualizar' });
    }

    const { data, error } = await supabase
      .from('promo_codes')
      .update(update)
      .eq('id', req.params.id)
      .select(PROMO_CODE_FIELDS)
      .single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, promo_code: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * DELETE /mobile-admin/store/promo-codes/:id
 */
router.delete('/promo-codes/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase.from('promo_codes').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted_id: req.params.id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
