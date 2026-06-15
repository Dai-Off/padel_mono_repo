import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertTriangle, XCircle, DollarSign } from 'lucide-react';

export const BookingResponsePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');
  const courtName = searchParams.get('court');
  const time = searchParams.get('time');
  const tz = searchParams.get('tz') || 'Europe/Madrid';

  const formatDateTime = (isoStr: string | null) => {
    if (!isoStr) return '';
    try {
      const date = new Date(isoStr);
      return date.toLocaleString('es-ES', {
        timeZone: tz,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'keep_success':
        return (
          <div className="flex flex-col items-center text-center animate-fade-in">
            <div className="p-4 bg-emerald-500/10 rounded-full mb-6 border border-emerald-500/30">
              <CheckCircle className="w-16 h-16 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-extrabold text-white mb-3 tracking-tight">
              ¡Tu reserva se mantiene!
            </h1>
            <p className="text-gray-400 max-w-sm mb-6 leading-relaxed">
              Hemos confirmado tu elección. Tu partido ha sido reubicado de forma segura en una pista libre operativa.
            </p>
            {(courtName || time) && (
              <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-left space-y-3">
                {courtName && (
                  <div>
                    <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Nueva Pista</span>
                    <span className="text-white font-bold text-lg">{courtName}</span>
                  </div>
                )}
                {time && (
                  <div>
                    <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha y Hora</span>
                    <span className="text-white font-semibold">{formatDateTime(time)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'refund_success':
        return (
          <div className="flex flex-col items-center text-center animate-fade-in">
            <div className="p-4 bg-amber-500/10 rounded-full mb-6 border border-amber-500/30">
              <DollarSign className="w-16 h-16 text-amber-500" />
            </div>
            <h1 className="text-2xl font-extrabold text-white mb-3 tracking-tight">
              Reembolso Procesado
            </h1>
            <p className="text-gray-400 max-w-sm leading-relaxed">
              La reserva ha sido cancelada correctamente y se ha ordenado el reembolso total del importe abonado a tu método de pago original o billetera.
            </p>
          </div>
        );

      case 'already_responded':
        return (
          <div className="flex flex-col items-center text-center animate-fade-in">
            <div className="p-4 bg-blue-500/10 rounded-full mb-6 border border-blue-500/30">
              <AlertTriangle className="w-16 h-16 text-blue-500" />
            </div>
            <h1 className="text-2xl font-extrabold text-white mb-3 tracking-tight">
              Enlace ya utilizado
            </h1>
            <p className="text-gray-400 max-w-sm leading-relaxed">
              Ya respondiste a esta solicitud previamente. No es necesario realizar ninguna acción adicional.
            </p>
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center text-center animate-fade-in">
            <div className="p-4 bg-red-500/10 rounded-full mb-6 border border-red-500/30">
              <XCircle className="w-16 h-16 text-red-500" />
            </div>
            <h1 className="text-2xl font-extrabold text-white mb-3 tracking-tight">
              Enlace Inválido
            </h1>
            <p className="text-gray-400 max-w-sm leading-relaxed">
              El enlace de confirmación es inválido, ha caducado o la reserva asociada ya fue cancelada.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#121212] border border-white/[0.06] rounded-3xl p-8 md:p-10 shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-[#F18F34]/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="flex justify-center mb-8 relative z-10">
          <img
            src="https://oxowmfhnorxnabhzkcmi.supabase.co/storage/v1/object/public/public-assets/imagen_2026-04-22_105702379.png"
            alt="WeMatch"
            className="h-12 w-auto object-contain"
          />
        </div>

        <div className="relative z-10">
          {renderContent()}
        </div>

        <div className="mt-10 pt-6 border-t border-white/[0.06] text-center relative z-10">
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} WeMatch Padel. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
};
