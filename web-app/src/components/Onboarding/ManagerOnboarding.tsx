import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    Building2,
    LayoutGrid,
    Clock,
    FileText,
    CreditCard,
    CheckCircle2,
    Circle,
    ArrowLeft,
    Zap,
    Package,
    Headphones,
} from 'lucide-react';
import { Header } from '../Layout/Header';

interface ChecklistItemProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    done?: boolean;
    actionLabel?: string;
    onAction?: () => void;
}

const ChecklistItem: React.FC<ChecklistItemProps> = ({ icon, title, description, done, actionLabel, onAction }) => (
    <div className="flex items-start gap-4 p-4 rounded-2xl bg-white border border-gray-100 hover:border-gray-200 transition-colors">
        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[#1A1A1A]">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
            {done ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
                <>
                    <Circle className="w-5 h-5 text-gray-300" />
                    {onAction && actionLabel && (
                        <button
                            type="button"
                            onClick={onAction}
                            className="text-xs font-semibold text-brand hover:underline"
                        >
                            {actionLabel}
                        </button>
                    )}
                </>
            )}
        </div>
    </div>
);

export const ManagerOnboarding: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-background">
            <Header clubName={t('onboarding_title')} onToggleMenu={() => {}} />
            <main className="max-w-2xl mx-auto px-4 py-8">
                <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1A1A1A] mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t('back')}
                </button>

                <h1 className="text-2xl font-black text-[#1A1A1A] mb-2">{t('onboarding_title')}</h1>
                <p className="text-sm text-gray-500 mb-8">{t('onboarding_subtitle')}</p>

                <section className="mb-10">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                        {t('onboarding_section_config')}
                    </h2>
                    <div className="space-y-3">
                        <ChecklistItem
                            icon={<Building2 className="w-5 h-5" />}
                            title={t('onboarding_general_title')}
                            description={t('onboarding_general_desc')}
                            actionLabel={t('onboarding_complete')}
                            onAction={() => navigate('/')}
                        />
                        <ChecklistItem
                            icon={<LayoutGrid className="w-5 h-5" />}
                            title={t('onboarding_courts_title')}
                            description={t('onboarding_courts_desc')}
                            actionLabel={t('onboarding_complete')}
                            onAction={() => navigate('/')}
                        />
                        <ChecklistItem
                            icon={<Clock className="w-5 h-5" />}
                            title={t('onboarding_schedules_title')}
                            description={t('onboarding_schedules_desc')}
                        />
                        <ChecklistItem
                            icon={<FileText className="w-5 h-5" />}
                            title={t('onboarding_policies_title')}
                            description={t('onboarding_policies_desc')}
                        />
                        <ChecklistItem
                            icon={<CreditCard className="w-5 h-5" />}
                            title={t('onboarding_banking_title')}
                            description={t('onboarding_banking_desc')}
                        />
                    </div>
                </section>

                <section>
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                        {t('onboarding_section_golive')}
                    </h2>
                    <div className="space-y-3">
                        <ChecklistItem
                            icon={<Zap className="w-5 h-5" />}
                            title={t('onboarding_plan_title')}
                            description={t('onboarding_plan_desc')}
                        />
                        <ChecklistItem
                            icon={<CreditCard className="w-5 h-5" />}
                            title={t('onboarding_stripe_title')}
                            description={t('onboarding_stripe_desc')}
                        />
                        <ChecklistItem
                            icon={<Package className="w-5 h-5" />}
                            title={t('onboarding_inventory_title')}
                            description={t('onboarding_inventory_desc')}
                        />
                        <ChecklistItem
                            icon={<Headphones className="w-5 h-5" />}
                            title={t('onboarding_review_title')}
                            description={t('onboarding_review_desc')}
                        />
                    </div>
                </section>
            </main>
        </div>
    );
};
