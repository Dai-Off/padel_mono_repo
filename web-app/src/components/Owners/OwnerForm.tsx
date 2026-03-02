import React, { useState } from 'react';
import { X, Save, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ClubOwner } from '../../services/clubOwner';

interface OwnerFormProps {
    owner?: ClubOwner;
    onClose: () => void;
    onSubmit: (data: Partial<ClubOwner>) => void;
}

export const OwnerForm: React.FC<OwnerFormProps> = ({ owner, onClose, onSubmit }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState<Partial<ClubOwner>>(
        owner || {
            name: '',
            email: '',
            phone: '',
            stripe_connect_account_id: '',
            status: 'active',
            kyc_status: 'pending'
        }
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
                            <ShieldCheck className="w-5 h-5 text-indigo-600" />
                        </div>
                        <h2 className="text-lg font-bold text-[#1A1A1A]">
                            {owner ? t('edit_owner') : t('add_owner')}
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
                                {t('owner_name')}
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-brand focus:ring-4 focus:ring-brand/5 transition-all text-sm font-semibold outline-none"
                                placeholder="Ej: Giovanni Rossi"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-brand transition-all text-sm font-semibold outline-none"
                                    placeholder="name@example.com"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                                    {t('phone')}
                                </label>
                                <input
                                    type="text"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-brand transition-all text-sm font-semibold outline-none"
                                    placeholder="+34 000 000 000"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 px-1">
                                {t('stripe_id')}
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.stripe_connect_account_id}
                                onChange={e => setFormData({ ...formData, stripe_connect_account_id: e.target.value })}
                                className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-brand transition-all text-sm font-semibold outline-none"
                                placeholder="acct_..."
                            />
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
