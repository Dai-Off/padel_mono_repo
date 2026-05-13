export type InventoryMovementType = 'in' | 'out';

export interface InventoryCategory {
    id: string;
    club_id: string;
    name: string;
    created_at?: string;
    updated_at?: string;
}

export interface InventoryItem {
    id: string;
    club_id: string;
    category_id?: string | null;
    inventory_categories?: InventoryCategory | InventoryCategory[] | null;
    name: string;
    sku?: string | null;
    unit?: string | null;
    status: 'active' | 'inactive';
    unit_price_cents?: number;
    currency?: string;
    low_stock_threshold?: number;
    quick_sale_enabled?: boolean;
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
    movement_at?: string;
    created_at?: string;
}

