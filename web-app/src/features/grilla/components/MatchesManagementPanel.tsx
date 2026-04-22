import React, { useState, useEffect, useCallback } from 'react';
import {
    X,
    Calendar,
    Users,
    Settings,
    Filter,
    ChevronLeft,
    ChevronRight,
    Plus,
    MoreVertical,
    Trash2,
    Pencil,
    LayoutGrid,
} from 'lucide-react';
import { apiFetchWithAuth } from '../../../services/api';
import { CreateMatchModal } from './CreateMatchModal';
import { PlayerSearch } from './ReservationModal';

interface MatchesManagementPanelProps {
    clubId: string | null;
    dateStr: string;
    onRefreshGrid: () => void;
    onEditBooking?: (bookingId: string) => void;
    onGoToGrid?: () => void;
}

export const MatchesManagementPanel: React.FC<MatchesManagementPanelProps> = ({ clubId, dateStr, onRefreshGrid, onEditBooking, onGoToGrid }) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
    // State for the mini player selection modal and remove modal
    const [addingToSlot, setAddingToSlot] = useState<{ matchId: string, team: string, index: number, bookingId: string } | null>(null);
    const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
    const [menuAnchor, setMenuAnchor] = useState<{ bottom: boolean; top: number; left: number }>({ bottom: false, top: 0, left: 0 });
    const [removingFromMatch, setRemovingFromMatch] = useState<any | null>(null);

    // Estado local de la fecha
    const [currentDate, setCurrentDate] = useState(() => new Date(dateStr + 'T12:00:00'));
    const [isCreateMatchOpen, setIsCreateMatchOpen] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState({
        type: '' as string,
        court: '' as string,
        payment: '' as string,
        timeFrom: '' as string,
        timeTo: '' as string,
    });

    useEffect(() => {
        setCurrentDate(new Date(dateStr + 'T12:00:00'));
    }, [dateStr]);

    const currentDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

    const fetchMatches = useCallback(async () => {
        if (!clubId) return;
        setLoading(true);
        try {
            const [matchesRes, bookingsRes] = await Promise.all([
                apiFetchWithAuth<any>(`/matches?active_only=true&expand=true`),
                apiFetchWithAuth<any>(`/bookings?date=${currentDateStr}&club_id=${clubId}`)
            ]);

            const allMatches: any[] = [];
            const processedBookingIds = new Set();

            // Index bookings by ID for enrichment
            const bookingsById = new Map<string, any>();
            if (bookingsRes.ok && bookingsRes.bookings) {
                for (const b of bookingsRes.bookings) {
                    bookingsById.set(b.id, b);
                }
            }

            if (matchesRes.ok && matchesRes.matches) {
                const filteredMatches = matchesRes.matches.filter((m: any) => {
                    const booking = Array.isArray(m.bookings) ? m.bookings[0] : m.bookings;
                    if (!booking || !booking.courts || !booking.start_at) return false;
                    const bClubId = booking.courts.club_id || booking.courts.clubs?.id;
                    if (bClubId !== clubId) return false;

                    const mDate = new Date(booking.start_at);
                    const mDateStr = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}-${String(mDate.getDate()).padStart(2, '0')}`;
                    return mDateStr === currentDateStr;
                });
                for (const m of filteredMatches) {
                    // When match_players is empty, derive players from booking_participants
                    if ((!m.match_players || m.match_players.length === 0)) {
                        const booking = Array.isArray(m.bookings) ? m.bookings[0] : m.bookings;
                        const fullBooking = booking?.id ? bookingsById.get(booking.id) : null;
                        if (fullBooking) {
                            const participants = fullBooking.booking_participants || [];
                            if (participants.length > 0) {
                                m.match_players = participants.map((p: any, i: number) => {
                                    const person = Array.isArray(p.players) ? p.players[0] : p.players;
                                    return {
                                        id: p.id,
                                        team: i % 2 === 0 ? 'A' : 'B',
                                        players: {
                                            id: person?.id,
                                            first_name: person?.first_name,
                                            last_name: person?.last_name,
                                            elo_rating: person?.elo_rating
                                        }
                                    };
                                });
                            } else if (fullBooking.players) {
                                const org = fullBooking.players;
                                m.match_players = [{
                                    id: fullBooking.organizer_player_id,
                                    team: 'A',
                                    players: { id: org.id, first_name: org.first_name, last_name: org.last_name, elo_rating: org.elo_rating }
                                }];
                            }
                        }
                    }
                    allMatches.push(m);
                    const booking = Array.isArray(m.bookings) ? m.bookings[0] : m.bookings;
                    if (booking?.id) processedBookingIds.add(booking.id);
                }
            }

            if (bookingsRes.ok && bookingsRes.bookings) {
                for (const b of bookingsRes.bookings) {
                    if (processedBookingIds.has(b.id)) continue;
                    // Mock a match structure for simple bookings
                    
                    // Transform booking participants into mock match players
                    const mockPlayers: any[] = [];
                    const participants = b.booking_participants || [];
                    if (participants.length > 0) {
                        for (let i = 0; i < participants.length; i++) {
                             const p = participants[i];
                             const person = Array.isArray(p.players) ? p.players[0] : p.players;
                             mockPlayers.push({
                                 id: p.id,
                                 team: i % 2 === 0 ? 'A' : 'B',
                                 players: {
                                      id: person?.id,
                                      first_name: person?.first_name,
                                      last_name: person?.last_name,
                                      elo_rating: person?.elo_rating
                                 }
                             });
                        }
                    } else if (b.players) {
                        const org = b.players;
                        mockPlayers.push({
                            id: b.organizer_player_id,
                            team: 'A',
                            players: {
                                id: org.id,
                                first_name: org.first_name,
                                last_name: org.last_name,
                                elo_rating: org.elo_rating
                            }
                        });
                    }

                    allMatches.push({
                         id: `mock-match-${b.id}`,
                         type: b.reservation_type || 'standard',
                         competitive: false,
                         elo_min: null,
                         elo_max: null,
                         bookings: b,
                         match_players: mockPlayers
                    });
                }
            }

            allMatches.sort((a: any, b: any) => {
                const b_a = Array.isArray(a.bookings) ? a.bookings[0] : a.bookings;
                const b_b = Array.isArray(b.bookings) ? b.bookings[0] : b.bookings;
                return new Date(b_a.start_at).getTime() - new Date(b_b.start_at).getTime();
            });

            setMatches(allMatches);

        } catch (err) {
            console.error('Error fetching matches:', err);
        } finally {
            setLoading(false);
        }
    }, [clubId, currentDateStr]);

    useEffect(() => {
        fetchMatches();
    }, [fetchMatches]);

    const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

    const courtNames = [...new Set(matches.map(m => {
        const b = Array.isArray(m.bookings) ? m.bookings[0] : m.bookings;
        return b?.courts?.name as string;
    }).filter(Boolean))].sort();

    const filteredMatches = matches.filter(m => {
        const booking = Array.isArray(m.bookings) ? m.bookings[0] : m.bookings;
        if (!booking) return true;

        if (filters.type) {
            const matchType = m.type === 'tournament_division' ? 'americano' : (m.competitive ? 'competitivo' : 'amistoso');
            if (matchType !== filters.type) return false;
        }

        if (filters.court) {
            const courtName = booking.courts?.name || '';
            if (courtName !== filters.court) return false;
        }

        if (filters.payment) {
            const totalPrice = booking.total_price_cents ? booking.total_price_cents / 100 : 0;
            const txs = booking.payment_transactions || [];
            const totalPaid = txs.reduce((acc: number, pt: any) => pt.status === 'succeeded' ? acc + (pt.amount_cents || 0) : acc, 0) / 100;
            const isPaid = totalPaid >= totalPrice && totalPrice > 0;
            if (filters.payment === 'paid' && !isPaid) return false;
            if (filters.payment === 'pending' && isPaid) return false;
        }

        if (filters.timeFrom) {
            const startTime = new Date(booking.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            if (startTime < filters.timeFrom) return false;
        }
        if (filters.timeTo) {
            const startTime = new Date(booking.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            if (startTime > filters.timeTo) return false;
        }

        return true;
    });

    const clearFilters = () => setFilters({ type: '', court: '', payment: '', timeFrom: '', timeTo: '' });

    const formatTime = (isoString: string) => {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const getDurationMin = (startIso: string, endIso: string) => {
        const start = new Date(startIso).getTime();
        const end = new Date(endIso).getTime();
        return Math.round((end - start) / 60000);
    };

    const handlePrevDay = () => setCurrentDate(prev => {
        const n = new Date(prev);
        n.setDate(n.getDate() - 1);
        return n;
    });

    const handleNextDay = () => setCurrentDate(prev => {
        const n = new Date(prev);
        n.setDate(n.getDate() + 1);
        return n;
    });

    const getDisplayDate = () => {
        const d = new Date();
        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        d.setDate(d.getDate() + 1);
        const tomorrowStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        
        if (currentDateStr === todayStr) return 'Hoy';
        if (currentDateStr === tomorrowStr) return 'Mañana';
        return currentDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    };

    // Render Player Avatar Block
    const renderPlayer = (mp: any, index: number, matchBookingId: string, team: string, matchId: string) => {
        if (!mp || !mp.players || (!mp.players.first_name && !mp.players.last_name && mp.players.elo_rating === null)) {
            return (
                <div key={`empty-${matchId}-${team}-${index}`} className="flex flex-col items-center">
                    <div
                        onClick={() => setAddingToSlot({ matchId, team, index, bookingId: matchBookingId })}
                        className="w-8 h-8 rounded-full bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-100 hover:text-blue-500 hover:border-blue-300 transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </div>
                </div>
            );
        }
        const p = mp.players;
        const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase();
        const elo = p.elo_rating ? p.elo_rating.toFixed(2) : '0.00';
        
        return (
            <div key={`player-${matchId}-${team}-${mp.id || index}`} className="relative flex flex-col items-center group cursor-pointer hover:-translate-y-0.5 transition-transform hover:z-50">
                <div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white shadow-sm flex items-center justify-center text-blue-700 text-[11px] font-bold overflow-hidden">
                    {initials || <Users className="w-4 h-4 opacity-50" />}
                </div>
                <div className="absolute -bottom-1.5 bg-[#f6ff00] text-gray-900 text-[8px] font-extrabold px-1 py-0 rounded shadow-sm border border-yellow-200">
                    {elo}
                </div>
                {/* Tooltip on hover */}
                <div className="absolute -top-8 z-50 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                    {p.first_name} {p.last_name}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-white max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b z-10 shrink-0">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-extrabold text-gray-900 tracking-tight">Partidos</h2>
                </div>
                <div className="flex items-center gap-2">

                    <div className="hidden sm:flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                        <button onClick={handlePrevDay} className="px-2 py-1.5 text-gray-400 hover:bg-gray-50 border-r border-gray-200 transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="px-4 py-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-700 min-w-[100px] justify-center">
                            {getDisplayDate()} <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                        <button onClick={handleNextDay} className="px-2 py-1.5 text-gray-400 hover:bg-gray-50 border-l border-gray-200 transition-colors">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                    {onGoToGrid && (
                        <button
                            onClick={onGoToGrid}
                            title="Ir a la grilla"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-[#006A6A] hover:border-[#006A6A] transition-colors shadow-sm"
                        >
                            <LayoutGrid className="w-4 h-4" />
                            <span className="hidden sm:inline text-xs font-semibold">Grilla</span>
                        </button>
                    )}
                    <button
                        onClick={() => setShowFilters(prev => !prev)}
                        className={`p-1.5 border rounded-lg transition-colors relative ${
                            showFilters || activeFilterCount > 0
                                ? 'border-[#006A6A] text-[#006A6A] bg-[#006A6A]/5'
                                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        <Filter className="w-4 h-4" />
                        {activeFilterCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#006A6A] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsCreateMatchOpen(true)}
                        className="px-3 py-1.5 bg-[#006A6A] hover:bg-[#005151] text-white text-xs font-semibold rounded-lg shadow-sm transition-colors border border-transparent whitespace-nowrap"
                    >
                        Crear Partido
                    </button>
                    <button className="p-1.5 border border-gray-200 text-[#005bc5] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Filter bar */}
            {showFilters && (
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-end gap-2 shrink-0">
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Tipo</label>
                        <select
                            value={filters.type}
                            onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
                            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#006A6A] min-w-[110px]"
                        >
                            <option value="">Todos</option>
                            <option value="amistoso">Amistoso</option>
                            <option value="competitivo">Competitivo</option>
                            <option value="americano">Americano</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Pista</label>
                        <select
                            value={filters.court}
                            onChange={e => setFilters(f => ({ ...f, court: e.target.value }))}
                            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#006A6A] min-w-[110px]"
                        >
                            <option value="">Todas</option>
                            {courtNames.map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Pago</label>
                        <select
                            value={filters.payment}
                            onChange={e => setFilters(f => ({ ...f, payment: e.target.value }))}
                            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#006A6A] min-w-[110px]"
                        >
                            <option value="">Todos</option>
                            <option value="paid">Completado</option>
                            <option value="pending">Pendiente</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Hora desde</label>
                        <input
                            type="time"
                            value={filters.timeFrom}
                            onChange={e => setFilters(f => ({ ...f, timeFrom: e.target.value }))}
                            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#006A6A] min-w-[85px]"
                        />
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Hora hasta</label>
                        <input
                            type="time"
                            value={filters.timeTo}
                            onChange={e => setFilters(f => ({ ...f, timeTo: e.target.value }))}
                            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-[#006A6A] min-w-[85px]"
                        />
                    </div>
                    {activeFilterCount > 0 && (
                        <button
                            onClick={clearFilters}
                            className="px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors flex items-center gap-1 self-end"
                        >
                            <X className="w-3 h-3" />
                            Limpiar
                        </button>
                    )}
                    <span className="text-[10px] text-gray-400 self-end ml-auto">
                        {filteredMatches.length} de {matches.length}
                    </span>
                </div>
            )}

            {/* Content Table */}
            <div className="flex-1 overflow-auto bg-white">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white z-10 whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                        <tr>
                            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide border-b">Hora</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide border-b hidden xl:table-cell">Deporte</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide border-b">Duración</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide border-b hidden lg:table-cell">Nivel</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide border-b">Jugadores</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide border-b">Tipo</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide border-b">Recaudado</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide border-b hidden xl:table-cell">Club</th>
                            <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide border-b">Pista</th>
                            <th className="px-3 py-2.5 border-b"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={10} className="px-4 py-12 text-center">
                                    <div className="w-6 h-6 mx-auto border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                                </td>
                            </tr>
                        ) : filteredMatches.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="px-4 py-12 text-center text-gray-400 text-xs font-medium">
                                    {matches.length > 0 && activeFilterCount > 0
                                        ? 'No hay partidos que coincidan con los filtros aplicados.'
                                        : 'No hay partidos organizados para este día.'}
                                </td>
                            </tr>
                        ) : (
                            filteredMatches.map((match) => {
                                const booking = Array.isArray(match.bookings) ? match.bookings[0] : match.bookings;
                                const court = booking?.courts;
                                const club = court?.clubs;
                                const startAt = booking?.start_at;
                                const endAt = booking?.end_at;
                                const totalPrice = booking?.total_price_cents ? booking.total_price_cents / 100 : 0;
                                const paymentTransactions = booking?.payment_transactions || [];
                                const totalPaid = paymentTransactions.reduce((acc: number, pt: any) => pt.status === 'succeeded' ? acc + (pt.amount_cents || 0) : acc, 0) / 100;
                                
                                const players = match.match_players || [];
                                const teamA = players.filter((p: any) => p.team === 'A');
                                const teamB = players.filter((p: any) => p.team === 'B');

                                return (
                                    <tr key={match.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className="text-xs font-bold text-gray-800">{formatTime(startAt)}</span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap hidden xl:table-cell">
                                            <span className="text-[11px] font-medium text-gray-600">Pádel</span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className="text-[11px] font-medium text-gray-600">{getDurationMin(startAt, endAt)} min</span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap hidden lg:table-cell">
                                            <span className="text-[11px] font-medium text-gray-600">
                                                {match.elo_min?.toFixed(2) || '0.00'} - {match.elo_max?.toFixed(2) || '10.00'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center -space-x-2">
                                                    {renderPlayer(teamA[0], 1, booking?.id, 'A', match.id)}
                                                    {renderPlayer(teamA[1], 2, booking?.id, 'A', match.id)}
                                                </div>
                                                <span className="text-[9px] font-bold tracking-wider text-gray-300">VS</span>
                                                <div className="flex items-center -space-x-2">
                                                    {renderPlayer(teamB[0], 3, booking?.id, 'B', match.id)}
                                                    {renderPlayer(teamB[1], 4, booking?.id, 'B', match.id)}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold leading-tight bg-blue-100/60 text-blue-700 border border-blue-200/50">
                                                {match.type === 'tournament_division' ? 'Americano' : (match.competitive ? 'Competitivo' : 'Amistoso')}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-bold text-gray-800">
                                                    €{totalPaid.toFixed(2)} <span className="text-gray-400 font-medium">/ €{totalPrice.toFixed(2)}</span>
                                                </span>
                                                {totalPaid >= totalPrice && totalPrice > 0 ? (
                                                    <span className="text-[9px] font-bold text-green-600 uppercase tracking-wide">Completado</span>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-orange-500 uppercase tracking-wide">Pendiente</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap hidden xl:table-cell">
                                            <span className="text-[11px] font-medium text-gray-600">{club?.name || 'Sede Central'}</span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap">
                                            <span className="text-[11px] font-medium text-gray-600 uppercase tracking-wide">{court?.name || 'Pista'}</span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-right text-[11px] font-medium">
                                            <div className="relative inline-block text-left">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (menuOpenFor === match.id) {
                                                            setMenuOpenFor(null);
                                                            return;
                                                        }
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        const spaceBelow = window.innerHeight - rect.bottom;
                                                        setMenuAnchor({ bottom: spaceBelow < 120, top: rect.bottom, left: rect.left });
                                                        setMenuOpenFor(match.id);
                                                    }}
                                                    className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                                                >
                                                    <MoreVertical size={16} />
                                                </button>
                                                {menuOpenFor === match.id && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpenFor(null); }} />
                                                        <div className={`absolute right-0 w-44 bg-white border border-gray-200 shadow-xl rounded-lg z-50 overflow-hidden text-left ${menuAnchor.bottom ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setMenuOpenFor(null);
                                                                    const bookingId = booking?.id;
                                                                    if (bookingId && onEditBooking) {
                                                                        onEditBooking(bookingId);
                                                                    }
                                                                }}
                                                                className="w-full text-left px-3 py-2.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                                Editar partido
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setMenuOpenFor(null);
                                                                    setRemovingFromMatch(match);
                                                                }}
                                                                className="w-full text-left px-3 py-2.5 text-xs text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 font-medium border-t border-gray-100"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                Remover jugador
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add Player to Slot Mini Modal */}
            {addingToSlot && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !loading && setAddingToSlot(null)}>
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        {/* Overlay de carga interno */}
                        {loading && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center z-[250] rounded-xl">
                                <div className="w-8 h-8 border-4 border-[#006A6A] border-t-transparent rounded-full animate-spin"></div>
                                <span className="mt-3 text-sm font-bold text-[#006A6A]">Asignando jugador...</span>
                            </div>
                        )}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 leading-tight">Agregar Jugador</h3>
                                <p className="text-[11px] text-gray-500 mt-0.5">Selecciona el participante para este lugar</p>
                            </div>
                            <button onClick={() => !loading && setAddingToSlot(null)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <PlayerSearch
                            label="Buscar Jugador"
                            placeholder="Nombre, Apellido o Email..."
                            selectedPlayer={null}
                            onSelect={async (player) => {
                                if (player) {
                                    setLoading(true);
                                    try {
                                        await apiFetchWithAuth(`/matches/${addingToSlot.matchId}/admin-add-player`, {
                                            method: 'POST',
                                            body: JSON.stringify({
                                                player_id: player.id,
                                                team: addingToSlot.team,
                                                slot_index: addingToSlot.index,
                                                booking_id: addingToSlot.bookingId
                                            })
                                        });
                                        // Refrescar lista
                                        await fetchMatches();
                                    } catch (err) {
                                        console.error('Error adding player:', err);
                                        alert('Error al agregar el jugador.');
                                    } finally {
                                        setAddingToSlot(null);
                                        setLoading(false);
                                    }
                                }
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Remove Player Modal */}
            {removingFromMatch && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !loading && setRemovingFromMatch(null)}>
                    <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        {loading && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center z-[250] rounded-xl">
                                <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="mt-3 text-sm font-bold text-red-500">Removiendo...</span>
                            </div>
                        )}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 leading-tight">Remover Jugador</h3>
                                <p className="text-[11px] text-gray-500 mt-0.5">Elige a quién quitar de este partido</p>
                            </div>
                            <button onClick={() => !loading && setRemovingFromMatch(null)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {removingFromMatch.match_players?.filter((p: any) => p && p.players && (p.players.first_name || p.players.last_name)).length === 0 ? (
                                <p className="text-sm text-gray-500 text-center py-4">No hay jugadores anotados.</p>
                            ) : (
                                removingFromMatch.match_players?.map((mp: any) => {
                                    if (!mp || !mp.players || (!mp.players.first_name && !mp.players.last_name)) return null;
                                    const player = mp.players;
                                    return (
                                        <div key={mp.id || player.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors group">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-sm text-gray-800">{player.first_name} {player.last_name}</span>
                                                {player.elo_rating !== null && <span className="text-[10px] text-gray-500">ELO: {player.elo_rating}</span>}
                                            </div>
                                            <button 
                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                                                title="Remover"
                                                onClick={async () => {
                                                    setLoading(true);
                                                    try {
                                                        const matchBooking = Array.isArray(removingFromMatch.bookings) ? removingFromMatch.bookings[0] : removingFromMatch.bookings;
                                                        await apiFetchWithAuth(`/matches/${removingFromMatch.id}/admin-remove-player`, {
                                                            method: 'POST',
                                                            body: JSON.stringify({
                                                                player_id: player.id,
                                                                booking_id: matchBooking?.id
                                                            })
                                                        });
                                                        await fetchMatches();
                                                        setRemovingFromMatch(null);
                                                    } catch(err) {
                                                        console.error(err);
                                                        alert('Error al remover jugador');
                                                    } finally {
                                                        setLoading(false);
                                                    }
                                                }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {isCreateMatchOpen && (
                <CreateMatchModal
                    clubId={clubId}
                    isOpen={isCreateMatchOpen}
                    onClose={() => {
                        setIsCreateMatchOpen(false);
                        fetchMatches();
                        onRefreshGrid();
                    }}
                />
            )}
        </div>
    );
};
