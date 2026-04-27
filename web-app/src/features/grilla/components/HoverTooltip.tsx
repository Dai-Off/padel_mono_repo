import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, CreditCard, Wallet } from 'lucide-react';
import type { Reservation } from '../types';

interface HoverTooltipProps {
  reservation: Reservation | null;
  anchorElement: HTMLElement | null;
}

export const HoverTooltip: React.FC<HoverTooltipProps> = ({ reservation, anchorElement }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!reservation || !anchorElement) return;
    const rect = anchorElement.getBoundingClientRect();
    const tooltipW = 350;
    const tooltipH = tooltipRef.current?.offsetHeight ?? 300;
    const pad = 10;

    let left = rect.right + pad;
    if (left + tooltipW > window.innerWidth) {
      left = rect.left - tooltipW - pad;
    }

    let top = rect.top;
    if (top + tooltipH > window.innerHeight - pad) {
      top = window.innerHeight - tooltipH - pad;
    }

    const newTop = Math.max(pad, top);
    const newLeft = Math.max(pad, left);
    setPosition(prev => (prev.top === newTop && prev.left === newLeft) ? prev : { top: newTop, left: newLeft });
  }, [reservation, anchorElement]);

  if (!reservation || !anchorElement) return null;

  const [h, m] = reservation.startTime.split(':').map(Number);
  const endTotalMins = h * 60 + m + reservation.durationMinutes;
  const endH = Math.floor(endTotalMins / 60);
  const endM = endTotalMins % 60;
  const endTimeStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

  const tooltipBody = (
    <div
      ref={tooltipRef}
      className="fixed z-[100] bg-white text-gray-800 rounded-lg shadow-xl border border-gray-100 p-4 w-[350px] font-sans pointer-events-none transition-opacity duration-200"
      style={{ top: position.top, left: position.left }}
    >
      <div className="mb-3 text-[15px]">
        <div className="font-semibold">{reservation.startTime} - {endTimeStr}</div>
        <div className="mt-1">{reservation.matchType || reservation.playerName}</div>
        {reservation.playerEmail && (
          <div className="text-sm text-gray-500">{reservation.playerEmail}</div>
        )}
      </div>

      {reservation.totalPrice !== undefined && (() => {
        const totalCents = Math.round(reservation.totalPrice! * 100);
        const paidCents = reservation.totalPaidCents ?? 0;
        const pendingCents = Math.max(0, totalCents - paidCents);
        return (
          <>
            <hr className="my-2 border-gray-200" />
            <div className="flex flex-col gap-1 text-[14px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Valor reserva:</span>
                <span className="font-semibold">{reservation.totalPrice!.toFixed(2).replace('.', ',')} €</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total pagado:</span>
                <span className={`font-semibold ${paidCents > 0 ? 'text-emerald-600' : ''}`}>{(paidCents / 100).toFixed(2).replace('.', ',')} €</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Saldo restante:</span>
                <span className={`font-semibold ${pendingCents > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{(pendingCents / 100).toFixed(2).replace('.', ',')} €</span>
              </div>
            </div>
          </>
        );
      })()}

      {reservation.detailedPlayers && reservation.detailedPlayers.length > 0 && (
        <>
          <hr className="my-2 border-gray-200" />
          <div className="text-[13px] font-semibold text-gray-600 mb-1.5">Jugadores ({reservation.detailedPlayers.length})</div>
          <div className="flex flex-col gap-1.5 text-[13px]">
            {reservation.detailedPlayers.map((player, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                    {player.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-gray-800 truncate">{player.name}</span>
                  {reservation.booking_type !== 'tournament' && (
                    <>
                      <span className="text-gray-500 text-[11px] ml-1">({player.isMember ? 'Socio' : 'No socio'})</span>
                      <span className="text-gray-500 text-[11px] ml-1">(Nivel: {player.level.toFixed(2).replace('.', ',')})</span>
                    </>
                  )}
                </div>
                {reservation.booking_type === 'tournament' ? (
                  <span className="text-[11px] font-semibold text-emerald-600 shrink-0">Inscripto</span>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {player.paidAmount > 0 && player.paymentMethod && (
                      <span className="flex items-center gap-0.5 text-[11px] text-gray-500" title={
                        player.paymentMethod === 'cash' ? 'Efectivo' : player.paymentMethod === 'card' ? 'Tarjeta' : 'Wallet'
                      }>
                        {player.paymentMethod === 'cash' && <Banknote size={12} />}
                        {player.paymentMethod === 'card' && <CreditCard size={12} />}
                        {player.paymentMethod === 'wallet' && <Wallet size={12} />}
                      </span>
                    )}
                    <span className={`font-semibold ${player.paidAmount > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {player.paidAmount > 0 ? `${player.paidAmount.toFixed(2).replace('.', ',')} €` : 'Sin pago'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return createPortal(tooltipBody, document.body);
};
