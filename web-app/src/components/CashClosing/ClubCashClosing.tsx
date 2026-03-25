import { useMemo, useState } from 'react';
import { BarChart3, Calculator, CheckCircle2, History, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type CashBreakdown = {
  bills_500: number;
  bills_200: number;
  bills_100: number;
  bills_50: number;
  bills_20: number;
  bills_10: number;
  bills_5: number;
  coins_2: number;
  coins_1: number;
  coins_050: number;
  coins_020: number;
  coins_010: number;
  coins_005: number;
  coins_002: number;
  coins_001: number;
};

type CashClosingRecord = {
  id: string;
  date: Date;
  employeeName: string;
  realCashTotal: number;
  realCardTotal: number;
  systemCashTotal: number;
  systemCardTotal: number;
  totalDifference: number;
  observations: string;
  status: 'perfect' | 'surplus' | 'deficit';
};

const emptyBreakdown: CashBreakdown = {
  bills_500: 0, bills_200: 0, bills_100: 0, bills_50: 0, bills_20: 0, bills_10: 0, bills_5: 0,
  coins_2: 0, coins_1: 0, coins_050: 0, coins_020: 0, coins_010: 0, coins_005: 0, coins_002: 0, coins_001: 0,
};

const denominations: { key: keyof CashBreakdown; label: string; value: number }[] = [
  { key: 'bills_500', label: '500EUR', value: 500 }, { key: 'bills_200', label: '200EUR', value: 200 }, { key: 'bills_100', label: '100EUR', value: 100 },
  { key: 'bills_50', label: '50EUR', value: 50 }, { key: 'bills_20', label: '20EUR', value: 20 }, { key: 'bills_10', label: '10EUR', value: 10 }, { key: 'bills_5', label: '5EUR', value: 5 },
  { key: 'coins_2', label: '2EUR', value: 2 }, { key: 'coins_1', label: '1EUR', value: 1 }, { key: 'coins_050', label: '0.50EUR', value: 0.5 },
  { key: 'coins_020', label: '0.20EUR', value: 0.2 }, { key: 'coins_010', label: '0.10EUR', value: 0.1 }, { key: 'coins_005', label: '0.05EUR', value: 0.05 },
  { key: 'coins_002', label: '0.02EUR', value: 0.02 }, { key: 'coins_001', label: '0.01EUR', value: 0.01 },
];

export function ClubCashClosingTab() {
  const { t } = useTranslation();
  const [view, setView] = useState<'new' | 'history'>('new');
  const [employeeName, setEmployeeName] = useState('');
  const [observations, setObservations] = useState('');
  const [cardTotal, setCardTotal] = useState('');
  const [cashBreakdown, setCashBreakdown] = useState<CashBreakdown>(emptyBreakdown);
  const [historyRecords, setHistoryRecords] = useState<CashClosingRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const systemCashTotal = 216.16;
  const systemCardTotal = 188.0;

  const realCashTotal = useMemo(
    () => denominations.reduce((acc, d) => acc + (cashBreakdown[d.key] * d.value), 0),
    [cashBreakdown],
  );
  const realCardTotal = Number(cardTotal) || 0;
  const totalDifference = (realCashTotal + realCardTotal) - (systemCashTotal + systemCardTotal);

  const canSave = employeeName.trim() !== '' && (realCashTotal > 0 || realCardTotal > 0);

  const filteredHistory = historyRecords.filter((r) => {
    const q = searchTerm.toLowerCase();
    return r.employeeName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
  });

  const saveClosing = () => {
    if (!canSave) return;
    const status: CashClosingRecord['status'] = Math.abs(totalDifference) < 0.01 ? 'perfect' : totalDifference > 0 ? 'surplus' : 'deficit';
    const record: CashClosingRecord = {
      id: `ARQ-${Date.now()}`,
      date: new Date(),
      employeeName: employeeName.trim(),
      realCashTotal,
      realCardTotal,
      systemCashTotal,
      systemCardTotal,
      totalDifference,
      observations: observations.trim(),
      status,
    };
    setHistoryRecords((prev) => [record, ...prev]);
    setCashBreakdown(emptyBreakdown);
    setCardTotal('');
    setEmployeeName('');
    setObservations('');
    setView('history');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A]">{t('cash_closing_title')}</h2>
          <p className="text-[10px] text-gray-400">{new Date().toLocaleDateString('es-ES')}</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-2xl">
          <button onClick={() => setView('new')} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${view === 'new' ? 'bg-[#1A1A1A] text-white' : 'text-gray-500'}`}>
            <Calculator className="w-3.5 h-3.5" />
            {t('cash_closing_new')}
          </button>
          <button onClick={() => setView('history')} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${view === 'history' ? 'bg-[#1A1A1A] text-white' : 'text-gray-500'}`}>
            <History className="w-3.5 h-3.5" />
            {t('cash_closing_history')}
          </button>
        </div>
      </div>

      {view === 'new' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="text-[10px] text-gray-400 mb-1 font-semibold">{t('cash_counted')}</div>
            <div className="text-lg font-black text-[#1A1A1A]">{realCashTotal.toFixed(2)}€</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="text-[10px] text-gray-400 mb-1 font-semibold">{t('cards')}</div>
            <div className="text-lg font-black text-[#1A1A1A]">{realCardTotal.toFixed(2)}€</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="text-[10px] text-gray-400 mb-1 font-semibold">{t('cash_total_real')}</div>
            <div className="text-lg font-black text-[#1A1A1A]">{(realCashTotal + realCardTotal).toFixed(2)}€</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="text-[10px] text-gray-400 mb-1 font-semibold">{t('cash_difference')}</div>
            <div className={`text-lg font-black flex items-center gap-1 ${
              Math.abs(totalDifference) < 0.01
                ? 'text-green-600'
                : totalDifference > 0
                  ? 'text-blue-600'
                  : 'text-red-600'
            }`}>
              {Math.abs(totalDifference) < 0.01 ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : totalDifference > 0 ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
              {totalDifference > 0 ? '+' : ''}
              {totalDifference.toFixed(2)}€
            </div>
          </div>
        </div>
      )}

      {view === 'new' ? (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-xs font-bold text-[#1A1A1A] mb-4">{t('cash_counting')}</h3>
            <div className="grid md:grid-cols-2 gap-2">
              {denominations.map((d) => (
                <div key={d.key} className="flex items-center gap-2 p-2 rounded-xl border border-gray-100">
                  <div className="w-20 text-xs font-bold text-[#1A1A1A]">{d.label}</div>
                  <input
                    type="number"
                    min={0}
                    value={cashBreakdown[d.key] || ''}
                    onChange={(e) => setCashBreakdown((prev) => ({ ...prev, [d.key]: Math.max(0, parseInt(e.target.value || '0', 10) || 0) }))}
                    className="w-20 px-2 py-1.5 rounded-xl border border-gray-200 text-xs"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-gray-400 ml-auto">{(cashBreakdown[d.key] * d.value).toFixed(2)}€</span>
                </div>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <input
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder={t('cash_employee')}
                className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={cardTotal}
                onChange={(e) => setCardTotal(e.target.value)}
                placeholder={t('cards')}
                className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs"
              />
            </div>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder={t('cash_observations')}
              className="w-full mt-3 px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs resize-none"
              rows={3}
            />
            <button
              onClick={saveClosing}
              disabled={!canSave}
              className="mt-4 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#1A1A1A] text-white disabled:opacity-40"
            >
              {t('cash_save_closing')}
            </button>
          </div>

          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[10px] text-gray-400">{t('cash_total_real')}</p>
              <p className="text-lg font-black text-[#1A1A1A]">{(realCashTotal + realCardTotal).toFixed(2)}€</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[10px] text-gray-400">{t('cash_difference')}</p>
              <p className={`text-lg font-black flex items-center gap-1 ${Math.abs(totalDifference) < 0.01 ? 'text-green-600' : totalDifference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {Math.abs(totalDifference) < 0.01 ? <CheckCircle2 className="w-5 h-5" /> : totalDifference > 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {totalDifference > 0 ? '+' : ''}
                {totalDifference.toFixed(2)}€
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('cash_search_placeholder')}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs"
              />
            </div>
          </div>
          {filteredHistory.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <BarChart3 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-xs font-bold text-[#1A1A1A]">{t('cash_no_records')}</p>
            </div>
          ) : (
            filteredHistory.map((record) => (
              <div key={record.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-xs font-bold text-[#1A1A1A]">{record.id}</p>
                <p className="text-[10px] text-gray-400 mt-1">{record.employeeName} • {record.date.toLocaleString('es-ES')}</p>
                <p className="text-[10px] text-gray-500 mt-2">
                  Real: {(record.realCashTotal + record.realCardTotal).toFixed(2)}€ • Sistema: {(record.systemCashTotal + record.systemCardTotal).toFixed(2)}€
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
