import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Reservation } from '../types';

interface HoverTooltipProps {
  reservation: Reservation | null;
  anchorElement: HTMLElement | null;
}

export const HoverTooltip: React.FC<HoverTooltipProps> = ({ reservation, anchorElement }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (reservation && anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      
      // Calculate position relative to viewport
      // By default place to the right of the card
      let left = rect.right + 10;
      let top = rect.top;

      // Ensure it doesn't overflow the right edge of the screen
      // Assumes tooltip width is approx 350px
      if (left + 350 > window.innerWidth) {
        left = rect.left - 350 - 10; // Place it to the left if not enough space
      }

      // Ensure it doesn't overflow bottom
      if (top + 200 > window.innerHeight) {
        top = window.innerHeight - 200 - 10;
      }

      setPosition({ top: Math.max(10, top), left: Math.max(10, left) });
    }
  }, [reservation, anchorElement]);

  if (!reservation || !anchorElement) return null;

  const [h, m] = reservation.startTime.split(':').map(Number);
  const endTotalMins = h * 60 + m + reservation.durationMinutes;
  const endH = Math.floor(endTotalMins / 60);
  const endM = endTotalMins % 60;
  const endTimeStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

  const tooltipBody = (
    <div 
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

      {reservation.totalPrice !== undefined && (
        <>
          <hr className="my-2 border-gray-200" />
          <div className="font-semibold text-[15px]">
            Total: {reservation.totalPrice.toFixed(2).replace('.', ',')} €
          </div>
        </>
      )}

      {reservation.detailedPlayers && reservation.detailedPlayers.length > 0 && (
        <>
          <hr className="my-2 border-gray-200" />
          <div className="flex flex-col gap-1.5 text-sm">
            {reservation.detailedPlayers.map((player, idx) => (
              <div key={idx} className="flex flex-wrap items-center">
                <span>{player.name}</span>
                <span className="text-gray-500 ml-1">({player.isMember ? 'Socio' : 'No socio'})</span>
                <span className="text-gray-500 ml-1">(Nivel: {player.level.toFixed(2).replace('.', ',')})</span>
                <span className="ml-1">, Pagado: {player.paidAmount.toFixed(2).replace('.', ',')} €</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return createPortal(tooltipBody, document.body);
};
