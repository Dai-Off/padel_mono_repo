/** Contenedor responsive compartido — usa casi todo el ancho en pantallas grandes. */
export const PAGE_MAX_WIDTH = 'max-w-[1440px]';

export const pagePaddingX =
  'px-[max(1rem,env(safe-area-inset-left))] sm:px-6 lg:px-8 xl:px-10 2xl:px-12 pr-[max(1rem,env(safe-area-inset-right))]';

export const pageShell = `mx-auto w-full ${PAGE_MAX_WIDTH} ${pagePaddingX}`;

export const FIXED_LIST_PATHS = new Set(['/usuarios', '/clubes']);

export function isFixedListPath(pathname: string): boolean {
    return FIXED_LIST_PATHS.has(pathname);
}

export const pageMainY = 'py-5 sm:py-6 md:py-8 lg:py-10';
