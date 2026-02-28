import React, { useState, useEffect } from 'react';
import { X, Save, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Club } from '../../services/club';
import { clubOwnerService, type ClubOwner } from '../../services/clubOwner';

interface ClubFormProps {
    club?: Club;
    onClose: () => void;
    onSubmit: (data: Partial<Club>) => void;
}

export const ClubForm: React.FC<ClubFormProps> = ({ club, onClose, onSubmit }) => {
    const { t } = useTranslation();
    const [owners, setOwners] = useState<ClubOwner[]>([]);
    const [formData, setFormData] = useState<Partial<Club>>(
        club || {
            name: '',
            owner_id: '',
            fiscal_tax_id: '',
            fiscal_legal_name: '',
            address: '',
            city: '',
            postal_code: '',
            base_currency: 'EUR',
            weekly_schedule: {},
            schedule_exceptions: []
        }
    );

    useEffect(() => {
        clubOwnerService.getAll().then(setOwners).catch(console.error);
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-blue-600" />
                        </div>
                        <h2 className="text-lg font-bold text-[#1A1A1A]">
                            {club ? t('edit_club') : t('add_club')}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                                {t('owner_select')}
                            </label>
                            <select
                                required
                                value={formData.owner_id}
                                onChange={e => setFormData({ ...formData, owner_id: e.target.value })}
                                className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-brand focus:ring-4 focus:ring-brand/5 transition-all text-sm font-semibold outline-none appearance-none"
                            >
                                <option value="">{t('select_option')}</option>
                                {owners.map(owner => (
                                    <option key={owner.id} value={owner.id}>{owner.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                                {t('club_name')}
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-brand transition-all text-sm font-semibold outline-none"
                                placeholder="Ej: Padel Club Madrid"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                                    {t('fiscal_id')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.fiscal_tax_id}
                                    onChange={e => setFormData({ ...formData, fiscal_tax_id: e.target.value })}
                                    className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-brand transition-all text-sm font-semibold outline-none"
                                    placeholder="B00000000"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                                    {t('legal_name')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.fiscal_legal_name}
                                    onChange={e => setFormData({ ...formData, fiscal_legal_name: e.target.value })}
                                    className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-brand transition-all text-sm font-semibold outline-none"
                                    placeholder="Padel S.L."
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                                {t('address')}
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.address}
                                onChange={e => setFormData({ ...formData, address: e.target.value })}
                                className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-brand transition-all text-sm font-semibold outline-none"
                                placeholder="Calle Principal 123"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                                    {t('city')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.city}
                                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                                    className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-brand transition-all text-sm font-semibold outline-none"
                                    placeholder="Madrid"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                                    {t('postal_code')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.postal_code}
                                    onChange={e => setFormData({ ...formData, postal_code: e.target.value })}
                                    className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-brand transition-all text-sm font-semibold outline-none"
                                    placeholder="28001"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-4 rounded-2xl border border-gray-100 font-bold text-gray-400 text-sm hover:bg-gray-50 transition-all active:scale-95"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            type="submit"
                            className="flex-[2] px-4 py-4 rounded-2xl bg-brand text-white font-bold text-sm shadow-lg shadow-brand/20 hover:opacity-90 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            {t('save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
