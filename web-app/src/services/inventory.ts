import { apiFetchWithAuth, getApiBase } from './api';
import type { ApiResponse } from '../types/api';
import type { InventoryItem, InventoryMovement, InventoryMovementType } from '../types/inventory';

type ApiOk<T> = T & { ok: true };

export const inventoryService = {
    listItems: async (clubId: string): Promise<InventoryItem[]> => {
        const q = new URLSearchParams({ club_id: clubId });
        const res = await apiFetchWithAuth<ApiOk<{ items: InventoryItem[] }>>(`/inventario/items?${q}`);
        return res.items ?? [];
    },

    createItem: async (body: {
        club_id: string;
        name: string;
        sku?: string | null;
        unit?: string | null;
        status?: 'active' | 'inactive';
        unit_price_cents?: number;
        currency?: string;
        low_stock_threshold?: number;
        image_url?: string | null;
    }): Promise<InventoryItem> => {
        const res = await apiFetchWithAuth<ApiOk<{ item: InventoryItem }>>('/inventario/items', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        return res.item;
    },

    updateItem: async (
        id: string,
        body: Partial<
            Pick<InventoryItem, 'name' | 'sku' | 'unit' | 'status' | 'unit_price_cents' | 'currency' | 'low_stock_threshold' | 'image_url'>
        >
    ): Promise<InventoryItem> => {
        const res = await apiFetchWithAuth<ApiOk<{ item: InventoryItem }>>(`/inventario/items/${id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
        return res.item;
    },

    deleteItem: async (id: string): Promise<void> => {
        await apiFetchWithAuth<ApiResponse<any>>(`/inventario/items/${id}`, { method: 'DELETE' });
    },

    createMovement: async (body: {
        club_id: string;
        item_id: string;
        movement_type: InventoryMovementType;
        quantity: number;
        reason?: string | null;
    }): Promise<InventoryMovement> => {
        const res = await apiFetchWithAuth<ApiOk<{ movement: InventoryMovement }>>('/inventario/movements', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        return res.movement;
    },

    listMovements: async (params: { club_id: string; item_id?: string }): Promise<InventoryMovement[]> => {
        const q = new URLSearchParams({ club_id: params.club_id });
        if (params.item_id) q.set('item_id', params.item_id);
        const res = await apiFetchWithAuth<ApiOk<{ movements: InventoryMovement[] }>>(`/inventario/movements?${q}`);
        return res.movements ?? [];
    },

    uploadItemImage: async (itemId: string, file: File): Promise<{ url: string }> => {
        let token: string | null = null;
        try {
            const raw = localStorage.getItem('padel_session');
            if (raw) {
                const session = JSON.parse(raw);
                token = session?.access_token ?? null;
            }
        } catch {
            token = null;
        }

        const formData = new FormData();
        formData.append('file', file);

        const url = `${getApiBase()}/inventario/items/${itemId}/image`;
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData?.error || errorData?.message || 'Error al subir imagen');
        }

        const data = (await response.json()) as ApiResponse<{ url: string }> & { ok?: boolean };
        const resolvedUrl = (data as any)?.url ?? (data as any)?.data?.url;
        if (!resolvedUrl) throw new Error('No se pudo obtener la URL de la imagen');
        return { url: resolvedUrl };
    },
};

