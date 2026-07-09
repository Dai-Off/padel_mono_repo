-- 090_player_peer_feedback_insight.sql
-- Cache del "peer feedback insight" (tarjeta de percepción de compañeros del Coach).
--
-- Hoy la tarjeta se genera EN CADA lectura del perfil llamando a OpenAI
-- (~2.2s + coste), dentro de la ruta crítica. Con esta tabla, la lectura sirve
-- el texto ya generado (1 query, sin OpenAI). Se regenera por evento: cuando un
-- compañero deja feedback nuevo (match_feedback) se recalcula para los valorados.
--
-- Clave (player_id, locale): el texto es específico del idioma. La primera vez
-- que se ve a un jugador en un idioma sin cache se genera al vuelo (1 llamada) y
-- se guarda; a partir de ahí, siempre cache y refresco por evento.

create table if not exists public.player_peer_feedback_insight (
  player_id uuid not null references public.players(id) on delete cascade,
  locale text not null,
  empty boolean not null default false,
  match_id uuid null,
  feedback_created_at timestamptz null,
  peer_count int not null default 0,
  average_perceived numeric null,
  distribution jsonb null,
  last_perceived int null,
  recommendation_ia text null,
  fortalezas text[] not null default '{}',
  a_mejorar text[] not null default '{}',
  insight_source text null,          -- 'openai' | 'template' | null
  generated_at timestamptz not null default now(),
  primary key (player_id, locale)
);

comment on table public.player_peer_feedback_insight is
  'Cache por (player_id, locale) de la tarjeta de percepción de compañeros del Coach. Se lee en la apertura del perfil (sin OpenAI) y se regenera cuando llega feedback nuevo.';
