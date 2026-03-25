import { useMemo, useRef, useState } from 'react';
import { CheckCircle, QrCode, TrendingUp, UserCheck, XCircle } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import QRCode from 'react-qr-code';
import { useTranslation } from 'react-i18next';

function AnimSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {children}
    </motion.div>
  );
}

function PulseDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <motion.span
        className="absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ backgroundColor: color }}
        animate={{ scale: [1, 1.8, 1], opacity: [0.75, 0, 0.75] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  delay = 0,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  delay?: number;
}) {
  return (
    <AnimSection delay={delay}>
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
            <span style={{ color }}>{icon}</span>
          </div>
          <div>
            <p className="text-lg font-black text-[#1A1A1A]">{value}</p>
            <p className="text-[10px] text-gray-400">{label}</p>
          </div>
        </div>
      </div>
    </AnimSection>
  );
}

export function ClubCheckinTab() {
  const { t } = useTranslation();
  const [checkins] = useState<
    { id: number; player: string; court: string; checkIn: string; checkOut: string | null; status: 'active' | 'completed' | 'no-show'; initials: string }[]
  >([]);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const qrValue = useMemo(() => (qrToken ? `padel://checkin/${qrToken}` : ''), [qrToken]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#1A1A1A]">{t('checkin_title')}</h2>
        <motion.button
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={() => setQrToken(`CHK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold"
        >
          <QrCode className="w-3.5 h-3.5" />
          {t('checkin_generate_qr')}
        </motion.button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('checkin_active_now')} value="0" icon={<CheckCircle className="w-4 h-4" />} color="#22C55E" delay={0} />
        <StatCard label={t('checkin_today')} value="0" icon={<UserCheck className="w-4 h-4" />} color="#5B8DEE" delay={0.05} />
        <StatCard label={t('checkin_no_shows')} value="0" icon={<XCircle className="w-4 h-4" />} color="#E31E24" delay={0.1} />
        <StatCard label={t('checkin_attendance_rate')} value="0%" icon={<TrendingUp className="w-4 h-4" />} color="#8B5CF6" delay={0.15} />
      </div>

      <AnimSection delay={0.2}>
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-xs font-bold text-[#1A1A1A]">{t('checkin_history_today')}</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {checkins.length === 0 && (
              <div className="text-center py-10">
                <p className="text-xs text-gray-400">{t('checkin_empty')}</p>
              </div>
            )}
            {checkins.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">{item.initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#1A1A1A] truncate">{item.player}</p>
                  <p className="text-[10px] text-gray-400">
                    {item.court} • {item.checkIn} - {item.checkOut || '...'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-100 bg-gray-50">
                    <PulseDot color={item.status === 'active' ? '#22C55E' : item.status === 'completed' ? '#5B8DEE' : '#E31E24'} />
                    <span className="text-[10px] font-semibold text-[#1A1A1A]">
                      {item.status === 'active' ? 'En pista' : item.status === 'completed' ? 'OK' : 'No-show'}
                    </span>
                  </div>
                  {item.status === 'active' && (
                    <motion.button whileTap={{ scale: 0.95 }} className="px-2.5 py-1 bg-[#1A1A1A] text-white rounded-lg text-[10px] font-bold">
                      Finalizar
                    </motion.button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </AnimSection>

      {qrToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-gray-200 p-5 shadow-xl">
            <h3 className="text-sm font-bold text-[#1A1A1A] mb-3">{t('checkin_qr_generated')}</h3>
            <div className="bg-white p-4 rounded-xl border border-gray-100 flex justify-center">
              <QRCode value={qrValue} size={180} />
            </div>
            <p className="text-[10px] text-gray-400 mt-3 break-all">{qrToken}</p>
            <p className="text-[10px] text-gray-400 mt-1">{t('checkin_qr_placeholder')}</p>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setQrToken(null)}
                className="px-3.5 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-semibold"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
