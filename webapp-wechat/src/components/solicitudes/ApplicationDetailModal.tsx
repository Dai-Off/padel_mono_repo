import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, XCircle, Copy, Building2, User, MapPin, Mail, Phone, Clock, MailPlus } from 'lucide-react';
import { toast } from 'sonner';
import { adminApplicationsService } from '../../services/adminApplications';
import type { ClubApplication, ApplicationStatus } from '../../services/adminApplications';

const statusBadge: Record<ApplicationStatus, string> = {
    pending: 'bg-amber-500/15 text-amber-300',
    contacted: 'bg-blue-500/15 text-blue-300',
    approved: 'bg-emerald-500/15 text-emerald-300',
    rejected: 'bg-red-500/15 text-red-300',
};

const statusLabel: Record<ApplicationStatus, string> = {
    pending: 'Pendiente',
    contacted: 'Contactado',
    approved: 'Aprobado',
    rejected: 'Rechazado',
};

type Props = {
    application: ClubApplication | null;
    onClose: () => void;
    onApprove: (id: string) => Promise<{ invite_url: string }>;
    onReject: (id: string, reason?: string) => Promise<void>;
    /** Refresca la lista sin spinner (p. ej. tras aprobar). */
    onSilentRefresh?: () => void;
};

export function ApplicationDetailModal({ application, onClose, onApprove, onReject, onSilentRefresh }: Props) {
    const [loading, setLoading] = useState<'approve' | 'reject' | 'resend' | null>(null);
    const [inviteUrl, setInviteUrl] = useState<string | null>(null);
    const [rejectMode, setRejectMode] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!application) return;
        setLoading(null);
        setInviteUrl(null);
        setRejectMode(false);
        setRejectReason('');
        setCopied(false);
    }, [application?.id]);

    if (!application) return null;

    const status = application.status;
    const canAct = status === 'pending' || status === 'contacted';

    const handleApprove = async () => {
        setLoading('approve');
        try {
            const { invite_url } = await onApprove(application.id);
            setInviteUrl(invite_url);
            toast.success('Solicitud aprobada');
            onSilentRefresh?.();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
        } finally {
            setLoading(null);
        }
    };

    const handleReject = async () => {
        setLoading('reject');
        try {
            await onReject(application.id, rejectReason.trim() || undefined);
            setRejectMode(false);
            setRejectReason('');
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
        } finally {
            setLoading(null);
        }
    };

    const copyInviteUrl = () => {
        if (inviteUrl) {
            navigator.clipboard.writeText(inviteUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleResendInvite = async () => {
        setLoading('resend');
        try {
            const { invite_url, message } = await adminApplicationsService.resendInvite(application.id);
            setInviteUrl(invite_url);
            toast.success(message || 'Invitación reenviada');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
        } finally {
            setLoading(null);
        }
    };

    const courts = Array.isArray(application.courts) ? (application.courts as { name?: string }[]) : [];

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-50 flex justify-end"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
                <motion.div
                    key={application.id}
                    className="modal-scroll relative w-full max-w-lg overflow-y-auto border-l border-auth-border bg-auth-bg shadow-2xl"
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                >
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-auth-border bg-auth-bg px-5 py-4">
                        <h2 className="text-lg font-bold text-auth-text">{application.club_name}</h2>
                        <button
                            onClick={onClose}
                            className="rounded-xl p-2 text-auth-muted transition hover:bg-white/5 hover:text-auth-text"
                            aria-label="Cerrar"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="space-y-6 p-5 pb-24">
                        <div className="flex items-center gap-2">
                            <span className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase ${statusBadge[status]}`}>
                                {statusLabel[status]}
                            </span>
                        </div>

                        <section>
                            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-auth-secondary">
                                <User className="h-3.5 w-3.5" /> Responsable del club
                            </h3>
                            <p className="text-sm font-medium text-auth-text">
                                {application.responsible_first_name} {application.responsible_last_name}
                            </p>
                            <div className="mt-2 space-y-1.5 text-sm text-auth-muted">
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-auth-secondary" />
                                    <a href={`mailto:${application.email}`} className="hover:underline">{application.email}</a>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-auth-secondary" />
                                    <span>{application.phone}</span>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-auth-secondary">
                                <Building2 className="h-3.5 w-3.5" /> Club
                            </h3>
                            <p className="text-sm text-auth-text">{application.club_name}</p>
                            {application.official_name && (
                                <p className="mt-0.5 text-xs text-auth-secondary">{application.official_name}</p>
                            )}
                            <div className="mt-2 flex items-start gap-2 text-sm text-auth-muted">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-auth-secondary" />
                                <span>
                                    {[application.full_address, application.city, application.country].filter(Boolean).join(', ')}
                                </span>
                            </div>
                            {application.description && (
                                <p className="mt-2 text-sm text-auth-muted">{application.description}</p>
                            )}
                        </section>

                        <section>
                            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-auth-secondary">
                                <Clock className="h-3.5 w-3.5" /> Datos
                            </h3>
                            <ul className="space-y-1 text-sm text-auth-muted">
                                <li><span className="text-auth-secondary">Pistas:</span> {application.court_count}</li>
                                <li><span className="text-auth-secondary">Deporte:</span> {application.sport}</li>
                                {application.open_time && application.close_time && (
                                    <li><span className="text-auth-secondary">Horario:</span> {application.open_time} - {application.close_time}</li>
                                )}
                                {application.slot_duration_min && (
                                    <li><span className="text-auth-secondary">Duración slot:</span> {application.slot_duration_min} min</li>
                                )}
                            </ul>
                            {courts.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs text-auth-secondary">Pistas configuradas:</p>
                                    <ul className="mt-1 text-sm text-auth-muted">
                                        {courts.map((c, i) => (
                                            <li key={i}>• {c.name ?? `Pista ${i + 1}`}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </section>

                        {inviteUrl && (
                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                                <p className="mb-2 text-xs font-bold text-emerald-300">Enlace de invitación</p>
                                <p className="mb-3 break-all text-xs text-emerald-200/80">{inviteUrl}</p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={copyInviteUrl}
                                        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                                    >
                                        <Copy className="h-4 w-4" />
                                        {copied ? 'Copiado' : 'Copiar enlace'}
                                    </button>
                                    {status === 'approved' && !application.club_owner_id && (
                                        <button
                                            type="button"
                                            onClick={handleResendInvite}
                                            disabled={loading === 'resend'}
                                            className="flex items-center gap-2 rounded-xl border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                                        >
                                            <MailPlus className="h-4 w-4" />
                                            {loading === 'resend' ? '…' : 'Reenviar invitación'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {status === 'approved' && !application.club_owner_id && !inviteUrl && (
                            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                                <p className="mb-3 text-xs text-amber-200/90">
                                    El club aún no completó su registro. Podés regenerar y reenviar la invitación.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleResendInvite}
                                    disabled={loading === 'resend'}
                                    className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                                >
                                    <MailPlus className="h-4 w-4" />
                                    {loading === 'resend' ? '…' : 'Reenviar invitación'}
                                </button>
                            </div>
                        )}

                        {rejectMode ? (
                            <div className="space-y-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                                <label className="block text-sm font-semibold text-auth-text">Motivo del rechazo</label>
                                <textarea
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    className="w-full rounded-xl border border-auth-border-input bg-auth-input px-3 py-2 text-sm text-auth-text outline-none focus:border-auth-accent/50"
                                    rows={3}
                                    placeholder="Motivo del rechazo"
                                />
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setRejectMode(false)}
                                        className="flex-1 rounded-xl border border-auth-border-input py-2.5 text-sm font-semibold text-auth-muted hover:bg-white/5"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleReject}
                                        disabled={loading === 'reject'}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {loading === 'reject' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                                        Confirmar rechazo
                                    </button>
                                </div>
                            </div>
                        ) : canAct && !inviteUrl ? (
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={handleApprove}
                                    disabled={loading !== null}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {loading === 'approve' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                                    <Check className="h-4 w-4" />
                                    Aprobar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRejectMode(true)}
                                    disabled={loading !== null}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-red-500/30 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/10"
                                >
                                    <XCircle className="h-4 w-4" />
                                    Rechazar
                                </button>
                            </div>
                        ) : null}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
