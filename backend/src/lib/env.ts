export function getFrontendUrl(): string {
  const url = process.env.FRONTEND_URL?.trim();
  if (url) return url.replace(/\/$/, '');
  return 'http://localhost:5173';
}
