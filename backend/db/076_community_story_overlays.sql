-- 076_community_story_overlays.sql
-- Editor de historias: guarda los overlays (texto, stickers, filtro) como metadatos.
-- Se dibujan encima de la foto/vídeo al reproducir; no se "queman" en el archivo.
--
-- Forma del JSON:
--   {
--     "filter": "warm" | "cool" | ... | "none",
--     "layers": [
--       { "id": "...", "type": "text"|"sticker", "value": "...", "color": "#fff",
--         "x": 0.5, "y": 0.4, "scale": 1, "rotation": 0 }
--     ]
--   }
-- x/y son la posición del centro en fracción (0..1) del contenedor.

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS overlays jsonb;
