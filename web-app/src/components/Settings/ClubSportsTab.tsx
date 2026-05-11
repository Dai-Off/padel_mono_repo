import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Club } from '../../services/club';
import { clubSportsService } from '../../services/clubSports';
import type { ClubSport } from '../../types/clubSports';
import { PageSpinner } from '../Layout/PageSpinner';

interface ClubSportsTabProps {
    initialClub?: Club | null;
}

type SportFormState = {
    name: string;
    allows_singles: boolean;
    is_active: boolean;
};

const EMPTY_FORM: SportFormState = { name: '', allows_singles: true, is_active: true };

export function ClubSportsTab({ initialClub }: ClubSportsTabProps) {
    const [loading, setLoading] = useState(true);
    const [sports, setSports] = useState<ClubSport[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingSport, setEditingSport] = useState<ClubSport | null>(null);
    const [form, setForm] = useState<SportFormState>(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const clubId = initialClub?.id;
        if (!clubId) {
            setSports([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const data = await clubSportsService.getAll(clubId);
                if (!cancelled) setSports(data);
            } catch {
                if (!cancelled) toast.error('No se pudieron cargar los deportes');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [initialClub?.id]);

    const openCreate = () => {
        setEditingSport(null);
        setForm(EMPTY_FORM);
        setModalOpen(true);
    };

    const openEdit = (sport: ClubSport) => {
        setEditingSport(sport);
        setForm({ name: sport.name, allows_singles: sport.allows_singles, is_active: sport.is_active });
        setModalOpen(true);
    };

    const closeModal = () => {
        if (submitting) return;
        setModalOpen(false);
        setEditingSport(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const clubId = initialClub?.id;
        const name = form.name.trim();
        if (!clubId || !name) {
            toast.error('Indica un nombre para el deporte');
            return;
        }
        setSubmitting(true);
        try {
            if (editingSport) {
                const updated = await clubSportsService.update(editingSport.id, {
                    name,
                    allows_singles: form.allows_singles,
                    is_active: form.is_active,
                });
                setSports((prev) =>
                    prev
                        .map((item) => (item.id === editingSport.id ? updated : item))
                        .sort((a, b) => a.name.localeCompare(b.name)),
                );
                toast.success('Deporte actualizado');
            } else {
                const created = await clubSportsService.create({
                    club_id: clubId,
                    name,
                    allows_singles: form.allows_singles,
                    is_active: form.is_active,
                });
                setSports((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
                toast.success('Deporte agregado');
            }
            setModalOpen(false);
            setEditingSport(null);
            setForm(EMPTY_FORM);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar el deporte');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteSport = async (sport: ClubSport) => {
        try {
            await clubSportsService.delete(sport.id);
            setSports((prev) => prev.filter((item) => item.id !== sport.id));
            toast.success('Deporte eliminado');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el deporte');
        }
    };

    if (loading) return <PageSpinner />;

    return (
        <div className="max-w-4xl space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-[#1A1A1A]">Deportes</h2>
                <button
                    type="button"
                    onClick={openCreate}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-bold hover:opacity-90"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar deporte
                </button>
            </div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
                {sports.length === 0 ? (
                    <p className="text-xs text-gray-500">No hay deportes para este club. Pulsa "Agregar deporte" para crear uno.</p>
                ) : (
                    <div className="space-y-2">
                        {sports.map((sport) => (
                            <div
                                key={sport.id}
                                className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="flex flex-1 items-center gap-3 min-w-0">
                                    <p className="text-sm font-semibold text-[#1A1A1A] truncate">{sport.name}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        <Badge active={sport.is_active} labelActive="Activo" labelInactive="Inactivo" />
                                        <Badge
                                            active={sport.allows_singles}
                                            labelActive="Singles habilitado"
                                            labelInactive="Solo dobles"
                                            color={sport.allows_singles ? 'blue' : 'gray'}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 md:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => openEdit(sport)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[#1A1A1A] bg-white border border-gray-200 hover:bg-gray-50"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                        Editar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteSport(sport)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-red-600 hover:opacity-90"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Eliminar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>

            <AnimatePresence>
                {modalOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeModal}
                            className="fixed inset-0 bg-black/40 z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-xl z-50 p-5 mx-4"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-[#1A1A1A]">
                                    {editingSport ? 'Editar deporte' : 'Nuevo deporte'}
                                </h3>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center"
                                >
                                    <X className="w-4 h-4 text-gray-400" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                                        Nombre del deporte
                                    </label>
                                    <input
                                        value={form.name}
                                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                        placeholder="Ej: Padel"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#E31E24]/30 focus:border-[#E31E24]/30 text-sm text-[#1A1A1A]"
                                        autoFocus
                                    />
                                </div>

                                <ToggleRow
                                    label="Permite singles"
                                    description="Si se desactiva, los partidos en este deporte solo se podrán crear como dobles."
                                    checked={form.allows_singles}
                                    onChange={(v) => setForm((f) => ({ ...f, allows_singles: v }))}
                                />

                                <ToggleRow
                                    label="Activo"
                                    description="Cuando está inactivo, el deporte no aparece en formularios de pista ni de reserva."
                                    checked={form.is_active}
                                    onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                                />

                                <div className="flex gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        disabled={submitting}
                                        className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 disabled:opacity-60"
                                    >
                                        Cancelar
                                    </button>
                                    <motion.button
                                        type="submit"
                                        disabled={submitting}
                                        whileTap={{ scale: 0.98 }}
                                        className="flex-1 py-2.5 rounded-xl bg-[#E31E24] text-white text-xs font-bold disabled:opacity-60"
                                    >
                                        {submitting ? 'Guardando…' : editingSport ? 'Guardar' : 'Crear deporte'}
                                    </motion.button>
                                </div>
                            </form>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

function Badge({
    active,
    labelActive,
    labelInactive,
    color = 'green',
}: {
    active: boolean;
    labelActive: string;
    labelInactive: string;
    color?: 'green' | 'blue' | 'gray';
}) {
    const palette = active
        ? color === 'blue'
            ? 'bg-blue-50 text-blue-600 border-blue-100'
            : 'bg-green-50 text-green-600 border-green-100'
        : 'bg-gray-100 text-gray-500 border-gray-200';
    return (
        <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${palette}`}>
            {active ? labelActive : labelInactive}
        </span>
    );
}

function ToggleRow({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <label className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 cursor-pointer">
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#1A1A1A]">{label}</p>
                {description ? <p className="mt-0.5 text-[10px] text-gray-500 leading-snug">{description}</p> : null}
            </div>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#E31E24]"
            />
        </label>
    );
}
