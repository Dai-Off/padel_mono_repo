import { useState } from 'react';
import { AlertTriangle, ImageIcon } from 'lucide-react';
import type { StoreProduct } from '../../types/api';

type ProductThumbProps = {
    product: StoreProduct;
    size?: 'sm' | 'md';
    warnOnMissing?: boolean;
};

export function ProductThumb({ product, size = 'sm', warnOnMissing = true }: ProductThumbProps) {
    const [broken, setBroken] = useState(false);
    const dim = size === 'md' ? 'h-11 w-11 rounded-xl' : 'h-9 w-9 rounded-lg';
    const iconSize = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';

    if (!product.image_url || broken) {
        return (
            <div
                className={`flex shrink-0 items-center justify-center bg-gradient-to-br ring-1 ${
                    warnOnMissing
                        ? 'from-red-500/20 to-red-500/5 ring-red-500/30'
                        : 'from-[rgba(241,143,52,0.18)] to-[rgba(241,143,52,0.05)] ring-auth-border'
                } ${dim}`}
                title={warnOnMissing ? 'Sin imagen válida' : undefined}
            >
                {warnOnMissing ? (
                    <AlertTriangle className={`${iconSize} text-red-400`} />
                ) : (
                    <ImageIcon className={`${iconSize} text-auth-accent`} />
                )}
            </div>
        );
    }

    return (
        <img
            src={product.image_url}
            alt=""
            className={`shrink-0 object-cover ring-1 ring-auth-border ${dim}`}
            onError={() => setBroken(true)}
        />
    );
}
