/**
 * Carga productos de prueba en la tienda (4 por categoría) y repara imágenes rotas.
 *
 * Uso:
 *   cd backend
 *   npm run store:seed
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { assertReachableImageUrl } from '../src/lib/validateImageUrl';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PREFIX = 'WM-SEED-';

/** URLs verificadas en Unsplash (w=800, fit=crop). */
const IMG = {
  pala: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&h=800&fit=crop',
  pala2: 'https://images.unsplash.com/photo-1554067283-0d4cd4d43858?w=800&h=800&fit=crop',
  pala3: 'https://images.unsplash.com/photo-1599586120429-9aeaa76516a8?w=800&h=800&fit=crop',
  pala4: 'https://images.unsplash.com/photo-1622163642998-1ea32b0b3b90?w=800&h=800&fit=crop',
  ball: 'https://images.unsplash.com/photo-1599409091912-88526846d833?w=800&h=800&fit=crop',
  ball2: 'https://images.unsplash.com/photo-1617951317150-1e32a5c4c4ad?w=800&h=800&fit=crop',
  ball3: 'https://images.unsplash.com/photo-1534156602686-5fa8ac0b4d3f?w=800&h=800&fit=crop',
  ball4: 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=800&h=800&fit=crop',
  shoe: 'https://images.unsplash.com/photo-1610000750238-28d5e469692d?w=800&h=800&fit=crop',
  shoe2: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&h=800&fit=crop',
  shoe3: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=800&fit=crop',
  shoe4: 'https://images.unsplash.com/photo-1460353589841-49d76a7887ab?w=800&h=800&fit=crop',
  wear: 'https://images.unsplash.com/photo-1659081469066-c88ca2dec240?w=800&h=800&fit=crop',
  wear2: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=800&fit=crop',
  wear3: 'https://images.unsplash.com/photo-1661474973381-130596c650c4?w=800&h=800&fit=crop',
  wear4: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=800&fit=crop',
  acc: 'https://images.unsplash.com/photo-1569597773059-6d747e5f8ed5?w=800&h=800&fit=crop',
  bag: 'https://images.unsplash.com/photo-1622560481979-f5b0174242a0?w=800&h=800&fit=crop',
  acc3: 'https://images.unsplash.com/photo-1590874103328-eac3a0ce6830?w=800&h=800&fit=crop',
  acc4: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&h=800&fit=crop',
} as const;

const CATEGORY_FALLBACK: Record<string, string> = {
  palas: IMG.pala,
  pelotas: IMG.ball,
  calzado: IMG.shoe,
  ropa: IMG.wear,
  accesorios: IMG.bag,
};

const PRODUCTS = [
  { sku: `${PREFIX}PALA-01`, name: 'Nox AT10 Luxury Genius', brand: 'Nox', category: 'palas', price_cents: 34900, compare_at_price_cents: 39900, stock_quantity: 100, image_url: IMG.pala, is_featured: true, is_flash_deal: true, sort_order: 1 },
  { sku: `${PREFIX}PALA-02`, name: 'Bullpadel Hack 03', brand: 'Bullpadel', category: 'palas', price_cents: 28900, compare_at_price_cents: 34900, stock_quantity: 90, image_url: 'https://images.unsplash.com/photo-1767128890439-1af9ca2ff1ac?w=800&h=800&fit=crop', is_featured: true, is_flash_deal: false, sort_order: 2 },
  { sku: `${PREFIX}PALA-03`, name: 'Adidas Metalbone 3.2', brand: 'Adidas', category: 'palas', price_cents: 31900, compare_at_price_cents: 36900, stock_quantity: 80, image_url: IMG.pala3, is_featured: false, is_flash_deal: true, sort_order: 3 },
  { sku: `${PREFIX}PALA-04`, name: 'Head Delta Elite', brand: 'Head', category: 'palas', price_cents: 25900, compare_at_price_cents: null, stock_quantity: 75, image_url: IMG.pala4, is_featured: false, is_flash_deal: false, sort_order: 4 },
  { sku: `${PREFIX}BALL-01`, name: 'Head Padel Pro S (3 u.)', brand: 'Head', category: 'pelotas', price_cents: 599, compare_at_price_cents: 799, stock_quantity: 200, image_url: IMG.ball, is_featured: true, is_flash_deal: false, sort_order: 10 },
  { sku: `${PREFIX}BALL-02`, name: 'Dunlop Pro Padel (3 u.)', brand: 'Dunlop', category: 'pelotas', price_cents: 549, compare_at_price_cents: null, stock_quantity: 180, image_url: IMG.ball2, is_featured: false, is_flash_deal: false, sort_order: 11 },
  { sku: `${PREFIX}BALL-03`, name: 'Wilson Championship', brand: 'Wilson', category: 'pelotas', price_cents: 649, compare_at_price_cents: 799, stock_quantity: 150, image_url: IMG.ball3, is_featured: false, is_flash_deal: true, sort_order: 12 },
  { sku: `${PREFIX}BALL-04`, name: 'Babolat Padel Tour (4 u.)', brand: 'Babolat', category: 'pelotas', price_cents: 899, compare_at_price_cents: 1099, stock_quantity: 140, image_url: IMG.ball4, is_featured: false, is_flash_deal: false, sort_order: 13 },
  { sku: `${PREFIX}SHOE-01`, name: 'Asics Gel Padel Pro 6', brand: 'Asics', category: 'calzado', price_cents: 12900, compare_at_price_cents: 15900, stock_quantity: 90, image_url: IMG.shoe, is_featured: true, is_flash_deal: true, sort_order: 20 },
  { sku: `${PREFIX}SHOE-02`, name: 'Adidas Courtjam Control', brand: 'Adidas', category: 'calzado', price_cents: 9900, compare_at_price_cents: 11900, stock_quantity: 85, image_url: IMG.shoe2, is_featured: false, is_flash_deal: false, sort_order: 21 },
  { sku: `${PREFIX}SHOE-03`, name: 'Nike React Vapor NXT', brand: 'Nike', category: 'calzado', price_cents: 13900, compare_at_price_cents: 16900, stock_quantity: 70, image_url: IMG.shoe3, is_featured: true, is_flash_deal: false, sort_order: 22 },
  { sku: `${PREFIX}SHOE-04`, name: 'Bullpadel Flow Hybrid', brand: 'Bullpadel', category: 'calzado', price_cents: 10900, compare_at_price_cents: null, stock_quantity: 100, image_url: IMG.shoe4, is_featured: false, is_flash_deal: false, sort_order: 23 },
  { sku: `${PREFIX}WEAR-01`, name: 'Adidas Club Padel Tee', brand: 'Adidas', category: 'ropa', price_cents: 3499, compare_at_price_cents: 4499, stock_quantity: 160, image_url: IMG.wear, is_featured: false, is_flash_deal: false, sort_order: 30 },
  { sku: `${PREFIX}WEAR-02`, name: 'Nike Dri-FIT Polo', brand: 'Nike', category: 'ropa', price_cents: 4499, compare_at_price_cents: 5499, stock_quantity: 130, image_url: IMG.wear2, is_featured: true, is_flash_deal: false, sort_order: 31 },
  { sku: `${PREFIX}WEAR-03`, name: 'Bullpadel Michi Short', brand: 'Bullpadel', category: 'ropa', price_cents: 3999, compare_at_price_cents: null, stock_quantity: 145, image_url: IMG.wear3, is_featured: false, is_flash_deal: false, sort_order: 32 },
  { sku: `${PREFIX}WEAR-04`, name: 'Wilson Padel Jacket', brand: 'Wilson', category: 'ropa', price_cents: 6999, compare_at_price_cents: 8499, stock_quantity: 80, image_url: IMG.wear4, is_featured: false, is_flash_deal: true, sort_order: 33 },
  { sku: `${PREFIX}ACC-01`, name: 'Hesacore Grip Tour', brand: 'Hesacore', category: 'accesorios', price_cents: 1499, compare_at_price_cents: null, stock_quantity: 250, image_url: IMG.acc, is_featured: true, is_flash_deal: false, sort_order: 40 },
  { sku: `${PREFIX}ACC-02`, name: 'Adidas Padel Tour Backpack', brand: 'Adidas', category: 'accesorios', price_cents: 7900, compare_at_price_cents: 9900, stock_quantity: 110, image_url: IMG.bag, is_featured: true, is_flash_deal: true, sort_order: 41 },
  { sku: `${PREFIX}ACC-03`, name: 'Wilson Pro Overgrip (3 u.)', brand: 'Wilson', category: 'accesorios', price_cents: 999, compare_at_price_cents: 1299, stock_quantity: 300, image_url: IMG.acc3, is_featured: false, is_flash_deal: false, sort_order: 42 },
  { sku: `${PREFIX}ACC-04`, name: 'Bullpadel Frame Protector', brand: 'Bullpadel', category: 'accesorios', price_cents: 899, compare_at_price_cents: 1199, stock_quantity: 220, image_url: IMG.acc4, is_featured: false, is_flash_deal: false, sort_order: 43 },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function repairBrokenCatalogImages(supabase: any): Promise<number> {
  const { data: catalog, error } = await supabase
    .from('store_products')
    .select('id, name, category, image_url, is_active');
  if (error) throw error;

  let repaired = 0;
  for (const product of (catalog ?? []) as Array<{
    id: string;
    name: string;
    category: string;
    image_url: string | null;
    is_active: boolean;
  }>) {
    const fallback = CATEGORY_FALLBACK[product.category];
    if (!fallback) continue;

    const current = typeof product.image_url === 'string' ? product.image_url.trim() : '';
    const needsImage = !current;
    const check = needsImage ? { ok: false as const } : await assertReachableImageUrl(current);
    if (check.ok) continue;

    const { error: updateErr } = await supabase
      .from('store_products')
      .update({ image_url: fallback, updated_at: new Date().toISOString() })
      .eq('id', product.id);
    if (updateErr) {
      console.error('No se pudo reparar imagen:', product.name, updateErr.message);
      continue;
    }
    repaired++;
    console.log('Imagen reparada:', product.name);
  }
  return repaired;
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let created = 0;
  let updated = 0;

  for (const p of PRODUCTS) {
    let imageUrl = p.image_url;
    const imageCheck = await assertReachableImageUrl(imageUrl);
    if (!imageCheck.ok) {
      imageUrl = CATEGORY_FALLBACK[p.category] ?? IMG.pala;
      console.warn('URL seed reemplazada:', p.sku, '→', imageUrl);
    }

    const row = {
      ...p,
      image_url: imageUrl,
      description: null,
      low_stock_threshold: 5,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('store_products')
      .select('id')
      .eq('sku', p.sku)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from('store_products').update(row).eq('id', existing.id);
      if (error) {
        console.error('Error update:', p.sku, error.message);
        continue;
      }
      updated++;
      console.log('Actualizado', p.sku);
    } else {
      const { data: inserted, error } = await supabase
        .from('store_products')
        .upsert(row, { onConflict: 'sku' })
        .select('id, stock_quantity')
        .single();
      if (error) {
        console.error('Error upsert:', p.sku, error.message);
        continue;
      }
      const { count: movementCount } = await supabase
        .from('store_stock_movements')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', inserted.id)
        .eq('reason', 'initial');
      if ((movementCount ?? 0) === 0 && inserted.stock_quantity > 0) {
        await supabase.from('store_stock_movements').insert({
          product_id: inserted.id,
          quantity_delta: inserted.stock_quantity,
          quantity_after: inserted.stock_quantity,
          reason: 'initial',
          note: 'seed-store-products',
        });
      }
      created++;
      console.log('Creado/upsert', p.sku, '-', p.name);
    }
  }

  const repaired = await repairBrokenCatalogImages(supabase);

  console.log(
    `\nListo: ${created} creados, ${updated} actualizados, ${repaired} imágenes reparadas (${PRODUCTS.length} seed)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
