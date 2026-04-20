import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getPlayerIdFromBearer } from '../lib/authPlayer';
import { moderateImage } from '../services/communityModerationService';

const router = Router();

// Configuración de Multer: en memoria, máx 10 fotos, 5MB cada una
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes JPEG, PNG o WebP'));
    }
  },
});

const BUCKET = 'community-posts';

/**
 * GET /community/feed
 * Feed principal de comunidad.
 */
router.get('/feed', async (req: Request, res: Response) => {
  const { playerId } = await getPlayerIdFromBearer(req);
  const cursor = req.query.cursor as string | undefined;
  const limit = 10;

  try {
    const supabase = getSupabaseServiceRoleClient();

    let query = supabase
      .from('community_posts')
      .select(`
        *,
        player:players(id, first_name, last_name, avatar_url),
        images:community_post_images(id, image_url, display_order)
      `)
      .eq('status', 'published')
      .eq('post_type', 'post')
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data: posts, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? items[items.length - 1].created_at : null;

    // Obtener likes del usuario actual para marcarlos
    let myLikes: string[] = [];
    let myBookmarks: string[] = [];
    if (playerId) {
      const { data: likes } = await supabase
        .from('community_likes')
        .select('post_id')
        .eq('player_id', playerId)
        .in('post_id', items.map(p => p.id));
      myLikes = (likes ?? []).map(l => l.post_id);

      const { data: bookmarks } = await supabase
        .from('community_bookmarks')
        .select('post_id')
        .eq('player_id', playerId)
        .in('post_id', items.map(p => p.id));
      myBookmarks = (bookmarks ?? []).map(b => b.post_id);
    }

    const enriched = items.map(p => ({
      ...p,
      has_liked: myLikes.includes(p.id),
      has_bookmarked: myBookmarks.includes(p.id),
    }));

    return res.json({ ok: true, posts: enriched, next_cursor: nextCursor });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /community/stories
 * Historias activas agrupadas por jugador.
 */
router.get('/stories', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const now = new Date().toISOString();

    const { data: stories, error } = await supabase
      .from('community_posts')
      .select(`
        *,
        player:players(id, first_name, last_name, avatar_url),
        images:community_post_images(id, image_url, display_order)
      `)
      .eq('status', 'published')
      .eq('post_type', 'story')
      .gt('expires_at', now)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ ok: false, error: error.message });

    // Agrupar por jugador
    const groupsMap = new Map<string, any>();
    for (const s of stories || []) {
      const pid = s.player_id;
      if (!groupsMap.has(pid)) {
        groupsMap.set(pid, {
          player_id: pid,
          player: s.player,
          stories: []
        });
      }
      groupsMap.get(pid).stories.push(s);
    }

    return res.json({ ok: true, groups: Array.from(groupsMap.values()) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /community/posts
 * Crea una publicación o historia.
 */
router.post('/posts', upload.array('files', 10), async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ ok: false, error: 'Se requiere al menos una imagen' });
  }

  const { caption, location, post_type } = req.body ?? {};
  const type = post_type === 'story' ? 'story' : post_type === 'reel' ? 'reel' : 'post';
  const expiresAt = type === 'story' ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;

  const uploadedUrls: string[] = [];
  const storagePaths: string[] = [];
  let createdPostId: string | null = null;

  try {
    const supabase = getSupabaseServiceRoleClient();

    // 1. Subir a Storage
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.originalname.split('.').pop() || 'jpg';
      const path = `${playerId}/${Date.now()}-${i}.${ext}`;
      
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file.buffer, {
        contentType: file.mimetype,
      });

      if (upErr) throw upErr;
      storagePaths.push(path);

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      uploadedUrls.push(publicUrl);
    }

    // 2. Moderación (SIGHTENGINE)
    let isApproved = true;
    let rejectionReason = '';
    let lastModerationResult = null;

    for (const url of uploadedUrls) {
      const mod = await moderateImage(url);
      if (!mod.approved) {
        isApproved = false;
        rejectionReason = mod.reason || 'Contenido inapropiado';
        lastModerationResult = mod.raw;
        break;
      }
      lastModerationResult = mod.raw;
    }

    if (!isApproved) {
      // Cleanup: borrar de storage
      await supabase.storage.from(BUCKET).remove(storagePaths);
      return res.status(400).json({ 
        ok: false, 
        error: `Publicación rechazada por moderación: ${rejectionReason}`,
        reason: rejectionReason 
      });
    }

    // 3. Insertar Post
    const { data: post, error: postErr } = await supabase
      .from('community_posts')
      .insert({
        player_id: playerId,
        caption: caption?.trim() || null,
        location: location?.trim() || null,
        post_type: type,
        status: 'published',
        moderation_result: lastModerationResult,
        expires_at: expiresAt
      })
      .select()
      .single();

    if (postErr) throw postErr;
    createdPostId = post.id;

    // 4. Insertar Imágenes
    const imageRows = uploadedUrls.map((url, i) => ({
      post_id: post.id,
      image_url: url,
      display_order: i
    }));

    const { error: imgErr } = await supabase.from('community_post_images').insert(imageRows);
    if (imgErr) throw imgErr;

    return res.status(201).json({ ok: true, post: { ...post, images: imageRows } });

  } catch (err) {
    const supabase = getSupabaseServiceRoleClient();
    
    // Cleanup storage
    if (storagePaths.length > 0) {
      await supabase.storage.from(BUCKET).remove(storagePaths);
    }

    // Cleanup orphan post
    if (createdPostId) {
      await supabase.from('community_posts').delete().eq('id', createdPostId);
    }

    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /community/posts/:id/like
 * Toggle like.
 */
router.post('/posts/:id/like', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const { id } = req.params;

  try {
    const supabase = getSupabaseServiceRoleClient();

    // Check existing
    const { data: existing } = await supabase
      .from('community_likes')
      .select('id')
      .eq('post_id', id)
      .eq('player_id', playerId)
      .maybeSingle();

    if (existing) {
      await supabase.from('community_likes').delete().eq('id', existing.id);
      return res.json({ ok: true, liked: false });
    } else {
      await supabase.from('community_likes').insert({ post_id: id, player_id: playerId });
      return res.json({ ok: true, liked: true });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /community/posts/:id/bookmark
 * Toggle bookmark.
 */
router.post('/posts/:id/bookmark', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const { id } = req.params;

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: existing } = await supabase
      .from('community_bookmarks')
      .select('id')
      .eq('post_id', id)
      .eq('player_id', playerId)
      .maybeSingle();

    if (existing) {
      await supabase.from('community_bookmarks').delete().eq('id', existing.id);
      return res.json({ ok: true, bookmarked: false });
    } else {
      await supabase.from('community_bookmarks').insert({ post_id: id, player_id: playerId });
      return res.json({ ok: true, bookmarked: true });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /community/posts/:id/comments
 * Comentarios de un post.
 */
router.get('/posts/:id/comments', async (req: Request, res: Response) => {
  const { id } = req.params;
  const cursor = req.query.cursor as string | undefined;
  const limit = 20;

  try {
    const supabase = getSupabaseServiceRoleClient();

    let query = supabase
      .from('community_comments')
      .select(`
        *,
        player:players(id, first_name, last_name, avatar_url)
      `)
      .eq('post_id', id)
      .order('created_at', { ascending: true })
      .limit(limit + 1);

    if (cursor) {
      query = query.gt('created_at', cursor);
    }

    const { data: comments, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    const nextCursor = hasMore ? items[items.length - 1].created_at : null;

    return res.json({ ok: true, comments: items, next_cursor: nextCursor });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /community/posts/:id/comments
 * Agrega comentario.
 */
router.post('/posts/:id/comments', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const { id } = req.params;
  const { content } = req.body ?? {};
  if (!content?.trim()) return res.status(400).json({ ok: false, error: 'El comentario no puede estar vacío' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: comment, error } = await supabase
      .from('community_comments')
      .insert({
        post_id: id,
        player_id: playerId,
        content: content.trim()
      })
      .select(`
        *,
        player:players(id, first_name, last_name, avatar_url)
      `)
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(201).json({ ok: true, comment });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /community/posts/:id/report
 * Reportar post.
 */
router.post('/posts/:id/report', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const { id } = req.params;
  const { reason, description } = req.body ?? {};

  if (!reason) return res.status(400).json({ ok: false, error: 'Motivo requerido' });

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase.from('community_reports').insert({
      post_id: id,
      reporter_player_id: playerId,
      reason,
      description
    });

    if (error) {
      if (error.code === '23505') return res.status(409).json({ ok: false, error: 'Ya has reportado esta publicación' });
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, message: 'Reporte recibido' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * DELETE /community/posts/:id
 * Eliminar post propio.
 */
router.delete('/posts/:id', async (req: Request, res: Response) => {
  const { playerId, error: authErr } = await getPlayerIdFromBearer(req);
  if (authErr) return res.status(401).json({ ok: false, error: authErr });

  const { id } = req.params;

  try {
    const supabase = getSupabaseServiceRoleClient();
    
    // Check ownership
    const { data: post } = await supabase.from('community_posts').select('player_id').eq('id', id).single();
    if (!post) return res.status(404).json({ ok: false, error: 'Post no encontrado' });
    if (post.player_id !== playerId) return res.status(403).json({ ok: false, error: 'No tienes permiso para eliminar este post' });

    // Obtener imágenes para borrar de storage
    const { data: images } = await supabase.from('community_post_images').select('image_url').eq('post_id', id);
    
    const { error } = await supabase.from('community_posts').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: error.message });

    // Cleanup storage (ignore errors)
    if (images && images.length > 0) {
      const paths = images.map(img => {
        const parts = img.image_url.split('/public/community-posts/');
        return parts.length > 1 ? parts[1] : null;
      }).filter(Boolean) as string[];
      if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
