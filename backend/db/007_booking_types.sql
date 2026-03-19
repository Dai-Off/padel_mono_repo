-- ============================================================
-- Migration 007: Booking Types
-- Adds booking_type discriminator and supporting tables to
-- model all reservation modalities:
--   standard, open_match, pozo, fixed_recurring,
--   school_group, school_individual, flat_rate,
--   tournament, blocked
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- STEP 1: Extend bookings table
-- ──────────────────────────────────────────────────────────────

-- 1a. Booking type discriminator
ALTER TABLE public.bookings
  ADD COLUMN booking_type text NOT NULL DEFAULT 'standard'
    CHECK (booking_type IN (
      'standard',           -- Pista privada normal
      'open_match',         -- Partido abierto (4 jugadores, ELO-based)
      'pozo',               -- Americanas / Melee
      'fixed_recurring',    -- Turno fijo semanal por temporada
      'school_group',       -- Clase de grupo con cuota mensual
      'school_individual',  -- Clase particular (pago suelto o bono)
      'flat_rate',          -- Tarifa plana (coste 0 en planilla, factura a mes vencido)
      'tournament',         -- Pistas bloqueadas para torneo externo
      'blocked'             -- Bloqueo administrativo de pista
    ));

-- 1b. Source channel
ALTER TABLE public.bookings
  ADD COLUMN source_channel text NOT NULL DEFAULT 'manual'
    CHECK (source_channel IN (
      'app',     -- Creada por jugador desde Playtomic / WeMatch
      'manual',  -- Creada por recepcionista desde el panel
      'system'   -- Generada automáticamente (tarifa plana, recurrencia)
    ));

-- 1c. organizer_player_id nullable
--     Tarifa plana, torneos y bloqueos no tienen jugador organizador
ALTER TABLE public.bookings
  ALTER COLUMN organizer_player_id DROP NOT NULL;

-- 1d. Instructor (clases particulares y de grupo)
ALTER TABLE public.bookings
  ADD COLUMN instructor_player_id uuid REFERENCES public.players(id);

-- 1e. Notas del recepcionista
ALTER TABLE public.bookings
  ADD COLUMN notes text;

-- 1f. Reserva padre para instancias de turno fijo
--     Cada instancia semanal apunta a la reserva-plantilla
ALTER TABLE public.bookings
  ADD COLUMN parent_booking_id uuid REFERENCES public.bookings(id);

-- 1g. Expand status check constraint
ALTER TABLE public.bookings
  DROP CONSTRAINT bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
    CHECK (status IN (
      'pending_payment',  -- Pendiente de cobro
      'partial_payment',  -- Split en proceso (algunos pagaron, otros no)
      'confirmed',        -- Confirmada y pagada
      'flat_rate',        -- Coste 0 en planilla (factura a mes vencido)
      'no_show',          -- No se presentó sin avisar con 48h de antelación
      'completed',        -- Jugada y finalizada
      'cancelled'         -- Cancelada
    ));

-- 1h. Indices for new columns
CREATE INDEX IF NOT EXISTS idx_bookings_booking_type
  ON public.bookings (booking_type);

CREATE INDEX IF NOT EXISTS idx_bookings_source_channel
  ON public.bookings (source_channel);

CREATE INDEX IF NOT EXISTS idx_bookings_instructor
  ON public.bookings (instructor_player_id);

CREATE INDEX IF NOT EXISTS idx_bookings_parent
  ON public.bookings (parent_booking_id);


-- ──────────────────────────────────────────────────────────────
-- STEP 2: Flat rate agreements (Tarifa Plana)
-- A contract between the club and an external academy.
-- The bookings it generates have booking_type = 'flat_rate'
-- and total_price_cents = 0.  Billing is reconciled monthly.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.flat_rate_agreements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               uuid NOT NULL REFERENCES public.clubs(id),

  counterparty_name     text NOT NULL,        -- e.g. "Diagonal Padel Academia"
  monthly_amount_cents  integer NOT NULL,     -- amount billed at month-end
  currency              char(3) NOT NULL DEFAULT 'EUR',

  season_start          date NOT NULL,
  season_end            date NOT NULL,

  notes                 text,

  status                text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'terminated')),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flat_rate_agreements_club
  ON public.flat_rate_agreements (club_id);

-- Fixed court slots covered by the agreement
-- e.g. 4 courts Mon-Fri 09:00-17:00, Fri until 14:00
CREATE TABLE IF NOT EXISTS public.flat_rate_court_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id  uuid NOT NULL REFERENCES public.flat_rate_agreements(id) ON DELETE CASCADE,
  court_id      uuid NOT NULL REFERENCES public.courts(id),

  day_of_week   smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Monday

  start_minutes integer NOT NULL,   -- minutes since midnight
  end_minutes   integer NOT NULL,

  UNIQUE (agreement_id, court_id, day_of_week)
);

-- FK on bookings
ALTER TABLE public.bookings
  ADD COLUMN flat_rate_agreement_id uuid
    REFERENCES public.flat_rate_agreements(id);

CREATE INDEX IF NOT EXISTS idx_bookings_flat_rate_agreement
  ON public.bookings (flat_rate_agreement_id);


-- ──────────────────────────────────────────────────────────────
-- STEP 3: Booking recurrences (Turno Fijo)
-- Stores the recurrence rule for a fixed weekly slot.
-- The template_booking_id points to the first instance.
-- Every subsequent weekly instance is a normal booking row
-- with parent_booking_id = template_booking_id.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.booking_recurrences (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The first booking in the series acts as the template
  template_booking_id         uuid NOT NULL UNIQUE REFERENCES public.bookings(id),

  -- RFC 5545 RRULE string
  -- e.g. 'FREQ=WEEKLY;BYDAY=TH' = every Thursday
  rrule                       text NOT NULL,

  season_start                date NOT NULL,
  season_end                  date NOT NULL,

  -- Hours of notice required to cancel without penalty
  cancellation_notice_hours   integer NOT NULL DEFAULT 48,

  -- Weeks kept paid in advance (club protocol: always 1 ahead)
  prepaid_weeks               integer NOT NULL DEFAULT 1,

  -- What happens when player cancels without enough notice
  no_show_policy              text NOT NULL DEFAULT 'charge_if_unsold'
    CHECK (no_show_policy IN (
      'charge_always',     -- Charge regardless of whether court was re-sold
      'charge_if_unsold',  -- Charge only if the slot could not be re-sold
      'refund_to_wallet'   -- Always refund to player wallet / bono
    )),

  created_at                  timestamptz NOT NULL DEFAULT now()
);


-- ──────────────────────────────────────────────────────────────
-- STEP 4: School groups and class bonos (Escuelas)
-- ──────────────────────────────────────────────────────────────

-- Group class managed internally by the club
CREATE TABLE IF NOT EXISTS public.school_groups (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               uuid NOT NULL REFERENCES public.clubs(id),

  name                  text NOT NULL,   -- e.g. "Iniciación Martes 19:00"
  instructor_player_id  uuid REFERENCES public.players(id),

  level_description     text,            -- e.g. "Iniciación", "Intermedio"
  max_students          smallint NOT NULL DEFAULT 4,

  monthly_fee_cents     integer NOT NULL,
  currency              char(3) NOT NULL DEFAULT 'EUR',

  -- Fixed weekly schedule for this group
  day_of_week           smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_minutes         integer NOT NULL,
  duration_minutes      integer NOT NULL,

  season_start          date NOT NULL,
  season_end            date NOT NULL,

  status                text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_groups_club
  ON public.school_groups (club_id);

CREATE INDEX IF NOT EXISTS idx_school_groups_instructor
  ON public.school_groups (instructor_player_id);

-- Student enrollments per group
CREATE TABLE IF NOT EXISTS public.school_group_enrollments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                    uuid NOT NULL REFERENCES public.school_groups(id),
  player_id                   uuid NOT NULL REFERENCES public.players(id),

  enrolled_at                 timestamptz NOT NULL DEFAULT now(),
  left_at                     timestamptz,         -- NULL = still active

  -- Per-student fee override when different from group default
  monthly_fee_override_cents  integer,

  UNIQUE (group_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_school_enrollments_player
  ON public.school_group_enrollments (player_id);

-- Class credit packs for individual lessons
CREATE TABLE IF NOT EXISTS public.class_bonos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           uuid NOT NULL REFERENCES public.players(id),
  club_id             uuid NOT NULL REFERENCES public.clubs(id),

  total_classes       integer NOT NULL,
  remaining_classes   integer NOT NULL,

  price_cents         integer NOT NULL,
  currency            char(3) NOT NULL DEFAULT 'EUR',

  expires_at          timestamptz,
  purchased_at        timestamptz NOT NULL DEFAULT now(),

  status              text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'exhausted', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_class_bonos_player
  ON public.class_bonos (player_id);

CREATE INDEX IF NOT EXISTS idx_class_bonos_club
  ON public.class_bonos (club_id);

-- FK on bookings: which group class or bono this slot covers
ALTER TABLE public.bookings
  ADD COLUMN school_group_id uuid REFERENCES public.school_groups(id);

ALTER TABLE public.bookings
  ADD COLUMN class_bono_id uuid REFERENCES public.class_bonos(id);

CREATE INDEX IF NOT EXISTS idx_bookings_school_group
  ON public.bookings (school_group_id);

CREATE INDEX IF NOT EXISTS idx_bookings_class_bono
  ON public.bookings (class_bono_id);


-- ──────────────────────────────────────────────────────────────
-- STEP 5: Pozo events (Americanas / Melee)
-- One event occupies N courts.
-- Each court booking has booking_type = 'pozo'
-- and pozo_event_id pointing to this table.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pozo_events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                 uuid NOT NULL REFERENCES public.clubs(id),

  name                    text NOT NULL,

  event_date              date NOT NULL,
  start_time              time NOT NULL,
  end_time                time NOT NULL,

  max_participants        integer NOT NULL,
  current_participants    integer NOT NULL DEFAULT 0,

  rotation_mode           text NOT NULL DEFAULT 'americanas'
    CHECK (rotation_mode IN (
      'americanas',   -- Random partner rotation each round
      'melee',        -- All vs all
      'fixed_pairs',  -- No rotation
      'custom'        -- Organizer decides; see additional_info
    )),

  level_min               numeric(4,2),
  level_max               numeric(4,2),

  price_per_player_cents  integer,
  currency                char(3) NOT NULL DEFAULT 'EUR',

  additional_info         text,

  status                  text NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft','open','full','in_progress','completed','cancelled')),

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pozo_events_club
  ON public.pozo_events (club_id);

CREATE INDEX IF NOT EXISTS idx_pozo_events_date
  ON public.pozo_events (event_date);

-- Players registered for a pozo event
CREATE TABLE IF NOT EXISTS public.pozo_participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pozo_event_id   uuid NOT NULL REFERENCES public.pozo_events(id) ON DELETE CASCADE,
  player_id       uuid NOT NULL REFERENCES public.players(id),

  registered_at   timestamptz NOT NULL DEFAULT now(),

  payment_status  text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','refunded','no_show')),

  UNIQUE (pozo_event_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_pozo_participants_player
  ON public.pozo_participants (player_id);

-- FK on bookings
ALTER TABLE public.bookings
  ADD COLUMN pozo_event_id uuid REFERENCES public.pozo_events(id);

CREATE INDEX IF NOT EXISTS idx_bookings_pozo_event
  ON public.bookings (pozo_event_id);


-- ──────────────────────────────────────────────────────────────
-- STEP 6: Consistency trigger
-- Enforces that required FK columns are set for each booking_type
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_booking_type_consistency()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- flat_rate bookings must reference an agreement
  IF NEW.booking_type = 'flat_rate' AND NEW.flat_rate_agreement_id IS NULL THEN
    RAISE EXCEPTION 'booking_type=flat_rate requires flat_rate_agreement_id';
  END IF;

  -- school_group bookings must reference a group
  IF NEW.booking_type = 'school_group' AND NEW.school_group_id IS NULL THEN
    RAISE EXCEPTION 'booking_type=school_group requires school_group_id';
  END IF;

  -- pozo bookings must reference an event
  IF NEW.booking_type = 'pozo' AND NEW.pozo_event_id IS NULL THEN
    RAISE EXCEPTION 'booking_type=pozo requires pozo_event_id';
  END IF;

  -- standard/open_match/tournament/blocked/fixed_recurring must have an organizer
  -- unless it is a system-generated block or flat_rate
  IF NEW.booking_type IN ('standard','open_match','fixed_recurring')
     AND NEW.organizer_player_id IS NULL THEN
    RAISE EXCEPTION 'booking_type=% requires organizer_player_id', NEW.booking_type;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booking_type_consistency
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_booking_type_consistency();
