import { apiFetchWithAuth, apiUploadWithAuth } from './api';
import type { StoreProduct, StoreProductInput, StoreStockAdjustInput, StoreCollection, StoreCollectionInput, StoreFlashSettings, StoreFlashSettingsInput } from '../types/api';

type ProductsResponse = { ok: boolean; products: StoreProduct[] };
type ProductResponse = { ok: boolean; product: StoreProduct };
type UploadResponse = { ok: boolean; url: string };

export async function listStoreProducts(options?: {
    q?: string;
    category?: string;
    includeInactive?: boolean;
}): Promise<StoreProduct[]> {
    const params = new URLSearchParams();
    if (options?.q) params.set('q', options.q);
    if (options?.category) params.set('category', options.category);
    if (options?.includeInactive) params.set('include_inactive', 'true');
    const query = params.toString();
    const data = await apiFetchWithAuth<ProductsResponse>(
        `/mobile-admin/store/products${query ? `?${query}` : ''}`
    );
    return data.products ?? [];
}

export async function createStoreProduct(input: StoreProductInput): Promise<StoreProduct> {
    const data = await apiFetchWithAuth<ProductResponse>('/mobile-admin/store/products', {
        method: 'POST',
        body: JSON.stringify(input),
    });
    return data.product;
}

export async function updateStoreProduct(id: string, input: Partial<StoreProductInput>): Promise<StoreProduct> {
    const data = await apiFetchWithAuth<ProductResponse>(`/mobile-admin/store/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
    });
    return data.product;
}

export async function deleteStoreProduct(id: string): Promise<void> {
    await apiFetchWithAuth<{ ok: boolean }>(`/mobile-admin/store/products/${id}`, {
        method: 'DELETE',
    });
}

export async function adjustStoreProductStock(
    id: string,
    input: StoreStockAdjustInput
): Promise<StoreProduct> {
    const data = await apiFetchWithAuth<ProductResponse>(`/mobile-admin/store/products/${id}/stock`, {
        method: 'POST',
        body: JSON.stringify(input),
    });
    return data.product;
}

export async function uploadStoreProductImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);
    const data = await apiUploadWithAuth<UploadResponse>('/mobile-admin/store/upload-image', formData);
    return data.url;
}

export async function uploadStoreCollectionImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);
    const data = await apiUploadWithAuth<UploadResponse>(
        '/mobile-admin/store/upload-image?folder=collections',
        formData
    );
    return data.url;
}

export async function getStoreFlashSettings(): Promise<StoreFlashSettings> {
    const data = await apiFetchWithAuth<{ ok: boolean; settings: StoreFlashSettings }>(
        '/mobile-admin/store/flash-settings'
    );
    return data.settings;
}

export async function updateStoreFlashSettings(
    input: StoreFlashSettingsInput
): Promise<StoreFlashSettings> {
    const data = await apiFetchWithAuth<{ ok: boolean; settings: StoreFlashSettings }>(
        '/mobile-admin/store/flash-settings',
        { method: 'PUT', body: JSON.stringify(input) }
    );
    return data.settings;
}

export async function listStoreCollections(options?: {
    includeInactive?: boolean;
}): Promise<StoreCollection[]> {
    const params = new URLSearchParams();
    if (options?.includeInactive) params.set('include_inactive', 'true');
    const query = params.toString();
    const data = await apiFetchWithAuth<{ ok: boolean; collections: StoreCollection[] }>(
        `/mobile-admin/store/collections${query ? `?${query}` : ''}`
    );
    return data.collections ?? [];
}

export async function createStoreCollection(input: StoreCollectionInput): Promise<StoreCollection> {
    const data = await apiFetchWithAuth<{ ok: boolean; collection: StoreCollection }>(
        '/mobile-admin/store/collections',
        { method: 'POST', body: JSON.stringify(input) }
    );
    return data.collection;
}

export async function updateStoreCollection(
    id: string,
    input: Partial<StoreCollectionInput>
): Promise<StoreCollection> {
    const data = await apiFetchWithAuth<{ ok: boolean; collection: StoreCollection }>(
        `/mobile-admin/store/collections/${id}`,
        { method: 'PUT', body: JSON.stringify(input) }
    );
    return data.collection;
}

export async function deleteStoreCollection(id: string): Promise<void> {
    await apiFetchWithAuth<{ ok: boolean }>(`/mobile-admin/store/collections/${id}`, {
        method: 'DELETE',
    });
}

export async function setStoreCollectionProducts(
    id: string,
    productIds: string[]
): Promise<string[]> {
    const data = await apiFetchWithAuth<{ ok: boolean; product_ids: string[] }>(
        `/mobile-admin/store/collections/${id}/products`,
        { method: 'PUT', body: JSON.stringify({ product_ids: productIds }) }
    );
    return data.product_ids ?? [];
}
