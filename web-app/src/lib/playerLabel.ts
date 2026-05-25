import type { Player } from '../types/api';

export function formatPlayerLabel(p: Pick<Player, 'username' | 'first_name' | 'last_name'>): string {
  const un = p.username?.trim();
  if (un) return `@${un}`;
  const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  return name || 'Jugador';
}

export function formatPlayerSubline(p: Pick<Player, 'username' | 'phone' | 'email' | 'elo_rating'>): string {
  if (p.username?.trim()) return `@${p.username.trim()}`;
  if (p.phone?.trim()) {
    return `${p.phone} · Elo ${Math.round(Number(p.elo_rating) || 0)}`;
  }
  return p.email?.trim() || '';
}
