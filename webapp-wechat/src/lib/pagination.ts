export const DEFAULT_PAGE_SIZE = 8;

export function paginate<T>(items: T[], page: number, pageSize = DEFAULT_PAGE_SIZE): T[] {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

export function totalPages(count: number, pageSize = DEFAULT_PAGE_SIZE): number {
    if (count <= 0) return 1;
    return Math.ceil(count / pageSize);
}
