import React from 'react';
import type { OnboardingQuestion } from '../../../services/onboardingQuestions';
import { HelpCircle, Layers, Tag, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface QuestionCardProps {
    question: OnboardingQuestion;
    onClick: () => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({ question, onClick }) => {
    const { t } = useTranslation();

    const getPhaseColor = (phase: number) => {
        return phase === 1 ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-purple-50 text-purple-700 border-purple-100';
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'single': return t('admin_single_choice');
            case 'multi': return t('admin_multi_choice');
            case 'order': return t('admin_order_choice');
            default: return type;
        }
    };

    let optionsCount = 0;
    if (Array.isArray(question.options)) {
        optionsCount = question.options.length;
    } else if (question.options?.options && Array.isArray(question.options.options)) {
        optionsCount = question.options.options.length;
    }

    return (
        <div 
            onClick={onClick}
            className={`group relative bg-white rounded-2xl p-4 border border-border-subtle hover:border-primary/20 hover:shadow-xl transition-all cursor-pointer animate-fadeInUp ${!question.is_active ? 'opacity-60 grayscale-[0.5]' : ''}`}
        >
            <div className="flex justify-between items-start mb-3">
                <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${getPhaseColor(question.phase)}`}>
                    {t('admin_question_phase')} {question.phase}
                </div>
                {!question.is_active && (
                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[9px] font-bold uppercase">
                        {t('admin_deactivate_question')}
                    </span>
                )}
            </div>

            <div className="space-y-3">
                <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 group-hover:bg-primary/5 transition-colors">
                        <HelpCircle className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">
                            {question.text}
                        </h3>
                        <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">
                            {question.question_key}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <Layers className="w-3.5 h-3.5" />
                        <span>{getTypeLabel(question.type)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <Tag className="w-3.5 h-3.5" />
                        <span className="capitalize">{question.pool || 'General'}</span>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        {optionsCount} {t('admin_question_options')}
                    </div>
                    <div className="flex items-center gap-1 text-primary group-hover:gap-2 transition-all">
                        <span className="text-xs font-bold">{t('admin_edit_question')}</span>
                        <Eye className="w-4 h-4" />
                    </div>
                </div>
            </div>
        </div>
    );
};
