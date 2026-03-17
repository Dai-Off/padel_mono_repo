import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, XCircle, Copy, Building2, User, MapPin, Mail, Phone, Clock } from 'lucide-react';
import type { ClubApplication, ApplicationStatus } from '../../services/adminApplications';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const statusColors: Record<ApplicationStatus, string> = {
    pending: 'bg-amber-100 text-amber-800',
    contacted: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
};

interface ApplicationDetailModalProps {
    application: ClubApplication | null;
    onClose: () => void;
    onApprove: (id: string) => Promise<{ invite_url: string }>;
    onReject: (id: string, reason?: string) => Promise<void>;
    onDone: () => void;
}

export const ApplicationDetailModal: React.FC<ApplicationDetailModalProps> = ({
    application,
    onClose,
    onApprove,
    onReject,
    onDone,
}) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
    const [inviteUrl, setInviteUrl] = useState<string | null>(null);
    const [rejectMode, setRejectMode] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [copied, setCopied] = useState(false);

    if (!application) return null;

    const status = application.status as ApplicationStatus;
    const canAct = status === 'pending' || status === 'contacted';

    const handleApprove = async () => {
        setLoading('approve');
        try {
            const { invite_url } = await onApprove(application.id);
            setInviteUrl(invite_url);
            toast.success(t('admin_approve'));
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
            onDone();
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

    const courts = Array.isArray(application.courts) ? application.courts : [];

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-50 flex justify-end"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                <motion.div
                    className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto"
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                >
                    <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
                        <h2 className="text-lg font-bold text-[#1A1A1A]">{application.club_name}</h2>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-5 space-y-6 pb-24">
                        <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${statusColors[status]}`}>
                                {t(`admin_status_${status}`)}
                            </span>
                        </div>

                        <section>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5" /> {t('registration_responsible')}
                            </h3>
                            <p className="text-sm font-medium text-[#1A1A1A]">
                                {application.responsible_first_name} {application.responsible_last_name}
                            </p>
                            <div className="mt-2 space-y-1.5 text-sm text-gray-600">
                                <div className="flex items-center gap-2">
                                    <Mail className="w-4 h-4 text-gray-400" />
                                    <a href={`mailto:${application.email}`} className="hover:underline">{application.email}</a>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-gray-400" />
                                    <span>{application.phone}</span>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5" /> Club
                            </h3>
                            <p className="text-sm text-[#1A1A1A]">{application.club_name}</p>
                            {application.official_name && (
                                <p className="text-xs text-gray-500 mt-0.5">{application.official_name}</p>
                            )}
                            <div className="mt-2 flex items-start gap-2 text-sm text-gray-600">
                                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                <span>
                                    {[application.full_address, application.city, application.country].filter(Boolean).join(', ')}
                                </span>
                            </div>
                            {application.description && (
                                <p className="text-sm text-gray-600 mt-2">{application.description}</p>
                            )}
                        </section>

                        <section>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" /> Datos
                            </h3>
                            <ul className="text-sm text-gray-600 space-y-1">
                                <li><span className="text-gray-400">Pistas:</span> {application.court_count}</li>
                                <li><span className="text-gray-400">Deporte:</span> {application.sport}</li>
                                {application.open_time && application.close_time && (
                                    <li><span className="text-gray-400">Horario:</span> {application.open_time} - {application.close_time}</li>
                                )}
                                {application.slot_duration_min && (
                                    <li><span className="text-gray-400">Duración slot:</span> {application.slot_duration_min} min</li>
                                )}
                            </ul>
                            {courts.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-gray-400 text-xs">Pistas configuradas:</p>
                                    <ul className="text-sm text-gray-600 mt-1">
                                        {courts.map((c: { name?: string }, i: number) => (
                                            <li key={i}>• {c.name ?? `Pista ${i + 1}`}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </section>

                        {inviteUrl && (
                            <div className="p-4 rounded-2xl bg-green-50 border border-green-100">
                                <p className="text-xs font-bold text-green-800 mb-2">{t('admin_invite_url')}</p>
                                <p className="text-xs text-green-700 break-all mb-3">{inviteUrl}</p>
                                <button
                                    type="button"
                                    onClick={copyInviteUrl}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
                                >
                                    <Copy className="w-4 h-4" />
                                    {copied ? t('admin_copied') : t('admin_copy_link')}
                                </button>
                            </div>
                        )}

                        {rejectMode ? (
                            <div className="space-y-3 p-4 rounded-2xl border border-red-100 bg-red-50/50">
                                <label className="block text-sm font-semibold text-gray-700">
                                    {t('admin_reject_reason')}
                                </label>
                                <textarea
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
                                    rows={3}
                                    placeholder={t('admin_reject_reason')}
                                />
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setRejectMode(false)}
                                        className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700"
                                    >
                                        {t('cancel')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleReject}
                                        disabled={loading === 'reject'}
                                        className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {loading === 'reject' && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                        {t('admin_confirm_reject')}
                                    </button>
                                </div>
                            </div>
                        ) : canAct && !inviteUrl && (
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={handleApprove}
                                    disabled={loading !== null}
                                    className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {loading === 'approve' && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                    <Check className="w-4 h-4" />
                                    {t('admin_approve')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRejectMode(true)}
                                    disabled={loading !== null}
                                    className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 flex items-center justify-center gap-2"
                                >
                                    <XCircle className="w-4 h-4" />
                                    {t('admin_reject')}
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
