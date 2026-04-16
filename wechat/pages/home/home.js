const { getSession, clearSession } = require('../../utils/storage');
const { fetchMatches } = require('../../api/matches');
const { fetchHomeStats } = require('../../api/home');
const { fetchMyPlayerId } = require('../../api/players');
const { mapMatchToPartido } = require('../../utils/mapMatchToPartido');
const { selectMyUpcomingMatches } = require('../../utils/selectMyUpcomingMatches');

const PLACEHOLDER_URIS = [
  'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400&h=300&fit=crop',
];

const DASH = '—';

function pickPlaceholderUri(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i += 1) h += s.charCodeAt(i);
  return PLACEHOLDER_URIS[h % PLACEHOLDER_URIS.length];
}

function durationHuman(raw) {
  const match = /^(\d+)/.exec(String(raw || '').trim());
  if (!match) return raw || '';
  const n = parseInt(match[1], 10);
  if (Number.isNaN(n)) return raw || '';
  if (n < 60) return `${n} min`;
  const hh = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return hh === 1 ? '1 hora' : `${hh} horas`;
  return `${hh} hora${hh > 1 ? 's' : ''} ${m} minutos`;
}

function enrichPartidoCard(p) {
  const parts = String(p.dateTime || '').split(' · ');
  const datePart = (parts[0] && parts[0].trim()) || DASH;
  const timePart = parts.length >= 2 ? (parts[1] && parts[1].trim()) || '' : '';
  const libres = (p.players || []).filter((x) => x.isFree).length;
  return Object.assign({}, p, {
    cardImage: pickPlaceholderUri(p.id),
    datePart,
    timePart,
    libres,
    durationLabel: durationHuman(p.duration || ''),
  });
}

function countLine(loading, value, singular, plural) {
  if (loading) return DASH;
  if (value == null || Number.isNaN(value)) return DASH;
  const n = Math.max(0, Math.floor(value));
  return `${n} ${n === 1 ? singular : plural}`;
}

function proximosSubtitle(loading, count) {
  if (loading && count === 0) return 'Cargando…';
  if (count === 1) return '1 reserva confirmada';
  return `${count} reservas confirmadas`;
}

function enDirectoSubtitleLine(loading, count) {
  if (loading) return 'Buscando partidos en curso…';
  if (count === 0) return 'Nadie en pista en este momento';
  return `${count} partido${count === 1 ? '' : 's'} en curso`;
}

Page({
  data: {
    statusBarHeight: 20,
    carouselCardWidthRpx: 560,
    dash: DASH,
    weekLabels: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
    seasonBarPct: 0,
    leagueBarPct: 0,
    matchesLoading: true,
    statsLoading: true,
    misProximos: [],
    partidosAll: [],
    partidosLive: [],
    stats: null,
    showProximosSection: false,
    proximosSubtitle: '',
    enDirectoSubtitle: 'Buscando partidos en curso…',
    buscarSub: DASH,
    pistasSub: DASH,
    torneosSub: DASH,
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    const w = sys.windowWidth || 375;
    const pad = 48 / (750 / w);
    const cardPx = Math.min(300, Math.max(200, w - pad * 2 - 12));
    const cardRpx = Math.round((cardPx / w) * 750);
    this.setData({
      statusBarHeight: sys.statusBarHeight || 20,
      carouselCardWidthRpx: cardRpx,
    });
  },

  onShow() {
    const s = getSession();
    if (!s || !s.access_token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.refreshHome();
  },

  refreshHome() {
    const s = getSession();
    const token = s && s.access_token;
    this.setData({
      matchesLoading: true,
      statsLoading: true,
      showProximosSection: true,
      proximosSubtitle: proximosSubtitle(true, 0),
      enDirectoSubtitle: enDirectoSubtitleLine(true, 0),
    });

    const statsP = fetchHomeStats(token).catch(() => ({
      courtsFree: 0,
      playersLooking: 0,
      classesToday: 0,
      tournaments: 0,
    }));
    const matchesP = fetchMatches({ expand: true, token, activeOnly: true }).catch(() => []);

    Promise.all([statsP, matchesP])
      .then(([stats, matches]) =>
        fetchMyPlayerId(token)
          .catch(() => null)
          .then((playerId) => ({ stats, matches, playerId }))
      )
      .then(({ stats, matches, playerId }) => {
        const mineRaw = selectMyUpcomingMatches(matches || [], playerId);
        const misProximos = mineRaw
          .map(mapMatchToPartido)
          .filter(Boolean)
          .filter((p) => p.visibility !== 'private')
          .map(enrichPartidoCard);

        const all = (matches || [])
          .map(mapMatchToPartido)
          .filter(Boolean)
          .filter((p) => p.matchPhase !== 'past' && p.visibility !== 'private');

        const partidosLive = all
          .filter((p) => p.matchPhase === 'live')
          .map(enrichPartidoCard);

        const listLoading = false;
        const buscarSub = countLine(
          listLoading,
          all.length,
          'partido abierto',
          'partidos abiertos'
        );
        const pistasSub = countLine(
          listLoading,
          stats != null ? stats.courtsFree : null,
          'pista libre',
          'pistas libres'
        );
        const torneosSub = countLine(
          listLoading,
          stats != null ? stats.tournaments : null,
          'torneo',
          'torneos'
        );

        const showProximos = listLoading || misProximos.length > 0;
        const proxSub = proximosSubtitle(listLoading, misProximos.length);
        const edSub = enDirectoSubtitleLine(listLoading, partidosLive.length);

        this.setData({
          stats,
          statsLoading: false,
          matchesLoading: false,
          misProximos,
          partidosAll: all.map(enrichPartidoCard),
          partidosLive,
          showProximosSection: showProximos,
          proximosSubtitle: proxSub,
          enDirectoSubtitle: edSub,
          buscarSub,
          pistasSub,
          torneosSub,
        });
      })
      .catch(() => {
        this.setData({
          matchesLoading: false,
          statsLoading: false,
          misProximos: [],
          partidosLive: [],
          showProximosSection: false,
          proximosSubtitle: proximosSubtitle(false, 0),
          enDirectoSubtitle: enDirectoSubtitleLine(false, 0),
          buscarSub: DASH,
          pistasSub: DASH,
          torneosSub: DASH,
        });
      });
  },

  onMenuPress() {
    wx.showActionSheet({
      itemList: ['Cerrar sesión'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: 'Cerrar sesión',
            content: '¿Salir de WeMatch?',
            success: (r) => {
              if (r.confirm) {
                clearSession();
                wx.reLaunch({ url: '/pages/login/login' });
              }
            },
          });
        }
      },
    });
  },

  onPlaceholderPress() {
    wx.showToast({ title: 'Próximamente', icon: 'none' });
  },

  onDailyLessonPress() {
    wx.navigateTo({ url: '/pages/partidos/partidos' });
  },

  onSeasonPassPress() {
    wx.showToast({ title: 'Pase de temporada', icon: 'none' });
  },

  onCompetitivePress() {
    wx.navigateTo({ url: '/pages/partidos/partidos' });
  },

  onQuickPartidos() {
    wx.navigateTo({ url: '/pages/partidos/partidos' });
  },

  onQuickPistas() {
    wx.switchTab({ url: '/pages/search/search' });
  },

  onQuickClases() {
    wx.showToast({ title: 'Clases próximamente', icon: 'none' });
  },

  onQuickTorneos() {
    wx.navigateTo({ url: '/pages/partidos/partidos' });
  },

  onIAPress() {
    wx.navigateTo({ url: '/pages/aimatch/aimatch' });
  },

  onOpenPartidosFromEd() {
    wx.navigateTo({ url: '/pages/partidos/partidos' });
  },

  onPartidoCardTap(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/partido-detail/partido-detail?id=${encodeURIComponent(id)}` });
  },
});
