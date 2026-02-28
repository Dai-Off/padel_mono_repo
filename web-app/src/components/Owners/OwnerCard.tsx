import React from 'react';
import { Mail, Phone, ShieldCheck, Trash2, Edit } from 'lucide-react';
import type { ClubOwner } from '../../services/clubOwner';
import { useTranslation } from 'react-i18next';

interface OwnerCardProps {
    owner: ClubOwner;
    onEdit: (owner: ClubOwner) => void;
    onDelete: (id: string) => void;
}

export const OwnerCard: React.FC<OwnerCardProps> = ({ owner, onEdit, onDelete }) => {
    const { t } = useTranslation();

    return (
        <div className="group bg-white rounded-[24px] p-5 shadow-sm border border-gray-100 hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => onEdit(owner)}
                        className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-white hover:text-brand border border-transparent hover:border-gray-100 transition-all"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onDelete(owner.id)}
                        className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 border border-transparent hover:border-red-100 transition-all"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                <div>
                    <h3 className="text-base font-bold text-[#1A1A1A]">{owner.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${owner.kyc_status === 'verified' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
                            }`}>
                            {t(`kyc_${owner.kyc_status}`)}
                        </span>
                    </div>
                </div>

                <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-2.5 text-xs text-gray-500">
                        <Mail className="w-4 h-4 text-gray-300" />
                        <span className="font-medium truncate">{owner.email}</span>
                    </div>
                    {owner.phone && (
                        <div className="flex items-center gap-2.5 text-xs text-gray-500">
                            <Phone className="w-4 h-4 text-gray-300" />
                            <span className="font-medium">{owner.phone}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
