-- Club public contact and notification preferences (club portal settings).

alter table public.clubs
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists notify_new_bookings boolean not null default true,
  add column if not exists notify_cancellations boolean not null default true,
  add column if not exists notify_maintenance_reminders boolean not null default true,
  add column if not exists notify_daily_email_summary boolean not null default false;
