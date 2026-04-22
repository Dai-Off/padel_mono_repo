import { useNavigate } from 'react-router-dom';
import { Calculator, TrendingUp } from 'lucide-react';

export function CajaHubTab() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Caja</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => navigate('/cierreCaja')}
          className="flex flex-col items-start gap-3 p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all text-left group"
        >
          <div className="p-3 rounded-xl bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
            <Calculator size={24} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">Cierre de caja</p>
            <p className="text-sm text-gray-500 mt-0.5">Arqueo, apertura y cierre del día</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/movimientos-caja')}
          className="flex flex-col items-start gap-3 p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all text-left group"
        >
          <div className="p-3 rounded-xl bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
            <TrendingUp size={24} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">Movimientos de caja</p>
            <p className="text-sm text-gray-500 mt-0.5">Pagos, devoluciones y anulaciones del día</p>
          </div>
        </button>
      </div>
    </div>
  );
}
