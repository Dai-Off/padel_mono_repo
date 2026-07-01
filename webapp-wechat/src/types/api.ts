export interface Player {
    id: string;
    created_at: string;
    first_name: string;
    last_name: string;
    username?: string | null;
    email: string | null;
    phone: string | null;
    avatar_url?: string | null;
    elo_rating: number;
    status: 'active' | 'blocked' | 'deleted';
    onboarding_completed?: boolean;
}

export interface Club {
    id: string;
    created_at: string;
    name: string;
    description: string | null;
    address: string;
    city: string;
    postal_code: string;
    contact_phone?: string | null;
    contact_email?: string | null;
    logo_url?: string | null;
    base_currency: string;
}

export type ApiListResponse<TKey extends string, T> = {
    ok: boolean;
} & Record<TKey, T[]>;

export type StoreCategory = 'palas' | 'pelotas' | 'calzado' | 'ropa' | 'accesorios';

export interface StoreProduct {
    id: string;
    created_at: string;
    updated_at: string;
    name: string;
    brand: string | null;
    description: string | null;
    category: StoreCategory;
    sku: string | null;
    price_cents: number;
    compare_at_price_cents: number | null;
    stock_quantity: number;
    low_stock_threshold: number;
    image_url: string | null;
    is_active: boolean;
    is_featured: boolean;
    is_flash_deal: boolean;
    sort_order: number;
}

export type StoreProductInput = {
    name: string;
    brand?: string | null;
    description?: string | null;
    category: StoreCategory;
    sku?: string | null;
    price_cents: number;
    compare_at_price_cents?: number | null;
    stock_quantity: number;
    low_stock_threshold?: number;
    image_url?: string | null;
    is_active?: boolean;
    is_featured?: boolean;
    is_flash_deal?: boolean;
    sort_order?: number;
};

export type StoreStockAdjustInput = {
    quantity_delta: number;
    reason?: 'restock' | 'sale' | 'adjustment' | 'return';
    note?: string | null;
};

export interface StoreFlashSettings {
    id: number;
    flash_enabled: boolean;
    flash_ends_at: string | null;
    flash_title: string | null;
    updated_at: string;
}

export type StoreFlashSettingsInput = {
    flash_enabled: boolean;
    flash_ends_at?: string | null;
    flash_title?: string | null;
};

export interface StoreCollection {
    id: string;
    created_at: string;
    updated_at: string;
    name: string;
    title: string;
    subtitle: string | null;
    cta_text: string | null;
    image_url: string | null;
    is_active: boolean;
    sort_order: number;
    product_ids?: string[];
    product_count?: number;
}

export type StoreCollectionInput = {
    name: string;
    title: string;
    subtitle?: string | null;
    cta_text?: string | null;
    image_url?: string | null;
    is_active?: boolean;
    sort_order?: number;
};
