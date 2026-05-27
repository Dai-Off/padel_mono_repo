/** Handler de «atrás» interno (subpantallas dentro de un overlay). Devuelve true si consumió el evento. */
export type OverlayNestedBackHandler = () => boolean;

let nestedBackHandler: OverlayNestedBackHandler | null = null;

export function registerOverlayNestedBack(handler: OverlayNestedBackHandler | null) {
  nestedBackHandler = handler;
}

export function consumeOverlayNestedBack(): boolean {
  return nestedBackHandler?.() ?? false;
}
