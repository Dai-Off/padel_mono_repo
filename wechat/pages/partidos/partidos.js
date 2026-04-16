const { getSession } = require('../../utils/storage');
const { fetchMatches } = require('../../api/matches');
const { fetchMyPlayerId } = require('../../api/players');
const { mapMatchToPartido } = require('../../utils/mapMatchToPartido');

const PLACEHOLDER_URIS = [
  'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400&h=300&fit=crop',
];

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

function enrich(p) {
  const parts = String(p.dateTime || '').split(' · ');
  const datePart = (parts[0] && parts[0].trim()) || '—';
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

/** Datos extra para PartidoCard (RN: primer jugador no libre en fila «Tu reserva»). */
function enrichPrivateCard(p) {
  const e = enrich(p);
  const players = p.players || [];
  const org = players.find((x) => !x.isFree);
  let organizerInitial = '';
  if (org) {
    const raw = org.initial || (String(org.name || '').trim()[0] || '') || '?';
    organizerInitial = String(raw).toUpperCase();
  }
  return Object.assign({}, e, {
    organizerInitial,
    showOrganizerAvatar: !!org,
    visibility: p.visibility || 'private',
  });
}

Page({
  data: {
    loading: true,
    openItems: [],
    myPrivateItems: [],
    skOpen: [1, 2, 3],
    skMine: [1, 2],
  },

  onShow() {
    const s = getSession();
    if (!s || !s.access_token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.load();
  },

  load() {
    const token = getSession().access_token;
    this.setData({ loading: true });
    Promise.all([fetchMyPlayerId(token), fetchMatches({ expand: true, token })])
      .then(([playerId, matches]) => {
        const base = (matches || [])
          .map(mapMatchToPartido)
          .filter(Boolean)
          .filter((p) => p.matchPhase !== 'past');

        const openItems = base.filter((p) => p.visibility !== 'private').map(enrich);

        const myPrivateItems = base
          .filter(
            (p) =>
              p.visibility === 'private' &&
              playerId &&
              (p.playerIds || []).indexOf(playerId) !== -1
          )
          .map(enrichPrivateCard);

        this.setData({ openItems, myPrivateItems, loading: false });
      })
      .catch(() => {
        this.setData({ openItems: [], myPrivateItems: [], loading: false });
      });
  },

  onCardTap(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/partido-detail/partido-detail?id=${encodeURIComponent(id)}` });
  },

  onFabTap() {
    wx.navigateTo({ url: '/pages/crear-partido/crear-partido' });
  },
});
