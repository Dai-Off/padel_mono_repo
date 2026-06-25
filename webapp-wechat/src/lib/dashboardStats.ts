import type { Player, StoreCollection, StoreFlashSettings, StoreProduct } from '../types/api';
import { tiendaFlashModalPath, tiendaStockFilterPath } from './tiendaNav';

export type DashboardAlert = {
    id: string;
    tone: 'warning' | 'danger' | 'info';
    message: string;
    to: string;
};

export type DashboardSnapshot = {
    playersTotal: number;
    playersActive: number;
    playersBlocked: number;
    clubsCount: number;
    productsTotal: number;
    productsActive: number;
    productsLowStock: number;
    productsOutOfStock: number;
    productsFeatured: number;
    productsFlashDeal: number;
    collectionsTotal: number;
    collectionsActive: number;
    flashActive: boolean;
    flashEndsAt: string | null;
    flashTitle: string | null;
    recentProducts: StoreProduct[];
    alerts: DashboardAlert[];
    sectionStats: Record<string, string>;
};

function isFlashCampaignLive(settings: StoreFlashSettings): boolean {
    if (!settings.flash_enabled || !settings.flash_ends_at) return false;
    return new Date(settings.flash_ends_at).getTime() > Date.now();
}

function flashHoursRemaining(endsAt: string): number {
    return Math.max(0, (new Date(endsAt).getTime() - Date.now()) / (1000 * 60 * 60));
}

export function buildDashboardSnapshot(
    players: Player[],
    clubsCount: number,
    products: StoreProduct[],
    collections: StoreCollection[],
    flash: StoreFlashSettings,
): DashboardSnapshot {
    const playersActive = players.filter((p) => p.status === 'active').length;
    const playersBlocked = players.filter((p) => p.status === 'blocked').length;

    const productsActive = products.filter((p) => p.is_active);
    const productsLowStock = productsActive.filter(
        (p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold,
    ).length;
    const productsOutOfStock = productsActive.filter((p) => p.stock_quantity <= 0).length;
    const productsFeatured = productsActive.filter((p) => p.is_featured).length;
    const productsFlashDeal = productsActive.filter((p) => p.is_flash_deal).length;

    const collectionsActive = collections.filter((c) => c.is_active).length;
    const flashActive = isFlashCampaignLive(flash);

    const alerts: DashboardAlert[] = [];

    if (productsOutOfStock > 0) {
        alerts.push({
            id: 'out-of-stock',
            tone: 'danger',
            message:
                productsOutOfStock === 1
                    ? '1 producto publicado está agotado'
                    : `${productsOutOfStock} productos publicados están agotados`,
            to: tiendaStockFilterPath('out_of_stock'),
        });
    }

    if (productsLowStock > 0) {
        alerts.push({
            id: 'low-stock',
            tone: 'warning',
            message:
                productsLowStock === 1
                    ? '1 producto con stock crítico'
                    : `${productsLowStock} productos con stock crítico`,
            to: tiendaStockFilterPath('low_stock'),
        });
    }

    if (flash.flash_enabled && flash.flash_ends_at) {
        const endsMs = new Date(flash.flash_ends_at).getTime();
        if (endsMs <= Date.now()) {
            alerts.push({
                id: 'flash-expired',
                tone: 'warning',
                message: 'La campaña flash expiró pero sigue marcada como activa',
                to: tiendaFlashModalPath(),
            });
        } else if (flashHoursRemaining(flash.flash_ends_at) <= 24) {
            alerts.push({
                id: 'flash-ending',
                tone: 'info',
                message: `Ofertas flash activas — termina en menos de 24 h`,
                to: tiendaFlashModalPath(),
            });
        }
    }

    if (playersBlocked > 0) {
        alerts.push({
            id: 'blocked-players',
            tone: 'info',
            message:
                playersBlocked === 1
                    ? '1 jugador bloqueado'
                    : `${playersBlocked} jugadores bloqueados`,
            to: '/usuarios',
        });
    }

    const inactiveCollections = collections.filter((c) => !c.is_active).length;
    if (inactiveCollections > 0 && collections.length > 0) {
        alerts.push({
            id: 'collections-inactive',
            tone: 'info',
            message:
                inactiveCollections === 1
                    ? '1 colección oculta en la app'
                    : `${inactiveCollections} colecciones ocultas en la app`,
            to: '/tienda/colecciones',
        });
    }

    const recentProducts = [...products]
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, 5);

    const sectionStats: Record<string, string> = {
        usuarios: `${playersActive} activos`,
        clubes: `${clubsCount} ${clubsCount === 1 ? 'club' : 'clubes'}`,
        tienda: `${productsActive.length} publicados`,
        ventas: 'Vista previa',
        cursos: 'Próximamente',
        'codigo-promocional': 'Próximamente',
    };

    return {
        playersTotal: players.length,
        playersActive,
        playersBlocked,
        clubsCount,
        productsTotal: products.length,
        productsActive: productsActive.length,
        productsLowStock,
        productsOutOfStock,
        productsFeatured,
        productsFlashDeal,
        collectionsTotal: collections.length,
        collectionsActive,
        flashActive,
        flashEndsAt: flash.flash_ends_at,
        flashTitle: flash.flash_title,
        recentProducts,
        alerts,
        sectionStats,
    };
}
