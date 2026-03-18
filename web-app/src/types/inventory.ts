export type InventoryMovementType = 'in' | 'out';

export interface InventoryItem {
    id: string;
    club_id: string;
    name: string;
    sku?: string | null;
    unit?: string | null;
    status: 'active' | 'inactive';
    unit_price_cents?: number;
    currency?: string;
    low_stock_threshold?: number;
    image_url?: string | null;
    created_at?: string;
    updated_at?: string;
    current_quantity?: number;
}

export interface InventoryMovement {
    id: string;
    club_id: string;
    item_id: string;
    movement_type: InventoryMovementType;
    quantity: number;
    reason?: string | null;
    created_at?: string;
}

