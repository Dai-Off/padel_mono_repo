import React from 'react';
import { Building2, MapPin, Mail } from 'lucide-react';
import type { ClubApplication, ApplicationStatus } from '../../services/adminApplications';
import { useTranslation } from 'react-i18next';

const statusColors: Record<ApplicationStatus, string> = {
    pending: 'bg-amber-100 text-amber-800',
    contacted: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
};

const statusLabels: Record<ApplicationStatus, string> = {
    pending: 'admin_status_pending',
    contacted: 'admin_status_contacted',
    approved: 'admin_status_approved',
    rejected: 'admin_status_rejected',
};

interface ApplicationCardProps {
    application: ClubApplication;
    onClick: () => void;
}

export const ApplicationCard: React.FC<ApplicationCardProps> = ({ application, onClick }) => {
    const { t } = useTranslation();
    const status = application.status as ApplicationStatus;

    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left group bg-white rounded-[24px] p-5 shadow-sm border border-gray-100 hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${statusColors[status]}`}>
                    {t(statusLabels[status])}
                </span>
            </div>
            <div className="space-y-3">
                <h3 className="text-base font-bold text-[#1A1A1A]">{application.club_name}</h3>
                <p className="text-xs text-gray-500 font-medium">
                    {application.responsible_first_name} {application.responsible_last_name}
                </p>
                <div className="space-y-2 pt-2 border-t border-gray-50">
                    <div className="flex items-center gap-2.5 text-xs text-gray-500">
                        <MapPin className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        <span className="font-medium truncate">{application.city}, {application.country}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-gray-500">
                        <Mail className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        <span className="font-medium truncate">{application.email}</span>
                    </div>
                </div>
            </div>
        </button>
    );
};
