import { Router, Request, Response } from 'express';
import { getSupabaseServiceRoleClient } from '../lib/supabase';
import { getPlayerIdFromBearer } from '../lib/authPlayer';

const router = Router();

// Auxiliar para adjuntar marcos a jugadores
async function attachFramesToPlayers(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  players: Array<{ id: string; frame?: any }>
): Promise<void> {
  const ids = players.map(p => p.id).filter(Boolean);
  if (!ids.length) return;
  
  // getEquippedFrames de equippedFramesService
  const { getEquippedFrames } = require('../services/equippedFramesService');
  const frames = await getEquippedFrames(supabase, ids);
  for (const p of players) {
    p.frame = frames.get(p.id) ?? null;
  }
}

/**
 * POST /players/:id/follow
 * Toggle follow/unfollow a un jugador.
 */
router.post('/:id/follow', async (req: Request, res: Response) => {
  const targetPlayerId = req.params.id;
  const { playerId: currentUserId, error: authError } = await getPlayerIdFromBearer(req);

  if (authError || !currentUserId) {
    return res.status(401).json({ ok: false, error: authError || 'No autorizado' });
  }

  if (currentUserId === targetPlayerId) {
    return res.status(400).json({ ok: false, error: 'No puedes seguirte a ti mismo' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    // Verificar si el jugador existe
    const { data: targetPlayer, error: pError } = await supabase
      .from('players')
      .select('id')
      .eq('id', targetPlayerId)
      .neq('status', 'deleted')
      .maybeSingle();

    if (pError || !targetPlayer) {
      return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
    }

    // Verificar si ya lo sigue
    const { data: existingFollow, error: fError } = await supabase
      .from('player_follows')
      .select('id')
      .eq('follower_id', currentUserId)
      .eq('following_id', targetPlayerId)
      .maybeSingle();

    if (fError) {
      return res.status(500).json({ ok: false, error: fError.message });
    }

    let following = false;

    if (existingFollow) {
      // Dejar de seguir (DELETE)
      const { error: delError } = await supabase
        .from('player_follows')
        .delete()
        .eq('id', existingFollow.id);

      if (delError) return res.status(500).json({ ok: false, error: delError.message });
      following = false;
    } else {
      // Seguir (INSERT)
      const { error: insError } = await supabase
        .from('player_follows')
        .insert({
          follower_id: currentUserId,
          following_id: targetPlayerId,
        });

      if (insError) return res.status(500).json({ ok: false, error: insError.message });
      following = true;
    }

    // Obtener contador actualizado del target
    const { data: updatedTarget, error: uError } = await supabase
      .from('players')
      .select('followers_count')
      .eq('id', targetPlayerId)
      .single();

    const followersCount = updatedTarget?.followers_count ?? 0;

    return res.json({
      ok: true,
      following,
      followers_count: followersCount,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /players/:id/follow-status
 * Obtener estado de seguimiento entre el usuario autenticado y el target.
 */
router.get('/:id/follow-status', async (req: Request, res: Response) => {
  const targetPlayerId = req.params.id;
  const { playerId: currentUserId } = await getPlayerIdFromBearer(req);

  if (!currentUserId) {
    return res.json({ ok: true, is_following: false, is_followed_by: false });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    // Consultas paralelas
    const [followingQuery, followedByQuery] = await Promise.all([
      supabase
        .from('player_follows')
        .select('id')
        .eq('follower_id', currentUserId)
        .eq('following_id', targetPlayerId)
        .maybeSingle(),
      supabase
        .from('player_follows')
        .select('id')
        .eq('follower_id', targetPlayerId)
        .eq('following_id', currentUserId)
        .maybeSingle(),
    ]);

    return res.json({
      ok: true,
      is_following: !!followingQuery.data,
      is_followed_by: !!followedByQuery.data,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /players/me/follow-counts
 * Obtener contadores del usuario autenticado.
 */
router.get('/me/follow-counts', async (req: Request, res: Response) => {
  const { playerId: currentUserId, error: authError } = await getPlayerIdFromBearer(req);

  if (authError || !currentUserId) {
    return res.status(401).json({ ok: false, error: authError || 'No autorizado' });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: player, error } = await supabase
      .from('players')
      .select('followers_count, following_count')
      .eq('id', currentUserId)
      .single();

    if (error || !player) {
      return res.status(404).json({ ok: false, error: error?.message || 'Jugador no encontrado' });
    }

    return res.json({
      ok: true,
      followers_count: player.followers_count,
      following_count: player.following_count,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /players/:id/followers
 * Lista paginada de seguidores de un jugador.
 */
router.get('/:id/followers', async (req: Request, res: Response) => {
  const targetPlayerId = req.params.id;
  const { playerId: currentUserId } = await getPlayerIdFromBearer(req);
  const cursor = req.query.cursor as string | undefined;
  const limit = 20;

  try {
    const supabase = getSupabaseServiceRoleClient();

    let query = supabase
      .from('player_follows')
      .select(`
        created_at,
        player:players!player_follows_follower_id_fkey(id, first_name, last_name, username, avatar_url)
      `)
      .eq('following_id', targetPlayerId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const hasMore = data.length > limit;
    const items = hasMore ? data.slice(0, limit) : data;
    const nextCursor = hasMore ? items[items.length - 1].created_at : null;

    // Formatear jugadores
    const followers = items.map((item: any) => ({
      id: item.player.id,
      first_name: item.player.first_name,
      last_name: item.player.last_name,
      username: item.player.username,
      avatar_url: item.player.avatar_url,
      frame: null, // Se rellenará a continuación
      is_following: false, // Se calculará si hay sesión
    }));

    // Adjuntar marcos
    await attachFramesToPlayers(supabase, followers);

    // Calcular si el usuario autenticado los sigue
    if (currentUserId && followers.length > 0) {
      const followerIds = followers.map(f => f.id);
      const { data: followsMap } = await supabase
        .from('player_follows')
        .select('following_id')
        .eq('follower_id', currentUserId)
        .in('following_id', followerIds);

      if (followsMap) {
        const followingSet = new Set(followsMap.map((f: any) => f.following_id));
        for (const f of followers) {
          f.is_following = followingSet.has(f.id);
        }
      }
    }

    return res.json({
      ok: true,
      followers,
      next_cursor: nextCursor,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /players/:id/following
 * Lista paginada de personas a las que sigue un jugador.
 */
router.get('/:id/following', async (req: Request, res: Response) => {
  const targetPlayerId = req.params.id;
  const { playerId: currentUserId } = await getPlayerIdFromBearer(req);
  const cursor = req.query.cursor as string | undefined;
  const limit = 20;

  try {
    const supabase = getSupabaseServiceRoleClient();

    let query = supabase
      .from('player_follows')
      .select(`
        created_at,
        player:players!player_follows_following_id_fkey(id, first_name, last_name, username, avatar_url)
      `)
      .eq('follower_id', targetPlayerId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const hasMore = data.length > limit;
    const items = hasMore ? data.slice(0, limit) : data;
    const nextCursor = hasMore ? items[items.length - 1].created_at : null;

    // Formatear jugadores
    const following = items.map((item: any) => ({
      id: item.player.id,
      first_name: item.player.first_name,
      last_name: item.player.last_name,
      username: item.player.username,
      avatar_url: item.player.avatar_url,
      frame: null,
      is_following: false,
    }));

    await attachFramesToPlayers(supabase, following);

    if (currentUserId && following.length > 0) {
      const followingIds = following.map(f => f.id);
      const { data: followsMap } = await supabase
        .from('player_follows')
        .select('following_id')
        .eq('follower_id', currentUserId)
        .in('following_id', followingIds);

      if (followsMap) {
        const followingSet = new Set(followsMap.map((f: any) => f.following_id));
        for (const f of following) {
          f.is_following = followingSet.has(f.id);
        }
      }
    }

    return res.json({
      ok: true,
      following,
      next_cursor: nextCursor,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
