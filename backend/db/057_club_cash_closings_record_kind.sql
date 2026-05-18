-- Distingue arqueos intermedios de cierres de turno (solo cierre reinicia la ventana operativa).
alter table public.club_cash_closings
  add column if not exists record_kind text not null default 'cierre'
    check (record_kind in ('arqueo', 'cierre'));

create index if not exists idx_club_cash_closings_club_date_kind
  on public.club_cash_closings (club_id, for_date, record_kind, closed_at desc);
