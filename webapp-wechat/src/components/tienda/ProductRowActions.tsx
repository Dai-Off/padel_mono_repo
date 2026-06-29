import { Boxes, Pencil, Power, Trash2 } from 'lucide-react';
import { RowActionsMenu } from '../ui/RowActionsMenu';
import type { StoreProduct } from '../../types/api';

const PRODUCT_ACTIONS = [
    { id: 'edit', label: 'Editar', icon: Pencil },
    { id: 'stock', label: 'Ajustar inventario', icon: Boxes },
    { id: 'toggle', label: 'Mostrar / ocultar', icon: Power },
    { id: 'delete', label: 'Eliminar producto', icon: Trash2, tone: 'danger' as const },
];

type ProductRowActionsProps = {
    product: StoreProduct;
    onAction: (actionId: string, product: StoreProduct) => void;
};

export function ProductRowActions({ product, onAction }: ProductRowActionsProps) {
    return (
        <RowActionsMenu
            ariaLabel={`Acciones para ${product.name}`}
            actions={PRODUCT_ACTIONS}
            onSelect={(actionId) => onAction(actionId, product)}
        />
    );
}
