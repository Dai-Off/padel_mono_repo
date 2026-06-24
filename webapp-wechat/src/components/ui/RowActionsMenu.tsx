import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

export type RowAction = {
    id: string;
    label: string;
    icon: LucideIcon;
    tone?: 'default' | 'danger';
};

type RowActionsMenuProps = {
    actions: RowAction[];
    ariaLabel: string;
};

export function RowActionsMenu({ actions, ariaLabel }: RowActionsMenuProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const handleSelect = (action: RowAction) => {
        setOpen(false);
        toast.info('Próximamente', {
            description: `«${action.label}» estará disponible en una próxima versión.`,
        });
    };

    return (
        <div ref={rootRef} className="relative flex justify-end">
            <button
                type="button"
                aria-label={ariaLabel}
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpen((prev) => !prev)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-auth-muted transition hover:border-auth-border hover:bg-[rgba(255,255,255,0.06)] hover:text-auth-text"
            >
                <MoreHorizontal className="h-4 w-4" />
            </button>

            {open ? (
                <div
                    role="menu"
                    className="absolute right-0 top-full z-30 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-auth-border bg-[#1A1A1A] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
                >
                    {actions.map((action) => {
                        const Icon = action.icon;
                        const isDanger = action.tone === 'danger';
                        return (
                            <button
                                key={action.id}
                                type="button"
                                role="menuitem"
                                onClick={() => handleSelect(action)}
                                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-[rgba(255,255,255,0.06)] ${
                                    isDanger ? 'text-auth-error' : 'text-auth-text'
                                }`}
                            >
                                <Icon className={`h-4 w-4 shrink-0 ${isDanger ? 'text-auth-error' : 'text-auth-muted'}`} />
                                {action.label}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
