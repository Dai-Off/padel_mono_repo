import { apiFetch, apiFetchWithAuth } from './api';
import { getSupabaseClient } from '../lib/supabase';
import type { Player, ApiResponse } from '../types/api';

export const playerService = {
    getMyProfile: async (): Promise<Player> => {
        const response = await apiFetchWithAuth<ApiResponse<{ player: Player }>>('/players/me', { method: 'GET' });
        if (!response.player) throw new Error('No se pudo cargar el perfil');
        return response.player;
    },

    updateMyProfile: async (data: { first_name: string; last_name: string; phone: string }): Promise<Player> => {
        const response = await apiFetchWithAuth<ApiResponse<{ player: Player }>>('/players/me', {
            method: 'PATCH',
            body: JSON.stringify({
                first_name: data.first_name.trim(),
                last_name: data.last_name.trim(),
                phone: data.phone.trim(),
            }),
        });
        if (!response.player) throw new Error('Error al guardar');
        return response.player;
    },

    getAll: async (query?: string): Promise<Player[]> => {
        const path = query ? `/players?q=${encodeURIComponent(query)}` : '/players';
        const response = await apiFetch<ApiResponse<{ players: Player[] }>>(path);
        return response.players || [];
    },

    getById: async (id: string): Promise<Player> => {
        const response = await apiFetch<ApiResponse<{ player: Player }>>(`/players/${id}`);
        return response.player;
    },

    create: async (data: Partial<Player>): Promise<Player> => {
        const response = await apiFetch<ApiResponse<{ player: Player }>>('/players', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return response.player;
    },

    createManual: async (data: { first_name: string; last_name: string; phone: string; email?: string | null }): Promise<Player> => {
        const response = await apiFetch<ApiResponse<{ player: Player }>>('/players/manual', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        return response.player;
    },

    update: async (id: string, data: Partial<Player>): Promise<Player> => {
        const response = await apiFetch<ApiResponse<{ player: Player }>>(`/players/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return response.player;
    },

    /** Perfil del jugador logueado: nombre y apellido visibles (requiere Bearer). */
    updateMyName: async (first_name: string, last_name: string): Promise<Player> => {
        const response = await apiFetchWithAuth<ApiResponse<{ player: Player }>>('/players/me', {
            method: 'PATCH',
            body: JSON.stringify({ first_name, last_name }),
        });
        return response.player;
    },

    updateMyAvatarUrl: async (avatar_url: string | null): Promise<Player> => {
        const response = await apiFetchWithAuth<ApiResponse<{ player: Player }>>('/players/me', {
            method: 'PATCH',
            body: JSON.stringify({ avatar_url }),
        });
        return response.player;
    },

    /** Perfil del jugador logueado: teléfono (único). Puede combinarse con nombre/avatar en otras llamadas. */
    updateMyPhone: async (phone: string): Promise<Player> => {
        const response = await apiFetchWithAuth<ApiResponse<{ player: Player }>>('/players/me', {
            method: 'PATCH',
            body: JSON.stringify({ phone: phone.trim() }),
        });
        return response.player;
    },

    /** Sube a `player-avatars/{authUserId}/avatar.ext` y guarda la URL pública en el perfil. */
    uploadMyAvatar: async (file: File): Promise<Player> => {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Supabase no configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
        const {
            data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user?.id) throw new Error('Inicia sesión para subir tu foto');
        const uid = session.user.id;
        const ext = file.name.split('.').pop()?.toLowerCase();
        const safeExt = ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';
        const path = `${uid}/avatar.${safeExt}`;
        const { error: upErr } = await supabase.storage.from('player-avatars').upload(path, file, {
            upsert: true,
            contentType: file.type || undefined,
        });
        if (upErr) throw new Error(upErr.message);
        const { data: pub } = supabase.storage.from('player-avatars').getPublicUrl(path);
        const url = `${pub.publicUrl}${pub.publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
        return playerService.updateMyAvatarUrl(url);
    },

    delete: async (id: string): Promise<void> => {
        await apiFetch<ApiResponse<any>>(`/players/${id}`, {
            method: 'DELETE',
        });
    },
};
