import type { StoreStockFilter } from '../components/tienda/StoreStatsCards';

const STOCK_FILTERS: StoreStockFilter[] = ['published', 'low_stock', 'out_of_stock', 'hidden'];

export function parseTiendaStockParam(value: string | null): StoreStockFilter | null {
    if (value && STOCK_FILTERS.includes(value as StoreStockFilter)) {
        return value as StoreStockFilter;
    }
    return null;
}

export function tiendaStockFilterPath(filter: StoreStockFilter): string {
    return `/tienda?stock=${filter}`;
}

export function tiendaFlashModalPath(): string {
    return '/tienda?flash=1';
}
