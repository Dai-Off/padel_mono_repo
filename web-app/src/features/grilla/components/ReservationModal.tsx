import React, { useEffect, useState, useRef, useMemo } from 'react';
import type { Reservation } from '../types';
import {
    X,
    Search,
    Trash2,
    AlertTriangle,
    UserPlus,
} from 'lucide-react';
import { useVisualViewportFix } from '../hooks/useVisualViewportFix';
import { playerService } from '../../../services/player';
import { apiFetchWithAuth } from '../../../services/api';
import { reservationTypePricesService } from '../../../services/reservationTypePrices';
import type { Player } from '../../../types/api';

interface ReservationModalProps {
    clubId?: string | null;
    isOpen: boolean;
    onClose: () => void;
    reservation: Reservation | null;
    onSave?: (bookingData: any) => Promise<void>;
    editingBookingData?: any | null;
    onUpdate?: (bookingId: string, data: any) => Promise<void>;
    onDelete?: (bookingId: string, sendEmail: boolean) => Promise<void>;
    onMarkPaid?: (bookingId: string) => Promise<void>;
}

// Helper: Player Search Component
const PlayerSearch: React.FC<{
    label: string;
    placeholder: string;
    onSelect: (player: Player | null) => void;
    selectedPlayer: Player | null;
    required?: boolean;
}> = ({ label, placeholder, onSelect, selectedPlayer, required }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Player[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Alta de jugador state
    const [altaOpen, setAltaOpen] = useState(false);
    const [altaSubmitting, setAltaSubmitting] = useState(false);
    const [altaError, setAltaError] = useState('');
    const [altaForm, setAltaForm] = useState({ first_name: '', last_name: '', phone: '', email: '' });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            setIsSearching(true);
            try {
                const players = await playerService.getAll(query);
                setResults(players);
                setShowResults(true);
            } catch (err) {
                console.error('Error searching players:', err);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [query]);

    const handleAltaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const { first_name, last_name, phone, email } = altaForm;
        if (!first_name.trim() || !last_name.trim() || !phone.trim() || !email.trim()) {
            setAltaError('Todos los campos son obligatorios.');
            return;
        }
        setAltaSubmitting(true);
        setAltaError('');
        try {
            const newPlayer = await playerService.createManual({ first_name: first_name.trim(), last_name: last_name.trim(), phone: phone.trim(), email: email.trim() });
            onSelect(newPlayer);
            setAltaOpen(false);
            setAltaForm({ first_name: '', last_name: '', phone: '', email: '' });
        } catch (err: unknown) {
            const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Error al dar de alta el jugador.';
            setAltaError(msg);
        } finally {
            setAltaSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col gap-1.5" ref={containerRef}>
            <label className="text-sm font-bold text-gray-700 flex items-center gap-1">
                {label}{required && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
                {selectedPlayer ? (
                    <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                                {selectedPlayer.first_name[0]}{selectedPlayer.last_name[0]}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900">{selectedPlayer.first_name} {selectedPlayer.last_name}</p>
                                <p className="text-[10px] text-gray-500">{selectedPlayer.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => { onSelect(null); setQuery(''); }}
                            className="p-1 hover:bg-blue-100 rounded-full text-blue-600"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex gap-1.5">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={placeholder}
                                    className="w-full p-2.5 pr-10 bg-white border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-[#006A6A] focus:border-transparent outline-none transition-all"
                                    onFocus={() => query.trim() && setShowResults(true)}
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                                    onClick={async () => {
                                        setIsSearching(true);
                                        try {
                                            const players = await playerService.getAll(query.trim() || undefined);
                                            setResults(players);
                                            setShowResults(true);
                                        } catch (err) {
                                            console.error('Error fetching players:', err);
                                        } finally {
                                            setIsSearching(false);
                                        }
                                    }}
                                >
                                    <Search size={18} className="text-[#006A6A] hover:text-[#005151]" />
                                </button>
                            </div>
                            <button
                                type="button"
                                title="Dar de alta jugador"
                                onClick={() => { setAltaOpen(true); setAltaError(''); }}
                                className="flex items-center justify-center w-10 h-10 rounded-md bg-[#00726b] hover:bg-[#005a4f] text-white transition-colors shrink-0"
                            >
                                <UserPlus size={16} />
                            </button>
                        </div>
                        {showResults && results.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto overflow-x-hidden">
                                {results.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => {
                                            onSelect(p);
                                            setShowResults(false);
                                        }}
                                        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                                            {p.first_name[0]}{p.last_name[0]}
                                        </div>
                                        <div className="truncate">
                                            <p className="text-sm font-bold text-gray-900 truncate">{p.first_name} {p.last_name}</p>
                                            <p className="text-[11px] text-gray-500 truncate">{p.email}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                        {showResults && results.length === 0 && query.trim() && !isSearching && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-center">
                                <p className="text-sm text-gray-500">No se encontraron jugadores</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal Alta de Jugador */}
            {altaOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAltaOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-gray-900">Alta manual en el club</h3>
                            <button onClick={() => setAltaOpen(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleAltaSubmit} className="flex flex-col gap-3">
                            {(['first_name', 'last_name', 'phone', 'email'] as const).map((field) => (
                                <input
                                    key={field}
                                    type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                                    placeholder={{ first_name: 'Nombre', last_name: 'Apellidos', phone: 'Teléfono', email: 'Email' }[field]}
                                    value={altaForm[field]}
                                    onChange={(e) => setAltaForm(prev => ({ ...prev, [field]: e.target.value }))}
                                    className="w-full p-2.5 bg-white border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-[#00726b] focus:border-transparent outline-none"
                                />
                            ))}
                            {altaError && <p className="text-xs text-red-500">{altaError}</p>}
                            <button
                                type="submit"
                                disabled={altaSubmitting}
                                className="mt-1 w-full py-2.5 rounded-lg bg-[#00726b] hover:bg-[#005a4f] text-white text-sm font-bold transition-colors disabled:opacity-60"
                            >
                                {altaSubmitting ? 'Dando de alta...' : 'Dar de alta'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export const ReservationModal: React.FC<ReservationModalProps> = ({
    clubId, isOpen, onClose, reservation, onSave, editingBookingData, onUpdate, onDelete, onMarkPaid
}) => {
    const vvStyle = useVisualViewportFix(isOpen);
    const isEditMode = !!editingBookingData;

    // Form States
    const [organizer, setOrganizer] = useState<Player | null>(null);
    const [additionalPlayers, setAdditionalPlayers] = useState<(Player | null)[]>([null, null, null]);
    const [duration, setDuration] = useState(90);
    const [resType, setResType] = useState<string>('standard');
    const [notes, setNotes] = useState('');
    const [confirmEmail, setConfirmEmail] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [startHour, setStartHour] = useState('08');
    const [startMinute, setStartMinute] = useState('00');
    const [bookingDate, setBookingDate] = useState('');
    const [organizerError, setOrganizerError] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [sendDeleteEmail, setSendDeleteEmail] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [overlapError, setOverlapError] = useState<string | null>(null);
    const [pricesByType, setPricesByType] = useState<Record<string, { price_per_hour_cents: number }>>({});
    const [isMarkingPaid, setIsMarkingPaid] = useState(false);

    // Track original values to detect changes in edit mode
    const originalRef = useRef<{
        notes: string; duration: number; resType: string;
        startHour: string; startMinute: string; bookingDate: string;
        organizerId: string | null; guestIds: string[];
    } | null>(null);

    const hasChanges = isEditMode && originalRef.current !== null && (() => {
        const o = originalRef.current!;
        const currentGuestIds = additionalPlayers.filter(Boolean).map(p => p!.id).sort().join(',');
        return (
            notes !== o.notes ||
            duration !== o.duration ||
            resType !== o.resType ||
            startHour !== o.startHour ||
            startMinute !== o.startMinute ||
            bookingDate !== o.bookingDate ||
            (organizer?.id ?? null) !== o.organizerId ||
            currentGuestIds !== o.guestIds.sort().join(',')
        );
    })();

    // Populate form on open
    useEffect(() => {
        if (!isOpen) {
            document.body.style.overflow = 'unset';
            return;
        }
        document.body.style.overflow = 'hidden';
        setOrganizerError(false);
        setOverlapError(null);
        setShowDeleteConfirm(false);
        setSendDeleteEmail(false);

        if (isEditMode && editingBookingData) {
            // Edit mode: pre-populate from existing booking
            const bd = editingBookingData;
            const start = new Date(bd.start_at);
            const sh = start.getHours().toString().padStart(2, '0');
            const sm = start.getMinutes().toString().padStart(2, '0');
            const dateVal = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
            const durMin = (new Date(bd.end_at).getTime() - start.getTime()) / 60000;
            const dur = Math.min(90, Math.max(30, Math.round(durMin / 30) * 30)) || 90;
            const notesVal = bd.notes || '';
            const resTypeVal = bd.reservation_type || '';
            setStartHour(sh);
            setStartMinute(sm);
            setBookingDate(dateVal);
            setDuration(dur);
            setNotes(notesVal);
            setResType(resTypeVal);
            setConfirmEmail(false);

            // Set organizer from joined players data
            if (bd.players) {
                setOrganizer({
                    id: bd.organizer_player_id,
                    first_name: bd.players.first_name,
                    last_name: bd.players.last_name,
                    email: bd.players.email || '',
                    phone: null,
                    elo_rating: 1200,
                    status: 'active',
                    created_at: '',
                });
            } else {
                setOrganizer(null);
            }

            // Set additional players from participants (guests only)
            const guests = (bd.booking_participants || [])
                .filter((p: any) => p.role === 'guest' && p.players)
                .slice(0, 3)
                .map((p: any) => ({
                    id: p.player_id,
                    first_name: p.players.first_name,
                    last_name: p.players.last_name,
                    email: p.players.email || '',
                    phone: null,
                    elo_rating: 1200,
                    status: 'active' as const,
                    created_at: '',
                }));
            const slots: (Player | null)[] = [null, null, null];
            guests.forEach((g: Player, i: number) => { slots[i] = g; });
            setAdditionalPlayers(slots);

            // Snapshot original values for change detection
            originalRef.current = {
                notes: notesVal,
                duration: dur,
                resType: resTypeVal,
                startHour: sh,
                startMinute: sm,
                bookingDate: dateVal,
                organizerId: bd.organizer_player_id || null,
                guestIds: guests.map((g: Player) => g.id),
            };
        } else {
            originalRef.current = null;
            // Create mode: reset everything
            setOrganizer(null);
            setAdditionalPlayers([null, null, null]);
            setDuration(reservation?.durationMinutes || 90);
            setResType('standard');
            setNotes('');
            setConfirmEmail(false);
            if (reservation?.startTime) {
                const [h, m] = reservation.startTime.split(':');
                setStartHour(h?.padStart(2, '0') || '08');
                setStartMinute(m?.padStart(2, '0') || '00');
            }
        }

        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen, reservation?.id, editingBookingData?.id]);

    // Fetch prices when opening in create mode and clubId is available
    useEffect(() => {
        if (!isOpen || !clubId || !!editingBookingData) return;
        reservationTypePricesService.get(clubId).then(setPricesByType).catch(() => setPricesByType({}));
    }, [isOpen, clubId, editingBookingData?.id]);

    const totalPriceCents = useMemo(() => {
        if (editingBookingData?.total_price_cents != null) return editingBookingData.total_price_cents;
        const pricePerHour = pricesByType[resType]?.price_per_hour_cents ?? 0;
        return Math.round((duration / 60) * pricePerHour);
    }, [editingBookingData?.total_price_cents, pricesByType, resType, duration]);

    const formattedPrice = totalPriceCents != null && totalPriceCents >= 0
        ? (totalPriceCents / 100).toFixed(2).replace('.', ',') + ' €'
        : null;

    if (!isOpen || !reservation) return null;

    const handleSave = async (status: 'confirmed' | 'pending_payment') => {
        if (!organizer) {
            setOrganizerError(true);
            return;
        }
        setOrganizerError(false);
        setOverlapError(null);

        // Validate no overlap with other bookings on the same court
        if (isEditMode && editingBookingData) {
            const dateBase = bookingDate || new Date().toISOString().split('T')[0];
            const newStart = new Date(`${dateBase}T${startHour}:${startMinute}`);
            const newEnd = new Date(newStart.getTime() + duration * 60000);
            try {
                const courtId = editingBookingData.court_id;
                const bRes = await apiFetchWithAuth<any>(`/bookings?court_id=${courtId}&date=${dateBase}`);
                const conflicts = (bRes.bookings || []).filter((b: any) => {
                    if (b.id === editingBookingData.id) return false;
                    const bStart = new Date(b.start_at);
                    const bEnd = new Date(b.end_at);
                    return newStart < bEnd && newEnd > bStart;
                });
                if (conflicts.length > 0) {
                    const c = conflicts[0];
                    const cTime = new Date(c.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    const cName = c.players ? `${c.players.first_name} ${c.players.last_name}` : 'otra reserva';
                    setOverlapError(`Conflicto con la reserva de ${cName} a las ${cTime}. Ajusta la duración o el horario.`);
                    return;
                }
            } catch {
                // If validation fetch fails, allow save to proceed
            }
        }

        setIsSaving(true);
        try {
            if (isEditMode && onUpdate && editingBookingData) {
                // Build start_at / end_at with the (possibly updated) date
                const dateBase = bookingDate || new Date().toISOString().split('T')[0];
                const startAt = new Date(`${dateBase}T${startHour}:${startMinute}`).toISOString();
                const endAt = new Date(new Date(startAt).getTime() + duration * 60000).toISOString();
                await onUpdate(editingBookingData.id, {
                    notes,
                    status,
                    start_at: startAt,
                    end_at: endAt,
                    participants: additionalPlayers
                        .filter(p => p !== null)
                        .map(p => ({ player_id: p!.id })),
                });
                } else if (onSave) {
                // Create new booking
                const data = {
                    court_id: reservation.courtId,
                    organizer_player_id: organizer.id,
                    start_at: `${startHour}:${startMinute}`,
                    duration_minutes: duration,
                    total_price_cents: totalPriceCents,
                    status,
                    notes,
                    booking_type: resType || 'standard',
                    source_channel: 'manual',
                    participants: additionalPlayers
                        .filter(p => p !== null)
                        .map(p => ({ player_id: p!.id })),
                    send_email: confirmEmail,
                };
                await onSave(data);
            }
            onClose();
        } catch (err) {
            console.error('Error saving reservation:', err);
            alert('Error al guardar la reserva');
        } finally {
            setIsSaving(false);
        }
    };

    const handleMarkPaid = async () => {
        if (!onMarkPaid || !editingBookingData) return;
        setIsMarkingPaid(true);
        try {
            await onMarkPaid(editingBookingData.id);
            onClose();
        } catch (err) {
            console.error('Error marking paid:', err);
            alert('Error al marcar como pagado');
        } finally {
            setIsMarkingPaid(false);
        }
    };

    const handleDelete = async () => {
        if (!onDelete || !editingBookingData) return;
        setIsDeleting(true);
        try {
            await onDelete(editingBookingData.id, sendDeleteEmail);
            onClose();
        } catch (err) {
            console.error('Error deleting booking:', err);
            alert('Error al eliminar la reserva');
        } finally {
            setIsDeleting(false);
        }
    };

    const formattedDate = new Date().toLocaleDateString('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const courtDisplayName = editingBookingData?.courtName || reservation.courtName || reservation.courtId;

    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutes = ['00', '15', '30', '45'];

    return (
        <div style={vvStyle} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4 transition-opacity duration-300">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={onClose} />

            {/* Modal Container */}
            <div className="relative flex flex-col w-full h-[90vh] bg-gray-50 rounded-t-3xl shadow-2xl sm:h-auto sm:max-h-[90vh] sm:w-[900px] sm:rounded-2xl animate-slide-up sm:animate-fade-scale-in overflow-hidden">

                {/* Mobile Drag Indicator */}
                <div className="flex justify-center w-full pt-3 pb-1 sm:hidden bg-white cursor-grab active:cursor-grabbing" onClick={onClose}>
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-start justify-between px-6 py-4 bg-white border-b border-gray-100 shrink-0">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h2 className="text-xl font-bold text-gray-900 leading-tight">
                                {isEditMode ? 'Editar Reserva' : 'Nueva Reserva'}
                            </h2>
                            {courtDisplayName && (
                                <span className="px-3 py-0.5 bg-[#006A6A] text-white text-sm font-bold rounded-md uppercase tracking-wide">
                                    {courtDisplayName}
                                </span>
                            )}
                        </div>
                        {overlapError && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-medium mt-1">
                                <AlertTriangle size={13} className="shrink-0" />
                                {overlapError}
                            </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                            {/* Actualizar — only shown in edit mode when there are changes */}
                            {isEditMode && editingBookingData?.status === 'pending_payment' && onMarkPaid && (
                                <button
                                    onClick={handleMarkPaid}
                                    disabled={isMarkingPaid}
                                    className="px-4 py-1.5 bg-[#006A6A] text-white text-xs font-bold rounded-md hover:bg-[#005151] disabled:opacity-50 transition-colors"
                                >
                                    {isMarkingPaid ? 'Procesando...' : 'Marcar como pagado'}
                                </button>
                            )}
                            {isEditMode && hasChanges && (
                                <button
                                    onClick={() => handleSave(editingBookingData?.status === 'confirmed' ? 'confirmed' : 'pending_payment')}
                                    disabled={!organizer || isSaving}
                                    className="px-4 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-md hover:bg-orange-600 disabled:opacity-50 transition-colors ring-2 ring-orange-300"
                                >
                                    {isSaving ? 'Actualizando...' : 'Actualizar'}
                                </button>
                            )}
                            {!isEditMode && (
                                <>
                                    <button
                                        onClick={() => handleSave('confirmed')}
                                        disabled={!organizer || isSaving}
                                        className="px-4 py-1.5 bg-[#006A6A] text-white text-xs font-bold rounded-md hover:bg-[#005151] disabled:opacity-50 transition-colors"
                                    >
                                        Pagar
                                    </button>
                                    <button
                                        onClick={() => handleSave('pending_payment')}
                                        disabled={!organizer || isSaving}
                                        className="px-4 py-1.5 bg-[#006A6A] text-white text-xs font-bold rounded-md hover:bg-[#005151] disabled:opacity-50 transition-colors"
                                    >
                                        Reservar (Pendiente de pago)
                                    </button>
                                </>
                            )}
                            <button
                                onClick={onClose}
                                className="px-4 py-1.5 bg-gray-200 text-gray-700 text-xs font-bold rounded-md hover:bg-gray-300 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 transition-colors bg-gray-100 rounded-full hover:bg-gray-200 hover:text-gray-600 flex-shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 p-6 overflow-y-auto hidden-scrollbar">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Left Column */}
                        <div className="space-y-5">
                            {/* Fecha */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-700 w-32 shrink-0">Fecha:</span>
                                {isEditMode ? (
                                    <input
                                        type="date"
                                        value={bookingDate}
                                        onChange={(e) => setBookingDate(e.target.value)}
                                        className="p-1.5 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                    />
                                ) : (
                                    <span className="text-sm text-gray-900 capitalize font-medium">{formattedDate}</span>
                                )}
                            </div>

                            {/* Inicio */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-700 w-32 shrink-0">
                                    Inicio:<span className="text-red-500">*</span>
                                </span>
                                <div className="flex items-center gap-1">
                                    <select
                                        className="p-1.5 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A] min-w-[60px]"
                                        value={startHour}
                                        onChange={(e) => setStartHour(e.target.value)}
                                    >
                                        {hours.map(h => (
                                            <option key={h} value={h}>{h}</option>
                                        ))}
                                    </select>
                                    <span className="font-bold text-gray-600">:</span>
                                    <select
                                        className="p-1.5 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A] min-w-[60px]"
                                        value={startMinute}
                                        onChange={(e) => setStartMinute(e.target.value)}
                                    >
                                        {minutes.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Nº de reservas */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-700 w-32 shrink-0">Nº de reservas:</span>
                                <select className="flex-1 p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]">
                                    <option>1</option>
                                    <option>2</option>
                                    <option>3</option>
                                    <option>4</option>
                                </select>
                            </div>

                            {/* Cliente */}
                            <div>
                                <PlayerSearch
                                    label="Cliente:*"
                                    placeholder="Buscar cliente..."
                                    selectedPlayer={organizer}
                                    onSelect={(p) => { setOrganizer(p); if (p) setOrganizerError(false); }}
                                    required
                                />
                                {organizerError && (
                                    <p className="mt-1 text-xs text-red-500 font-medium">
                                        Debes seleccionar un cliente para guardar la reserva.
                                    </p>
                                )}
                            </div>

                            {/* Observaciones */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-bold text-gray-700">Observaciones:</label>
                                <textarea
                                    className="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white h-24 focus:ring-2 focus:ring-[#006A6A] outline-none resize-none"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>

                            {/* Enviar email */}
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="send-email"
                                    className="w-4 h-4 accent-[#006A6A] border-gray-300 rounded"
                                    checked={confirmEmail}
                                    onChange={(e) => setConfirmEmail(e.target.checked)}
                                />
                                <label htmlFor="send-email" className="text-sm font-medium text-gray-700">
                                    Enviar email con confirmación:
                                </label>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-5">
                            {/* Instalación */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-700 w-32 shrink-0">Instalación:</span>
                                <span className="text-sm text-gray-900 font-bold uppercase">{courtDisplayName}</span>
                            </div>

                            {/* Duración */}
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-bold text-gray-700 w-32 shrink-0">Duración:</label>
                                <select
                                    className="flex-1 p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                    value={duration}
                                    onChange={(e) => { setDuration(Number(e.target.value)); setOverlapError(null); }}
                                >
                                    <option value={30}>30</option>
                                    <option value={60}>60</option>
                                    <option value={90}>90</option>
                                </select>
                            </div>

                            {/* Tipo de reserva */}
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-bold text-gray-700 w-32 shrink-0">Tipo de reserva:</label>
                                <select
                                    className="flex-1 p-2 border border-gray-300 rounded-md text-sm bg-white outline-none focus:ring-2 focus:ring-[#006A6A]"
                                    value={resType}
                                    onChange={(e) => setResType(e.target.value)}
                                >
                                    <option value="standard">Pista privada</option>
                                    <option value="open_match">Partido abierto</option>
                                    <option value="pozo">Pozo / Americanas</option>
                                    <option value="fixed_recurring">Turno fijo</option>
                                    <option value="school_group">Escuela — clase grupal</option>
                                    <option value="school_individual">Escuela — clase particular</option>
                                    <option value="flat_rate">Tarifa plana</option>
                                    <option value="tournament">Torneo</option>
                                    <option value="blocked">Bloqueo administrativo</option>
                                </select>
                            </div>

                            {/* Precio calculado (solo en modo creación) */}
                            {!isEditMode && formattedPrice != null && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-700 w-32 shrink-0">Precio:</span>
                                    <span className="text-sm font-bold text-[#006A6A]">{formattedPrice}</span>
                                    <span className="text-xs text-gray-500">({duration} min)</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Resto de jugadores */}
                    <div className="mt-8 pt-6 border-t border-gray-200">
                        <h3 className="text-lg font-bold text-gray-900 mb-5">Resto de jugadores</h3>
                        <div className="space-y-4">
                            {[0, 1, 2].map((index) => (
                                <PlayerSearch
                                    key={index}
                                    label={`Jugador ${index + 2}:`}
                                    onSelect={(player) => {
                                        const newPlayers = [...additionalPlayers];
                                        newPlayers[index] = player;
                                        setAdditionalPlayers(newPlayers);
                                    }}
                                    placeholder={`Buscar jugador ${index + 2}...`}
                                    selectedPlayer={additionalPlayers[index]}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Delete section — only in edit mode */}
                {isEditMode && (
                    <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-white">
                        {!showDeleteConfirm ? (
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                            >
                                <Trash2 size={15} />
                                Eliminar reserva
                            </button>
                        ) : (
                            <div className="flex flex-col gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-center gap-2 text-red-700">
                                    <AlertTriangle size={16} className="shrink-0" />
                                    <span className="text-sm font-bold">¿Estás seguro de que deseas eliminar esta reserva?</span>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer w-fit">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 accent-red-600"
                                        checked={sendDeleteEmail}
                                        onChange={(e) => setSendDeleteEmail(e.target.checked)}
                                    />
                                    <span className="text-sm text-red-700">Enviar email de cancelación al cliente</span>
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleDelete}
                                        disabled={isDeleting}
                                        className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                                    >
                                        {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
                                    </button>
                                    <button
                                        onClick={() => { setShowDeleteConfirm(false); setSendDeleteEmail(false); }}
                                        disabled={isDeleting}
                                        className="px-4 py-1.5 bg-white text-gray-700 text-xs font-bold border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Saving overlay */}
                {isSaving && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-[110]">
                        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg border border-gray-100">
                            <div className="w-5 h-5 border-2 border-[#006A6A] border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm font-bold text-gray-900">Procesando reserva...</span>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
