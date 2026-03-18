import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { attachAuthContext } from '../middleware/attachAuthContext';
import { requireClubOwnerOrAdmin } from '../middleware/requireClubOwnerOrAdmin';

const router = Router();
router.use(attachAuthContext);

const ITEM_FIELDS =
  'id, club_id, name, sku, unit, status, unit_price_cents, currency, low_stock_threshold, image_url, created_at, updated_at';
const MOVEMENT_FIELDS = 'id, club_id, item_id, movement_type, quantity, reason, created_at';

function canAccessClub(req: Request, clubId: string): boolean {
  if (req.authContext?.adminId) return true;
  return req.authContext?.allowedClubIds?.includes(clubId) ?? false;
}

function isMissingRelationError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (m.includes('relation') && m.includes('does not exist')) ||
    m.includes('does not exist') ||
    m.includes('no such table')
  );
}

type InventoryMovementType = 'in' | 'out';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (JPEG, PNG, WebP, GIF)'));
  },
});

const BUCKET = 'inventory-images';

/**
 * GET /inventario/items
 * Lista productos y calcula stock actual a partir de inventory_movements.
 */
router.get('/items', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  if (!club_id?.trim()) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: items, error: itemsErr } = await supabase
      .from('inventory_items')
      .select(ITEM_FIELDS)
      .eq('club_id', club_id)
      .order('created_at', { ascending: false });

    if (itemsErr) {
      if (isMissingRelationError(itemsErr.message)) {
        return res.status(503).json({
          ok: false,
          error: 'Tablas inventory_items/inventory_movements no existen. Aplica las migraciones en Supabase.',
        });
      }
      return res.status(500).json({ ok: false, error: itemsErr.message });
    }

    const { data: movements, error: movementsErr } = await supabase
      .from('inventory_movements')
      .select('item_id, movement_type, quantity')
      .eq('club_id', club_id);

    if (movementsErr) {
      if (isMissingRelationError(movementsErr.message)) {
        return res.status(503).json({
          ok: false,
          error: 'Tabla inventory_movements no existe. Aplica la migración en Supabase.',
        });
      }
      return res.status(500).json({ ok: false, error: movementsErr.message });
    }

    const stockByItem = new Map<string, number>();
    for (const m of movements ?? []) {
      const itemId = String((m as any).item_id ?? '');
      const movementType = (String((m as any).movement_type ?? '') as InventoryMovementType) || 'in';
      const qty = Number((m as any).quantity ?? 0);
      if (!itemId || !Number.isFinite(qty)) continue;
      const sign = movementType === 'out' ? -1 : 1;
      stockByItem.set(itemId, (stockByItem.get(itemId) ?? 0) + sign * Math.trunc(qty));
    }

    const enriched = (items ?? []).map((it: any) => ({
      ...it,
      current_quantity: stockByItem.get(String(it.id)) ?? 0,
    }));

    return res.json({ ok: true, items: enriched });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /inventario/items
 * Crea un producto (inventario_item).
 */
router.post('/items', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { club_id, name, sku, unit, status, unit_price_cents, currency, low_stock_threshold, image_url } = req.body ?? {};
  const clubIdStr = String(club_id ?? '').trim();
  const nameStr = String(name ?? '').trim();

  const priceCents = Number(unit_price_cents ?? 0);
  const lowThreshold = Number(low_stock_threshold ?? 0);
  const currencyStr = String(currency ?? 'EUR').trim() || 'EUR';

  if (!clubIdStr || !nameStr) return res.status(400).json({ ok: false, error: 'club_id y name son obligatorios' });
  if (!canAccessClub(req, clubIdStr)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  if (!Number.isFinite(priceCents) || priceCents < 0) return res.status(400).json({ ok: false, error: 'unit_price_cents inválido' });
  if (!Number.isFinite(lowThreshold) || lowThreshold < 0) return res.status(400).json({ ok: false, error: 'low_stock_threshold inválido' });

  const row: Record<string, unknown> = {
    club_id: clubIdStr,
    name: nameStr,
    sku: sku != null && String(sku).trim() ? String(sku).trim() : null,
    unit: unit != null && String(unit).trim() ? String(unit).trim() : null,
    status: status === 'inactive' ? 'inactive' : 'active',
    unit_price_cents: Math.trunc(priceCents),
    currency: currencyStr,
    low_stock_threshold: Math.trunc(lowThreshold),
    image_url: image_url == null || !String(image_url).trim() ? null : String(image_url).trim(),
  };

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase.from('inventory_items').insert(row).select(ITEM_FIELDS).single();
    if (error) {
      if (isMissingRelationError(error.message)) {
        return res.status(503).json({ ok: false, error: 'Tabla inventory_items no existe. Aplica la migración en Supabase.' });
      }
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.status(201).json({ ok: true, item: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * PUT /inventario/items/{id}
 * Actualiza un producto.
 */
router.put('/items/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing } = await supabase.from('inventory_items').select('club_id').eq('id', id).maybeSingle();
    if (!existing) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    if (!canAccessClub(req, String((existing as any).club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });
  } catch {
    return res.status(500).json({ ok: false, error: 'Error al verificar producto' });
  }

  const { name, sku, unit, status, unit_price_cents, currency, low_stock_threshold, image_url } = req.body ?? {};
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) update.name = String(name).trim();
  if (sku !== undefined) update.sku = sku == null || !String(sku).trim() ? null : String(sku).trim();
  if (unit !== undefined) update.unit = unit == null || !String(unit).trim() ? null : String(unit).trim();
  if (status !== undefined) update.status = status === 'inactive' ? 'inactive' : 'active';
  if (unit_price_cents !== undefined) {
    const n = Number(unit_price_cents);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ ok: false, error: 'unit_price_cents inválido' });
    update.unit_price_cents = Math.trunc(n);
  }
  if (currency !== undefined) {
    const c = String(currency ?? '').trim();
    update.currency = c || 'EUR';
  }
  if (low_stock_threshold !== undefined) {
    const n = Number(low_stock_threshold);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ ok: false, error: 'low_stock_threshold inválido' });
    update.low_stock_threshold = Math.trunc(n);
  }
  if (image_url !== undefined) {
    update.image_url = image_url == null || !String(image_url).trim() ? null : String(image_url).trim();
  }

  if (Object.keys(update).length === 1) return res.status(400).json({ ok: false, error: 'No hay campos para actualizar' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase.from('inventory_items').update(update).eq('id', id).select(ITEM_FIELDS).maybeSingle();
    if (error) {
      if (isMissingRelationError(error.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_items no existe.' });
      return res.status(500).json({ ok: false, error: error.message });
    }
    if (!data) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    return res.json({ ok: true, item: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * DELETE /inventario/items/{id}
 * Elimina un producto.
 */
router.delete('/items/:id', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: existing } = await supabase.from('inventory_items').select('club_id').eq('id', id).maybeSingle();
    if (!existing) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    if (!canAccessClub(req, String((existing as any).club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

    const { error } = await supabase.from('inventory_items').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, deleted: id });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /inventario/movements
 * Lista movimientos del inventario (para auditoría).
 */
router.get('/movements', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const club_id = req.query.club_id as string | undefined;
  const item_id = req.query.item_id as string | undefined;
  if (!club_id?.trim()) return res.status(400).json({ ok: false, error: 'club_id es obligatorio' });
  if (!canAccessClub(req, club_id)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    let q = supabase.from('inventory_movements').select(MOVEMENT_FIELDS).eq('club_id', club_id);
    if (item_id?.trim()) q = q.eq('item_id', item_id.trim());
    q = q.order('created_at', { ascending: false }).limit(100);

    const { data, error } = await q;
    if (error) {
      if (isMissingRelationError(error.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_movements no existe.' });
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, movements: data ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /inventario/movements
 * Crea un movimiento de stock (entrada/salida).
 */
router.post('/movements', requireClubOwnerOrAdmin, async (req: Request, res: Response) => {
  const { club_id, item_id, movement_type, quantity, reason } = req.body ?? {};

  const clubIdStr = String(club_id ?? '').trim();
  const itemIdStr = String(item_id ?? '').trim();
  const typeStr = String(movement_type ?? '').trim();
  const qty = Number(quantity ?? 0);

  if (!clubIdStr || !itemIdStr) return res.status(400).json({ ok: false, error: 'club_id y item_id son obligatorios' });
  if (typeStr !== 'in' && typeStr !== 'out') return res.status(400).json({ ok: false, error: 'movement_type debe ser in u out' });
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ ok: false, error: 'quantity debe ser un número > 0' });
  if (!canAccessClub(req, clubIdStr)) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: itemRow, error: itemErr } = await supabase
      .from('inventory_items')
      .select('id')
      .eq('id', itemIdStr)
      .eq('club_id', clubIdStr)
      .maybeSingle();

    if (itemErr) {
      if (isMissingRelationError(itemErr.message)) {
        return res.status(503).json({ ok: false, error: 'Tabla inventory_items no existe. Aplica la migración en Supabase.' });
      }
      return res.status(500).json({ ok: false, error: itemErr.message });
    }
    if (!itemRow) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

    if (typeStr === 'out') {
      // Validación: no permitir que el stock quede negativo.
      const { data: movements, error: movErr } = await supabase
        .from('inventory_movements')
        .select('movement_type, quantity')
        .eq('club_id', clubIdStr)
        .eq('item_id', itemIdStr);

      if (movErr) {
        if (isMissingRelationError(movErr.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_movements no existe.' });
        return res.status(500).json({ ok: false, error: movErr.message });
      }

      let currentStock = 0;
      for (const m of movements ?? []) {
        const movementType = String((m as any).movement_type ?? '') as InventoryMovementType;
        const q = Number((m as any).quantity ?? 0);
        const sign = movementType === 'out' ? -1 : 1;
        if (Number.isFinite(q) && q > 0) currentStock += sign * Math.trunc(q);
      }

      if (currentStock - Math.trunc(qty) < 0) {
        return res.status(400).json({ ok: false, error: 'No puedes restar más stock del disponible' });
      }
    }

    const row: Record<string, unknown> = {
      club_id: clubIdStr,
      item_id: itemIdStr,
      movement_type: typeStr,
      quantity: Math.trunc(qty),
      reason: reason != null && String(reason).trim() ? String(reason).trim() : null,
    };

    const { data, error } = await supabase.from('inventory_movements').insert(row).select(MOVEMENT_FIELDS).single();
    if (error) {
      if (isMissingRelationError(error.message)) return res.status(503).json({ ok: false, error: 'Tabla inventory_movements no existe.' });
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(201).json({ ok: true, movement: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /inventario/items/{id}/image
 * Sube una imagen para un producto y actualiza `image_url`.
 */
router.post('/items/:id/image', requireClubOwnerOrAdmin, upload.single('file'), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se envió ningún archivo (campo "file")' });

    const supabase = getSupabaseServiceRoleClient();
    const { data: existing, error: existingErr } = await supabase.from('inventory_items').select('club_id').eq('id', id).maybeSingle();
    if (existingErr) return res.status(500).json({ ok: false, error: existingErr.message });
    if (!existing) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    if (!canAccessClub(req, String((existing as any).club_id))) return res.status(403).json({ ok: false, error: 'No tienes acceso a este club' });

    const buffer = req.file.buffer ?? (req.file as unknown as { buffer?: Buffer }).buffer;
    if (!buffer || !Buffer.isBuffer(buffer)) return res.status(500).json({ ok: false, error: 'No se pudo leer el archivo' });

    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `inventory-${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });
    if (uploadErr) return res.status(500).json({ ok: false, error: uploadErr.message });

    // Signed URL largo para que no se rompa al renderizar.
    const expiresIn = 60 * 60 * 24 * 365; // 1 año
    const { data: signedData, error: signedErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
    if (signedErr) return res.status(500).json({ ok: false, error: signedErr.message });

    const url = (signedData as { signedUrl?: string; signedURL?: string })?.signedUrl ?? (signedData as { signedURL?: string }).signedURL;
    if (!url) return res.status(500).json({ ok: false, error: 'No se pudo generar la URL de la imagen' });

    const { error: updateErr } = await supabase.from('inventory_items').update({ image_url: url }).eq('id', id);
    if (updateErr) return res.status(500).json({ ok: false, error: updateErr.message });

    return res.json({ ok: true, url });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;

