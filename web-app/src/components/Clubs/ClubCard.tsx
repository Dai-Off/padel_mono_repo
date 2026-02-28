import React from 'react';
import { MapPin, Building2, Trash2, Edit, Globe } from 'lucide-react';
import type { Club } from '../../services/club';
import { useTranslation } from 'react-i18next';

interface ClubCardProps {
    club: Club;
    onEdit: (club: Club) => void;
    onDelete: (id: string) => void;
}

export const ClubCard: React.FC<ClubCardProps> = ({ club, onEdit, onDelete }) => {
    const { t } = useTranslation();

    return (
        <div className="group bg-white rounded-[24px] p-5 shadow-sm border border-gray-100 hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => onEdit(club)}
                        className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-white hover:text-brand border border-transparent hover:border-gray-100 transition-all"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onDelete(club.id)}
                        className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 border border-transparent hover:border-red-100 transition-all"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                <div>
                    <h3 className="text-base font-bold text-[#1A1A1A]">{club.name}</h3>
                    <p className="text-xs text-gray-400 font-medium mt-0.5">{club.fiscal_legal_name}</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-50">
                    <div className="flex items-center gap-2.5 text-xs text-gray-500">
                        <MapPin className="w-4 h-4 text-gray-300" />
                        <span className="font-medium truncate">{club.address}, {club.city}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-gray-500">
                        <Globe className="w-4 h-4 text-gray-300" />
                        <span className="font-medium">{club.base_currency}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
