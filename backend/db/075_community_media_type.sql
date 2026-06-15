-- 075_community_media_type.sql
-- Soporte de vídeo (Clips) en la comunidad.
--
-- Renombra la tabla de media de las publicaciones (antes solo imágenes, ahora
-- también vídeos) y añade el tipo de media y la portada del vídeo.
--
-- community_post_content guarda cada media de un post/story/reel:
--   - media_url:      para imágenes es la imagen; para vídeos es la URL del vídeo.
--   - media_type:     'image' | 'video'.
--   - thumbnail_url:  portada del vídeo (la genera/sube el cliente). NULL en imágenes.

-- 1) Renombrar tabla community_post_images -> community_post_content (idempotente).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'community_post_images'
  ) THEN
    ALTER TABLE public.community_post_images RENAME TO community_post_content;
  END IF;
END $$;

-- 2) Renombrar columna image_url -> media_url (idempotente).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'community_post_content' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.community_post_content RENAME COLUMN image_url TO media_url;
  END IF;
END $$;

-- 3) Nuevas columnas: tipo de media y portada del vídeo.
ALTER TABLE public.community_post_content
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- 4) Restringir los valores válidos de media_type.
--    Si una versión previa de esta migración creó el check con el nombre antiguo
--    (community_post_images_media_type_check), lo retiramos para no duplicarlo.
ALTER TABLE public.community_post_content
  DROP CONSTRAINT IF EXISTS community_post_images_media_type_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_post_content_media_type_check'
  ) THEN
    ALTER TABLE public.community_post_content
      ADD CONSTRAINT community_post_content_media_type_check
      CHECK (media_type IN ('image', 'video'));
  END IF;
END $$;
