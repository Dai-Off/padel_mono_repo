const { fetchSearchCourts } = require('../../api/search');
const { fetchCourtsByClubId } = require('../../api/courts');
const { fetchClubById } = require('../../api/clubs');
const { fetchMatches } = require('../../api/matches');
const { getSession } = require('../../utils/storage');
const { toDateStringLocal } = require('../../utils/date');
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

function enrichCard(p) {
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

Page({
  data: {
    loading: true,
    activeTab: 'reservar',
    clubId: '',
    dateStr: '',
    clubName: '',
    clubAddress: '',
    heroImage: '',
    courts: [],
    matchesLoading: false,
    openMatchCards: [],
  },

  onLoad(options) {
    const clubId = options.clubId || '';
    const dateStr = options.date || toDateStringLocal(new Date());
    this.setData({ clubId, dateStr });
    this.load(clubId, dateStr);
  },

  load(clubId, dateStr) {
    this.setData({ loading: true });
    const token = getSession()?.access_token;
    Promise.all([
      fetchSearchCourts({ dateFrom: dateStr, dateTo: dateStr }),
      fetchCourtsByClubId(clubId),
      fetchClubById(clubId, token),
    ])
      .then(([searchResults, courts, club]) => {
        const inClub = (searchResults || []).filter((r) => r.clubId === clubId);
        const first = inClub[0];
        const clubName = (club && club.name) || (first && first.clubName) || 'Club';
        const clubAddress = club
          ? [club.address, club.city].filter(Boolean).join(' · ')
          : [first && first.address, first && first.city].filter(Boolean).join(' ');

        const merged = (courts || []).map((c) => {
          const sr = inClub.find((r) => r.id === c.id);
          return {
            id: c.id,
            name: c.name,
            indoor: !!c.indoor,
            glass_type: c.glass_type || 'normal',
            timeSlots: sr && Array.isArray(sr.timeSlots) ? sr.timeSlots : [],
            minPriceFormatted: sr ? sr.minPriceFormatted : '',
          };
        });

        this.setData({
          loading: false,
          clubName,
          clubAddress: clubAddress || '',
          heroImage: (first && first.imageUrl) || '',
          courts: merged,
        });
        this.loadOpenMatches(clubId, token);
      })
      .catch(() => {
        this.setData({ loading: false, courts: [] });
        wx.showToast({ title: 'Error al cargar', icon: 'none' });
      });
  },

  loadOpenMatches(clubId, token) {
    this.setData({ matchesLoading: true });
    fetchMatches({ expand: true, token, activeOnly: true })
      .then((matches) => {
        const cards = (matches || [])
          .map(mapMatchToPartido)
          .filter(Boolean)
          .filter(
            (p) =>
              p.clubId === clubId &&
              p.visibility !== 'private' &&
              p.matchPhase !== 'past'
          )
          .map(enrichCard);
        this.setData({ openMatchCards: cards, matchesLoading: false });
      })
      .catch(() => {
        this.setData({ openMatchCards: [], matchesLoading: false });
      });
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab) this.setData({ activeTab: tab });
  },

  onSlotTap(e) {
    const { courtId, courtName, slot, price } = e.currentTarget.dataset;
    const { clubId, dateStr, clubName } = this.data;
    const q = [
      `clubId=${encodeURIComponent(clubId)}`,
      `courtId=${encodeURIComponent(courtId)}`,
      `clubName=${encodeURIComponent(clubName)}`,
      `courtName=${encodeURIComponent(courtName)}`,
      `slot=${encodeURIComponent(slot)}`,
      `date=${encodeURIComponent(dateStr)}`,
      `price=${encodeURIComponent(price || '')}`,
    ].join('&');
    wx.navigateTo({ url: `/pages/booking-pay/booking-pay?${q}` });
  },

  onPartidoCardTap(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/partido-detail/partido-detail?id=${encodeURIComponent(id)}` });
  },
});
