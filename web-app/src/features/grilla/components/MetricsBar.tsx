import React from 'react';
import { useTranslation } from '../i18n/I18nContext';

// Props interace kept in case we add real data props later
export const MetricsBar: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div className="mx-2 sm:mx-4 md:mx-6 mt-1.5 mb-0.5 bg-[#2a2a2a] rounded-lg p-1 sm:p-1.5 shadow-sm text-white flex-shrink-0 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2">
                {/* Metric Card 1 */}
                <div className="bg-[#383838] rounded-md p-1 md:p-1.5 hover:bg-[#404040] transition-colors border border-white/5 flex items-center justify-between">
                    <div className="text-[9px] md:text-[10px] text-gray-400 font-medium leading-none">{t('metrics.occupancy')}</div>
                    <div className="text-xs md:text-sm font-bold text-white tracking-tight leading-none">254.0h (88%)</div>
                </div>

                {/* Metric Card 2 */}
                <div className="bg-[#383838] rounded-md p-1 md:p-1.5 hover:bg-[#404040] transition-colors border border-white/5 flex items-center justify-between">
                    <div className="text-[9px] md:text-[10px] text-gray-400 font-medium leading-none">{t('metrics.reservationsToday')}</div>
                    <div className="text-xs md:text-sm font-bold text-white tracking-tight leading-none">160</div>
                </div>

                {/* Metric Card 3 */}
                <div className="bg-[#383838] rounded-md p-1 md:p-1.5 hover:bg-[#404040] transition-colors border border-white/5 flex items-center justify-between">
                    <div className="text-[9px] md:text-[10px] text-gray-400 font-medium leading-none">{t('metrics.newClients')}</div>
                    <div className="text-xs md:text-sm font-bold text-white tracking-tight leading-none">8.89</div>
                </div>

                {/* Metric Card 4 */}
                <div className="bg-[#383838] rounded-md p-1 md:p-1.5 hover:bg-[#404040] transition-colors border border-white/5 flex items-center justify-between">
                    <div className="text-[9px] md:text-[10px] text-gray-400 font-medium leading-none">{t('metrics.revenueToday')}</div>
                    <div className="text-xs md:text-sm font-bold text-white tracking-tight leading-none">€7620</div>
                </div>
            </div>
        </div>
    );
};
