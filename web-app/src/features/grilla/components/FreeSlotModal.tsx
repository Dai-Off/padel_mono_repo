import React, { useEffect } from 'react';
import {
    X,
    Calendar,
    Clock,
    Plus,
    ShieldAlert,
    Users,
    Trophy
} from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from '../i18n/I18nContext';
import { useVisualViewportFix } from '../hooks/useVisualViewportFix';

interface FreeSlotModalProps {
    isOpen: boolean;
    onClose: () => void;
    courtName: string;
    time: string;
    isDisabled?: boolean;
    onConfirm?: (duration: number) => void;
}

export const FreeSlotModal: React.FC<FreeSlotModalProps> = ({ isOpen, onClose, courtName, time, isDisabled, onConfirm }) => {
    const { t } = useTranslation();
    const vvStyle = useVisualViewportFix(isOpen);

    // Prevent background scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div style={vvStyle} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4 transition-opacity duration-300">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={onClose} />

            {/* Modal Container */}
            <div className="relative flex flex-col w-full h-[80vh] bg-gray-50 rounded-t-3xl shadow-2xl sm:h-auto sm:max-h-[90vh] sm:w-[500px] sm:rounded-2xl animate-slide-up sm:animate-fade-scale-in overflow-hidden">

                {/* Mobile Drag Indicator */}
                <div className="flex justify-center w-full pt-3 pb-1 sm:hidden bg-white cursor-grab active:cursor-grabbing" onClick={onClose}>
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 bg-white border-b border-gray-100 shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            {isDisabled ? (
                                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-md bg-gray-200 text-gray-700">
                                    {t('freeSlot.disabled')}
                                </span>
                            ) : (
                                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-md bg-green-100 text-green-700">
                                    {t('freeSlot.available')}
                                </span>
                            )}
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 leading-tight">{t('freeSlot.newAction')}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 transition-colors bg-gray-100 rounded-full hover:bg-gray-200 hover:text-gray-600 flex-shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 p-5 overflow-y-auto hidden-scrollbar">

                    {/* Basic Info Summary */}
                    <div className={clsx(
                        "flex items-center gap-6 p-4 mb-6 bg-white border shadow-sm rounded-xl",
                        isDisabled ? "border-gray-200" : "border-green-200"
                    )}>
                        <div className="flex items-center gap-3">
                            <div className={clsx(
                                "p-2 rounded-lg",
                                isDisabled ? "text-gray-500 bg-gray-50" : "text-green-700 bg-green-50"
                            )}>
                                <Clock size={20} />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-gray-500">{t('freeSlot.startTime')}</p>
                                <p className="font-bold text-gray-900 text-sm">
                                    {time}
                                </p>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-gray-200"></div>
                        <div className="flex items-center gap-3">
                            <div className={clsx(
                                "p-2 rounded-lg",
                                isDisabled ? "text-gray-500 bg-gray-50" : "text-green-700 bg-green-50"
                            )}>
                                <Calendar size={20} />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-gray-500">{t('freeSlot.court')}</p>
                                <p className="font-bold text-gray-900 text-sm uppercase">{courtName}</p>
                            </div>
                        </div>
                    </div>

                    {/* Action Groups */}
                    <div className="space-y-6 pb-6">
                        {isDisabled ? (
                            /* Habilitación */
                            <div>
                                <h3 className="text-xs font-bold text-gray-900 uppercase mb-3 flex items-center gap-1.5">
                                    <ShieldAlert size={14} className="text-gray-500" /> {t('freeSlot.administration')}
                                </h3>
                                <div className="flex flex-col gap-2">
                                    <ActionButton icon={<Plus size={18} />} label={t('freeSlot.enableSlot')} variant="primary" fullWidth />
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Creación */}
                                <div>
                                    <h3 className="text-xs font-bold text-gray-900 uppercase mb-3 flex items-center gap-1.5">
                                        <Plus size={14} className="text-gray-500" /> {t('freeSlot.createReservation')}
                                    </h3>
                                    <div className="flex flex-col gap-2">
                                        <ActionButton 
                                            icon={<Plus size={18} />} 
                                            label={t('freeSlot.newStandardReservation')} 
                                            variant="primary" 
                                            fullWidth 
                                            onClick={() => onConfirm?.(90)}
                                        />
                                        <div className="flex gap-2">
                                            <ActionButton icon={<Users size={16} />} label={t('freeSlot.createMatch')} className="flex-1 justify-center" />
                                            <ActionButton icon={<Trophy size={16} />} label={t('freeSlot.addToTournament')} className="flex-1 justify-center" />
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* Mantenimiento */}
                                <div>
                                    <h3 className="text-xs font-bold text-gray-900 uppercase mb-3 flex items-center gap-1.5">
                                        <ShieldAlert size={14} className="text-gray-500" /> {t('freeSlot.administration')}
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        <ActionButton icon={<ShieldAlert size={16} />} label={t('freeSlot.blockCourt')} variant="secondary" />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

// Helper component for uniform buttons
const ActionButton: React.FC<{ icon?: React.ReactNode, label: string, variant?: 'default' | 'primary' | 'danger' | 'secondary', fullWidth?: boolean, className?: string, onClick?: () => void }> = ({ icon, label, variant = 'default', fullWidth, className, onClick }) => {
    const baseStyle = "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors border";

    const variants = {
        default: "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300",
        primary: "bg-[#006A6A] border-[#006A6A] text-white hover:bg-[#005151]",
        danger: "bg-red-50 border-red-100 text-red-600 hover:bg-red-100 hover:border-red-200",
        secondary: "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
    };

    return (
        <button 
            onClick={onClick}
            className={clsx(baseStyle, variants[variant], fullWidth && "w-full justify-center", className)}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
};
