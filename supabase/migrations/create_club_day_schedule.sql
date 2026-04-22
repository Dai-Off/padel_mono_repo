-- Migration: create club_day_schedule
-- Project: padel-app (oxowmfhnorxnabhzkcmi)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.club_day_schedule (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id    uuid        NOT NULL,
    date       date        NOT NULL,
    court_id   uuid        NOT NULL,
    slot       time        NOT NULL,       -- '07:00', '08:00', ..., '23:00'
    tariff_id  uuid        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_club_day_court_slot UNIQUE (club_id, date, court_id, slot)
);

-- Fast lookups by club + specific date
CREATE INDEX IF NOT EXISTS idx_cds_club_date
    ON public.club_day_schedule (club_id, date);

-- Backend uses service-role client → RLS not needed
ALTER TABLE public.club_day_schedule DISABLE ROW LEVEL SECURITY;
