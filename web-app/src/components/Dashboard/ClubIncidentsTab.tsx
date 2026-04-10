import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  XCircle,
  Clock,
  Calendar,
  User,
  Phone,
  Mail,
  Search,
  Plus,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Euro,
  MessageSquare,
  X,
  Save,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageSpinner } from '../Layout/PageSpinner';
import {
  clubIncidentsService,
  type ClubIncidentDto,
  type ClubIncidentDistribution,
  type ClubIncidentMonthSummary,
  type ClubIncidentPlayerRow,
  type IncidentSeverity,
  type IncidentType,
} from '../../services/clubIncidents';
import { clubClientService } from '../../services/clubClients';
import type { Player } from '../../types/api';

type Props = { clubId: string | null; clubResolved: boolean };

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

function formatShortDate(iso: string, locale: string) {
  try {
    return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatTime(iso: string, locale: string) {
  try {
    return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function TypeBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  return (
    <div ref={ref}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-[#1A1A1A]">{label}</span>
        <span className="text-[10px] text-gray-400">
          {count} ({Math.round(pct)}%)
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <motion.div
          className="h-1.5 rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={isInView ? { width: `${pct}%` } : {}}
          transition={{ duration: 0.6 }}
        />
      </div>
    </div>
  );
}

function PolicyRule({ condition, action, active }: { condition: string; action: string; active: boolean }) {
  return (
    <div className="flex items-start gap-2.5 p-3 bg-gray-50 rounded-xl">
      {active ? (
        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
      )}
      <div>
        <p className="text-[10px] font-bold text-[#1A1A1A]">{condition}</p>
        <p className="text-[9px] text-gray-400">→ {action}</p>
      </div>
    </div>
  );
}

function IncidentCard({
  incident,
  compact = false,
  locale,
  typeLabel,
  sevLabel,
}: {
  incident: ClubIncidentDto;
  compact?: boolean;
  locale: string;
  typeLabel: (t: IncidentType) => string;
  sevLabel: (s: IncidentSeverity) => string;
}) {
  const typeIcons: Record<string, React.ReactNode> = {
    no_show: <XCircle className="w-4 h-4 text-red-500" />,
    late_cancel: <Clock className="w-4 h-4 text-orange-500" />,
    damage: <AlertTriangle className="w-4 h-4 text-purple-500" />,
    complaint: <MessageSquare className="w-4 h-4 text-gray-500" />,
  };
  const sevColors: Record<string, { bg: string; dot: string }> = {
    low: { bg: 'bg-yellow-50 text-yellow-600 border-yellow-100', dot: '#EAB308' },
    medium: { bg: 'bg-orange-50 text-orange-600 border-orange-100', dot: '#F59E0B' },
    high: { bg: 'bg-red-50 text-red-500 border-red-100', dot: '#E31E24' },
  };
  const p = incident.subject_player;
  const name = `${p.first_name} ${p.last_name}`.trim();
  const phone = p.phone ?? '';
  const when = incident.booking?.start_at ?? incident.created_at;
  const court = incident.booking?.court_name ?? '—';

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl">
        <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center flex-shrink-0">
          {typeIcons[incident.incident_type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-[#1A1A1A] truncate">{name}</p>
          <p className="text-[9px] text-gray-400">
            {formatShortDate(when, locale)} • {court}
          </p>
        </div>
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[9px] font-bold ${sevColors[incident.severity].bg}`}
        >
          <PulseDot color={sevColors[incident.severity].dot} />
          {sevLabel(incident.severity)}
        </div>
      </div>
    );
  }

  const costEur =
    incident.cost_cents != null ? (incident.cost_cents / 100).toFixed(2) : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
          {typeIcons[incident.incident_type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-bold text-[#1A1A1A]">{typeLabel(incident.incident_type)}</span>
            <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-bold ${sevColors[incident.severity].bg}`}>
              {sevLabel(incident.severity)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <strong className="text-[#1A1A1A]">{name}</strong>
            </span>
            {phone ? (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {phone}
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatShortDate(when, locale)} • {formatTime(when, locale)} • {court}
            </span>
            {incident.booking_id ? (
              <span className="text-[9px] text-gray-300 break-all">ID: {incident.booking_id}</span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="bg-gray-50 rounded-xl p-3">
        <p className="text-[10px] text-gray-500 whitespace-pre-wrap">{incident.description}</p>
        {costEur != null ? (
          <p className="text-[10px] font-bold text-[#1A1A1A] mt-1 flex items-center gap-1">
            <Euro className="w-3 h-3" />
            {costEur} €
          </p>
        ) : null}
        {incident.resolution ? (
          <p className="text-[9px] text-green-600 font-semibold mt-1">✓ {incident.resolution}</p>
        ) : null}
      </div>
    </div>
  );
}

function PlayerCard({
  player,
  locale,
  t,
}: {
  player: ClubIncidentPlayerRow;
  locale: string;
  t: (k: string, o?: Record<string, string | number>) => string;
}) {
  const statusCfg: Record<string, { dot: string; label: string }> = {
    active: { dot: '#22C55E', label: t('incidents_status_active') },
    warning: { dot: '#EAB308', label: t('incidents_status_warning') },
    restricted: { dot: '#F59E0B', label: t('incidents_status_restricted') },
    blocked: { dot: '#E31E24', label: t('incidents_status_blocked') },
  };
  const riskCfg: Record<string, { bg: string; label: string }> = {
    low: { bg: 'bg-green-50 text-green-600', label: t('incidents_risk_low') },
    medium: { bg: 'bg-orange-50 text-orange-600', label: t('incidents_risk_medium') },
    high: { bg: 'bg-red-50 text-red-500', label: t('incidents_risk_high') },
  };
  const parts = player.player_name.split(/\s+/).filter(Boolean);
  const initials = parts.map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const totalInc =
    player.incidents.late_cancel +
    player.incidents.no_show +
    player.incidents.damage +
    player.incidents.complaint;
  const attendance =
    player.total_bookings > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(((player.total_bookings - player.incidents.no_show) / player.total_bookings) * 100),
          ),
        )
      : 100;
  const st = statusCfg[player.status] ?? statusCfg.active;
  const rk = riskCfg[player.risk_level] ?? riskCfg.low;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">{initials || '?'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <p className="text-xs font-bold text-[#1A1A1A]">{player.player_name}</p>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-1">
                <PulseDot color={st.dot} />
                <span className="text-[10px] text-gray-400 font-semibold">{st.label}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${rk.bg}`}>
                {t('incidents_risk_label')} {rk.label}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-[10px] text-gray-400">
            {player.player_phone ? (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {player.player_phone}
              </span>
            ) : null}
            {player.player_email ? (
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {player.player_email}
              </span>
            ) : null}
            {player.join_date ? (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {t('incidents_since')} {formatShortDate(player.join_date, locale)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { v: player.total_bookings, l: t('incidents_stat_bookings') },
          { v: totalInc, l: t('incidents_stat_incidents') },
          { v: player.incidents.no_show, l: t('incidents_stat_noshows') },
          { v: `${attendance}%`, l: t('incidents_stat_attendance') },
        ].map((s, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-2.5 text-center">
            <p className="text-sm font-black text-[#1A1A1A]">{s.v}</p>
            <p className="text-[9px] text-gray-400">{s.l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PoliciesView({ t }: { t: (k: string) => string }) {
  const sections = [
    {
      title: t('incidents_policy_noshow_title'),
      icon: <XCircle className="w-4 h-4 text-red-500" />,
      color: '#E31E24',
      rules: [
        { condition: t('incidents_policy_noshow_r1c'), action: t('incidents_policy_noshow_r1a'), active: true },
        { condition: t('incidents_policy_noshow_r2c'), action: t('incidents_policy_noshow_r2a'), active: true },
        { condition: t('incidents_policy_noshow_r3c'), action: t('incidents_policy_noshow_r3a'), active: true },
      ],
    },
    {
      title: t('incidents_policy_late_title'),
      icon: <Clock className="w-4 h-4 text-orange-500" />,
      color: '#F59E0B',
      rules: [
        { condition: t('incidents_policy_late_r1c'), action: t('incidents_policy_late_r1a'), active: true },
        { condition: t('incidents_policy_late_r2c'), action: t('incidents_policy_late_r2a'), active: true },
        { condition: t('incidents_policy_late_r3c'), action: t('incidents_policy_late_r3a'), active: false },
      ],
    },
    {
      title: t('incidents_policy_damage_title'),
      icon: <AlertTriangle className="w-4 h-4 text-purple-500" />,
      color: '#8B5CF6',
      rules: [
        { condition: t('incidents_policy_damage_r1c'), action: t('incidents_policy_damage_r1a'), active: true },
        { condition: t('incidents_policy_damage_r2c'), action: t('incidents_policy_damage_r2a'), active: true },
        { condition: t('incidents_policy_damage_r3c'), action: t('incidents_policy_damage_r3a'), active: true },
      ],
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-4"
    >
      {sections.map((sec, i) => (
        <AnimSection key={sec.title} delay={i * 0.05}>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${sec.color}15` }}
              >
                {sec.icon}
              </div>
              <h3 className="text-xs font-bold text-[#1A1A1A]">{sec.title}</h3>
            </div>
            <div className="space-y-2">
              {sec.rules.map((r, j) => (
                <PolicyRule key={j} condition={r.condition} action={r.action} active={r.active} />
              ))}
            </div>
          </div>
        </AnimSection>
      ))}
      <AnimSection delay={0.15}>
        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-blue-600" />
            </div>
            <h3 className="text-xs font-bold text-[#1A1A1A]">{t('incidents_auto_title')}</h3>
          </div>
          <ul className="space-y-1.5 text-[10px] text-gray-500">
            {(
              [
                'incidents_auto_1',
                'incidents_auto_2',
                'incidents_auto_3',
                'incidents_auto_4',
              ] as const
            ).map((key) => (
              <li key={key} className="flex items-start gap-1.5">
                <CheckCircle className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
      </AnimSection>
    </motion.div>
  );
}

function DashboardView({
  month,
  distribution,
  recent,
  locale,
  typeLabel,
  sevLabel,
  t,
}: {
  month: ClubIncidentMonthSummary;
  distribution: ClubIncidentDistribution;
  recent: ClubIncidentDto[];
  locale: string;
  typeLabel: (x: IncidentType) => string;
  sevLabel: (s: IncidentSeverity) => string;
  t: (k: string, o?: Record<string, string | number>) => string;
}) {
  const total = month.total || 1;
  const stats = [
    {
      label: t('incidents_dash_month_total'),
      value: String(month.total),
      icon: <AlertTriangle className="w-4 h-4" />,
      color: '#E31E24',
    },
    {
      label: t('incidents_dash_alert_players'),
      value: String(month.players_in_alert),
      icon: <AlertCircle className="w-4 h-4" />,
      color: '#F59E0B',
    },
    {
      label: t('incidents_dash_noshows_month'),
      value: String(month.no_shows),
      icon: <XCircle className="w-4 h-4" />,
      color: '#DC2626',
    },
    {
      label: t('incidents_dash_attendance'),
      value: `${month.attendance_rate_pct}%`,
      icon: <CheckCircle className="w-4 h-4" />,
      color: '#22C55E',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-4"
    >
      <div className="relative overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(160deg, #1A1A1A 0%, #2A2A2A 100%)' }}>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-4">
            <PulseDot color="#E31E24" />
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">
              {t('incidents_dash_hero')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                className="p-3.5 rounded-2xl bg-white/5 border border-white/5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${stat.color}20` }}
                  >
                    <span style={{ color: stat.color }}>{stat.icon}</span>
                  </div>
                </div>
                <p className="text-xl font-black text-white">{stat.value}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnimSection>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-xs font-bold text-[#1A1A1A] mb-4">{t('incidents_recent')}</h3>
            <div className="space-y-2">
              {recent.length ? (
                recent.map((inc) => (
                  <IncidentCard
                    key={inc.id}
                    incident={inc}
                    compact
                    locale={locale}
                    typeLabel={typeLabel}
                    sevLabel={sevLabel}
                  />
                ))
              ) : (
                <p className="text-xs text-gray-400 text-center py-6">{t('incidents_empty')}</p>
              )}
            </div>
          </div>
        </AnimSection>
        <AnimSection delay={0.05}>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-xs font-bold text-[#1A1A1A] mb-4">{t('incidents_by_type')}</h3>
            <div className="space-y-4">
              <TypeBar label={t('incidents_type_no_show')} count={distribution.no_show} total={total} color="#DC2626" />
              <TypeBar label={t('incidents_type_late_cancel')} count={distribution.late_cancel} total={total} color="#F59E0B" />
              <TypeBar label={t('incidents_type_damage')} count={distribution.damage} total={total} color="#E31E24" />
              <TypeBar label={t('incidents_type_complaint')} count={distribution.complaint} total={total} color="#6B7280" />
            </div>
          </div>
        </AnimSection>
      </div>

      <AnimSection delay={0.1}>
        <div className="bg-[#E31E24]/5 rounded-2xl border border-[#E31E24]/10 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#E31E24]/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-[#E31E24]" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#1A1A1A] mb-2">{t('incidents_active_policies')}</h3>
              <ul className="space-y-1 text-[10px] text-gray-500">
                <li>• {t('incidents_policy_hint_1')}</li>
                <li>• {t('incidents_policy_hint_2')}</li>
                <li>• {t('incidents_policy_hint_3')}</li>
              </ul>
            </div>
          </div>
        </div>
      </AnimSection>
    </motion.div>
  );
}

function AddIncidentModal({
  onClose,
  clubId,
  onSaved,
  t,
  typeLabel,
}: {
  onClose: () => void;
  clubId: string;
  onSaved: () => void;
  t: (k: string) => string;
  typeLabel: (x: IncidentType) => string;
}) {
  const [playerQ, setPlayerQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Player[]>([]);
  const [selected, setSelected] = useState<Player | null>(null);
  const [incidentType, setIncidentType] = useState<IncidentType | ''>('');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [bookingId, setBookingId] = useState('');
  const [description, setDescription] = useState('');
  const [costEur, setCostEur] = useState('');
  const [saving, setSaving] = useState(false);

  const normalizePhone = useCallback((value: string) => value.replace(/\D/g, ''), []);

  useEffect(() => {
    if (!playerQ.trim() || selected) {
      setResults([]);
      return;
    }
    setSearching(true);
    const tmr = window.setTimeout(() => {
      void (async () => {
        try {
          const list = await clubClientService.list(clubId, playerQ);
          const qName = playerQ.trim().toLowerCase();
          const qPhone = normalizePhone(playerQ);
          const withPhoneFallback =
            qPhone.length >= 3
              ? list.filter((p) => normalizePhone(p.phone ?? '').includes(qPhone))
              : [];
          const merged = [...list, ...withPhoneFallback];
          const unique = new Map<string, Player>();
          for (const p of merged) {
            const name = `${p.first_name} ${p.last_name}`.toLowerCase();
            const phone = normalizePhone(p.phone ?? '');
            if (!name.includes(qName) && !(qPhone && phone.includes(qPhone))) continue;
            unique.set(p.id, p);
          }
          setResults([...unique.values()].slice(0, 20));
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 320);
    return () => window.clearTimeout(tmr);
  }, [playerQ, clubId, selected, normalizePhone]);

  const submit = async () => {
    if (!selected || !incidentType || !description.trim()) {
      toast.error(t('incidents_form_required'));
      return;
    }
    let cost_cents: number | null = null;
    if (costEur.trim()) {
      const n = Number(costEur.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) {
        toast.error(t('incidents_form_cost_invalid'));
        return;
      }
      cost_cents = Math.round(n * 100);
    }
    setSaving(true);
    try {
      await clubIncidentsService.create({
        club_id: clubId,
        subject_player_id: selected.id,
        incident_type: incidentType as IncidentType,
        severity,
        description: description.trim(),
        booking_id: bookingId.trim() || null,
        cost_cents,
      });
      toast.success(t('incidents_saved'));
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || t('incidents_save_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 max-h-[90vh] overflow-auto"
      >
        <div className="sticky top-0 bg-white rounded-t-3xl pt-3 pb-3 border-b border-gray-50 z-10 px-5">
          <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1A1A1A]">{t('incidents_add_title')}</h2>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {t('incidents_form_player')}
            </label>
            {selected ? (
              <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl">
                <span className="text-xs font-semibold text-[#1A1A1A]">
                  {selected.first_name} {selected.last_name}
                </span>
                <button type="button" className="text-[10px] text-[#E31E24] font-bold" onClick={() => setSelected(null)}>
                  {t('incidents_change_player')}
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={playerQ}
                  onChange={(e) => setPlayerQ(e.target.value)}
                  placeholder={t('incidents_form_player_ph')}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-[#1A1A1A] placeholder-gray-300"
                />
                {searching ? (
                  <div className="flex justify-center py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                ) : results.length ? (
                  <ul className="mt-2 max-h-40 overflow-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {results.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                          onClick={() => {
                            setSelected(p);
                            setPlayerQ('');
                            setResults([]);
                          }}
                        >
                          {p.first_name} {p.last_name}
                          {p.phone ? <span className="text-gray-400 ml-1">{p.phone}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {t('incidents_form_type')}
            </label>
            <select
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value as IncidentType | '')}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-[#1A1A1A]"
            >
              <option value="">{t('incidents_form_type_ph')}</option>
              {(['no_show', 'late_cancel', 'damage', 'complaint'] as const).map((k) => (
                <option key={k} value={k}>
                  {typeLabel(k)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {t('incidents_form_severity')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={`px-3 py-2.5 border rounded-2xl text-xs font-bold text-[#1A1A1A] transition-all ${
                    severity === s
                      ? 'border-[#E31E24] bg-red-50'
                      : 'border-gray-100 hover:border-orange-200 hover:bg-orange-50/50'
                  }`}
                >
                  {t(`incidents_sev_${s}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {t('incidents_form_booking')}
            </label>
            <input
              type="text"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              placeholder={t('incidents_form_booking_ph')}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-[#1A1A1A] placeholder-gray-300 font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {t('incidents_form_desc')}
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('incidents_form_desc_ph')}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-[#1A1A1A] placeholder-gray-300 resize-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {t('incidents_form_cost')}
            </label>
            <div className="relative">
              <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <input
                type="text"
                inputMode="decimal"
                value={costEur}
                onChange={(e) => setCostEur(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-[#1A1A1A] placeholder-gray-300"
              />
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-50 px-5 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-gray-100 rounded-2xl text-xs font-bold text-[#1A1A1A]"
          >
            {t('cancel')}
          </button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            disabled={saving}
            onClick={() => void submit()}
            className="flex-1 py-3 bg-[#E31E24] text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t('incidents_save')}
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}

export function ClubIncidentsTab({ clubId, clubResolved }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : i18n.language?.startsWith('en') ? 'en-GB' : 'es-ES';

  const typeLabel = useCallback(
    (x: IncidentType) => t(`incidents_type_${x}`),
    [t],
  );
  const sevLabel = useCallback(
    (s: IncidentSeverity) => t(`incidents_sev_${s}`),
    [t],
  );

  const [activeView, setActiveView] = useState<'dashboard' | 'incidents' | 'players' | 'policies'>('dashboard');
  const [showAdd, setShowAdd] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    month: ClubIncidentMonthSummary;
    distribution: ClubIncidentDistribution;
    recent: ClubIncidentDto[];
    players: ClubIncidentPlayerRow[];
  } | null>(null);

  const [list, setList] = useState<ClubIncidentDto[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      const data = await clubIncidentsService.getSummary(clubId);
      setSummary({
        month: data.month,
        distribution: data.distribution,
        recent: data.recent,
        players: data.players,
      });
    } catch {
      toast.error(t('incidents_load_error'));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [clubId, t]);

  const loadList = useCallback(async () => {
    if (!clubId) return;
    setListLoading(true);
    try {
      const items = await clubIncidentsService.list(clubId, {
        incident_type: filterType === 'all' ? undefined : (filterType as IncidentType),
        severity: filterSeverity === 'all' ? undefined : (filterSeverity as IncidentSeverity),
        limit: 400,
      });
      setList(items);
    } catch {
      toast.error(t('incidents_load_error'));
      setList([]);
    } finally {
      setListLoading(false);
    }
  }, [clubId, filterType, filterSeverity, t]);

  useEffect(() => {
    if (!clubResolved) return;
    if (!clubId) {
      setLoading(false);
      setSummary(null);
      return;
    }
    void loadSummary();
  }, [clubResolved, clubId, loadSummary]);

  useEffect(() => {
    if (!clubId || activeView !== 'incidents') return;
    void loadList();
  }, [clubId, activeView, loadList]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i) => {
      const name = `${i.subject_player.first_name} ${i.subject_player.last_name}`.toLowerCase();
      const phone = (i.subject_player.phone ?? '').toLowerCase();
      const bid = (i.booking_id ?? '').toLowerCase();
      return name.includes(q) || phone.includes(q) || bid.includes(q);
    });
  }, [list, searchQuery]);

  const views = useMemo(() => {
    const incCount = summary?.month.total_all_time ?? summary?.month.total ?? 0;
    const alertCount = summary?.players.filter((p) => p.risk_level !== 'low').length ?? 0;
    return [
      { id: 'dashboard' as const, icon: <TrendingUp className="w-4 h-4" />, label: t('incidents_tab_dashboard') },
      {
        id: 'incidents' as const,
        icon: <AlertTriangle className="w-4 h-4" />,
        label: t('incidents_tab_list'),
        badge: incCount,
      },
      {
        id: 'players' as const,
        icon: <User className="w-4 h-4" />,
        label: t('incidents_tab_players'),
        badge: alertCount,
      },
      { id: 'policies' as const, icon: <AlertCircle className="w-4 h-4" />, label: t('incidents_tab_policies') },
    ];
  }, [summary, t]);

  if (!clubResolved || loading) {
    return <PageSpinner />;
  }

  if (!clubId) {
    return (
      <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-5 text-sm text-amber-900">
        {t('incidents_no_club')}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-600">
        {t('incidents_load_error')}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold text-[#1A1A1A]">{t('incidents_page_title')}</h2>
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E31E24] text-white rounded-xl text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('incidents_add_short')}</span>
        </motion.button>
      </div>

      <div className="flex gap-1.5 p-1 bg-gray-100 rounded-2xl overflow-x-auto">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setActiveView(v.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeView === v.id ? 'bg-[#1A1A1A] text-white shadow-sm' : 'text-gray-500 hover:text-[#1A1A1A]'
            }`}
          >
            {v.icon}
            {v.label}
            {v.badge !== undefined ? (
              <span
                className={`px-1.5 py-0.5 rounded-lg text-[9px] font-black ${
                  activeView === v.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {v.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeView === 'dashboard' && (
          <DashboardView
            key="dashboard"
            month={summary.month}
            distribution={summary.distribution}
            recent={summary.recent}
            locale={locale}
            typeLabel={typeLabel}
            sevLabel={sevLabel}
            t={t}
          />
        )}
        {activeView === 'incidents' && (
          <motion.div
            key="incidents"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input
                  type="text"
                  placeholder={t('incidents_search_ph')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#E31E24]/30 text-xs text-[#1A1A1A] placeholder-gray-300"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-[#1A1A1A]"
              >
                <option value="all">{t('incidents_filter_all_types')}</option>
                <option value="no_show">{typeLabel('no_show')}</option>
                <option value="late_cancel">{typeLabel('late_cancel')}</option>
                <option value="damage">{typeLabel('damage')}</option>
                <option value="complaint">{typeLabel('complaint')}</option>
              </select>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-[#1A1A1A]"
              >
                <option value="all">{t('incidents_filter_all_sev')}</option>
                <option value="low">{sevLabel('low')}</option>
                <option value="medium">{sevLabel('medium')}</option>
                <option value="high">{sevLabel('high')}</option>
              </select>
            </div>
            {listLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
              </div>
            ) : (
              <div className="space-y-3">
                {filteredList.length ? (
                  filteredList.map((inc) => (
                    <IncidentCard
                      key={inc.id}
                      incident={inc}
                      locale={locale}
                      typeLabel={typeLabel}
                      sevLabel={sevLabel}
                    />
                  ))
                ) : (
                  <div className="text-center py-12">
                    <AlertTriangle className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">{t('incidents_none_filtered')}</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
        {activeView === 'players' && (
          <motion.div
            key="players"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {summary.players.length ? (
              summary.players.map((p) => <PlayerCard key={p.player_id} player={p} locale={locale} t={t} />)
            ) : (
              <p className="text-center text-xs text-gray-400 py-12">{t('incidents_players_empty')}</p>
            )}
          </motion.div>
        )}
        {activeView === 'policies' && <PoliciesView key="policies" t={t} />}
      </AnimatePresence>

      <AnimatePresence>
        {showAdd && (
          <AddIncidentModal
            clubId={clubId}
            onClose={() => setShowAdd(false)}
            onSaved={() => {
              void loadSummary();
              void loadList();
            }}
            t={t}
            typeLabel={typeLabel}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
