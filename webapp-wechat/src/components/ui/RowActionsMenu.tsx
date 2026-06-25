import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
    onSelect?: (actionId: string) => void;
};

type MenuPosition = { top: number; left: number };

const MENU_WIDTH = 192;
const MENU_ITEM_HEIGHT = 40;

function computeMenuPosition(button: HTMLButtonElement, itemCount: number): MenuPosition {
    const rect = button.getBoundingClientRect();
    const menuHeight = itemCount * MENU_ITEM_HEIGHT + 8;
    const gap = 6;

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - 8) {
        top = rect.top - menuHeight - gap;
    }
    top = Math.max(8, Math.min(top, window.innerHeight - menuHeight - 8));

    let left = rect.right - MENU_WIDTH;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));

    return { top, left };
}

export function RowActionsMenu({ actions, ariaLabel, onSelect }: RowActionsMenuProps) {
    const [open, setOpen] = useState(false);
    const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const updatePosition = () => {
        if (!buttonRef.current) return;
        setMenuPos(computeMenuPosition(buttonRef.current, actions.length));
    };

    useLayoutEffect(() => {
        if (!open) {
            setMenuPos(null);
            return;
        }
        updatePosition();
    }, [open, actions.length]);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        const onReposition = () => updatePosition();

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);

        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
        };
    }, [open, actions.length]);

    const handleSelect = (action: RowAction) => {
        setOpen(false);
        if (onSelect) {
            onSelect(action.id);
            return;
        }
        toast.info('Próximamente', {
            description: `«${action.label}» estará disponible en una próxima versión.`,
        });
    };

    const menu =
        open && menuPos
            ? createPortal(
                  <div
                      ref={menuRef}
                      role="menu"
                      style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
                      className="fixed z-[100] overflow-hidden rounded-xl border border-auth-border bg-[#1A1A1A] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
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
                                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition hover:bg-[rgba(255,255,255,0.06)] ${
                                      isDanger ? 'text-auth-error' : 'text-auth-text'
                                  }`}
                              >
                                  <Icon
                                      className={`h-4 w-4 shrink-0 ${isDanger ? 'text-auth-error' : 'text-auth-muted'}`}
                                  />
                                  {action.label}
                              </button>
                          );
                      })}
                  </div>,
                  document.body
              )
            : null;

    return (
        <div ref={rootRef} className="relative flex justify-end">
            <button
                ref={buttonRef}
                type="button"
                aria-label={ariaLabel}
                aria-expanded={open}
                aria-haspopup="menu"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((prev) => !prev);
                }}
                className={[
                    'inline-flex h-8 w-8 items-center justify-center rounded-lg border text-auth-muted transition',
                    open
                        ? 'border-auth-accent/40 bg-auth-accent/10 text-auth-accent'
                        : 'border-transparent hover:border-auth-border hover:bg-[rgba(255,255,255,0.06)] hover:text-auth-text',
                ].join(' ')}
            >
                <MoreHorizontal className="h-4 w-4" />
            </button>
            {menu}
        </div>
    );
}
