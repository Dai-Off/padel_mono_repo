/**
 * seed-bookings.ts
 *
 * Crea una reserva de cada tipo (9 tipos) para hoy y mañana.
 * Tipos: standard, open_match, pozo, fixed_recurring, school_group,
 *        school_individual, flat_rate, tournament, blocked
 *
 * Uso (desde el directorio backend/):
 *   npm run seed:bookings
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Supabase client ──────────────────────────────────────────────────────────

function getClient(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

function localDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

function ts(dateStr: string, hour: number, minute = 0): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dateStr}T${pad(hour)}:${pad(minute)}:00+01:00`;
}

// ─── Helpers DB ───────────────────────────────────────────────────────────────

async function firstRow<T>(supabase: SupabaseClient, table: string): Promise<T | null> {
  const { data, error } = await supabase.from(table).select('id').limit(1).maybeSingle();
  if (error) throw new Error(`Error consultando ${table}: ${error.message}`);
  return data as T | null;
}

async function insert<T>(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw new Error(`Error insertando en ${table}: ${error.message}`);
  return data as T;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = getClient();

  // ── 1. Obtener IDs base ───────────────────────────────────────────────────

  const court = await firstRow<{ id: string }>(supabase, 'courts');
  if (!court) throw new Error('No hay ninguna pista en la BD. Crea una primero.');

  const player = await firstRow<{ id: string }>(supabase, 'players');
  if (!player) throw new Error('No hay ningún jugador en la BD. Crea uno primero.');

  console.log('Pista:', court.id);
  console.log('Jugador:', player.id);

  // ── 2. Definición de los 9 tipos ─────────────────────────────────────────

  type BookingDef = {
    reservation_type: string;
    label: string;
    startHour: number;
    endHour: number;
    status: string;
    price: number;
    needsOrganizer: boolean;
  };

  const bookingTypes: BookingDef[] = [
    {
      reservation_type: 'standard',
      label: 'Reserva estándar privada',
      startHour: 9,
      endHour: 10,
      status: 'confirmed',
      price: 2400,
      needsOrganizer: true,
    },
    {
      reservation_type: 'open_match',
      label: 'Partido abierto (ELO)',
      startHour: 10,
      endHour: 11,
      status: 'confirmed',
      price: 2400,
      needsOrganizer: true,
    },
    {
      reservation_type: 'pozo',
      label: 'Americanas / Pozo',
      startHour: 11,
      endHour: 12,
      status: 'confirmed',
      price: 1000,
      needsOrganizer: false,
    },
    {
      reservation_type: 'fixed_recurring',
      label: 'Turno fijo semanal',
      startHour: 12,
      endHour: 13,
      status: 'confirmed',
      price: 2400,
      needsOrganizer: true,
    },
    {
      reservation_type: 'school_group',
      label: 'Clase grupo escuela',
      startHour: 13,
      endHour: 14,
      status: 'confirmed',
      price: 0,
      needsOrganizer: false,
    },
    {
      reservation_type: 'school_individual',
      label: 'Clase individual',
      startHour: 15,
      endHour: 16,
      status: 'confirmed',
      price: 3000,
      needsOrganizer: true,
    },
    {
      reservation_type: 'flat_rate',
      label: 'Tarifa plana academia',
      startHour: 16,
      endHour: 17,
      status: 'confirmed',
      price: 0,
      needsOrganizer: false,
    },
    {
      reservation_type: 'tournament',
      label: 'Torneo externo',
      startHour: 17,
      endHour: 18,
      status: 'confirmed',
      price: 0,
      needsOrganizer: false,
    },
    {
      reservation_type: 'blocked',
      label: 'Bloqueo administrativo',
      startHour: 18,
      endHour: 19,
      status: 'confirmed',
      price: 0,
      needsOrganizer: false,
    },
  ];

  // ── 3. Crear reservas para hoy y mañana ──────────────────────────────────

  const results: { date: string; type: string; id: string }[] = [];
  const errors: { date: string; type: string; error: string }[] = [];

  for (const daysAhead of [0, 1]) {
    const dateStr = localDate(daysAhead);
    console.log(`\n── Reservas para ${dateStr} ──`);

    for (const def of bookingTypes) {
      const payload: Record<string, unknown> = {
        court_id: court.id,
        start_at: ts(dateStr, def.startHour),
        end_at: ts(dateStr, def.endHour),
        timezone: 'Europe/Madrid',
        total_price_cents: def.price,
        currency: 'EUR',
        status: def.status,
        reservation_type: def.reservation_type,
        notes: `[SEED] ${def.label}`,
        organizer_player_id: player.id,
      };

      try {
        const booking = await insert<{ id: string }>(supabase, 'bookings', payload);
        console.log(`  ✓ ${def.reservation_type.padEnd(20)} → ${booking.id}`);
        results.push({ date: dateStr, type: def.reservation_type, id: booking.id });
      } catch (err) {
        const msg = (err as Error).message;
        console.error(`  ✗ ${def.reservation_type.padEnd(20)} → ${msg}`);
        errors.push({ date: dateStr, type: def.reservation_type, error: msg });
      }
    }
  }

  // ── 4. Resumen ────────────────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Creadas: ${results.length} / ${bookingTypes.length * 2}  |  Errores: ${errors.length}`);
  console.log('═══════════════════════════════════════════════════════════════');
  for (const r of results) {
    console.log(`  ${r.date}  ${r.type.padEnd(20)}  ${r.id}`);
  }
  if (errors.length > 0) {
    console.log('\nErrores:');
    for (const e of errors) {
      console.log(`  ${e.date}  ${e.type.padEnd(20)}  ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error('\nERROR FATAL:', err.message);
  process.exit(1);
});
