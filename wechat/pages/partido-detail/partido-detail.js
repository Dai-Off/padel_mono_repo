const { getSession } = require('../../utils/storage');
const { fetchMatchById, prepareJoin } = require('../../api/matches');
const { simulateTurnPayment } = require('../../api/payments');
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

function enrichBase(p) {
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
    levelRangeDisplay: String(p.levelRange || '').replace(/\./g, ','),
  });
}

function buildTeams(players, ctx) {
  const list = (players || []).map((p, idx) => {
    const canJoin =
      !!ctx.playerContextResolved &&
      !ctx.isInMatch &&
      ctx.matchPhase !== 'past' &&
      p.isFree &&
      (ctx.joiningSlot === null || ctx.joiningSlot === idx);
    return {
      name: p.name,
      initial: p.initial,
      level: p.level,
      isFree: p.isFree,
      idx,
      canJoin,
      joining: ctx.joiningSlot === idx,
    };
  });
  return {
    teamA: list.slice(0, 2),
    teamB: list.slice(2, 4),
  };
}

function courtLineFromItem(item) {
  return [item.courtName, item.courtType].filter(Boolean).join(' — ') || '—';
}

Page({
  data: {
    loading: true,
    error: '',
    item: null,
    isPrivate: false,
    heroUri: '',
    locationLine: '',
    venueAddress: '',
    courtLine: '',
    activeTab: 'info',
    teamA: [],
    teamB: [],
    currentPlayerId: null,
    playerContextResolved: false,
    isInMatch: false,
    matchPhase: 'upcoming',
    joiningSlot: null,
    joiningBusy: false,
    firstFreeIndex: -1,
    ctaLabel: '',
    ctaDisabled: true,
  },

  matchId: '',

  onLoad(options) {
    const id = options.id;
    if (!id) {
      this.setData({ loading: false, error: 'Partido no encontrado' });
      return;
    }
    this.matchId = id;
    this.loadMatch();
  },

  onShow() {
    const token = getSession()?.access_token;
    if (!token) {
      this.setData({ currentPlayerId: null, playerContextResolved: true });
      return;
    }
    this.setData({ playerContextResolved: false });
    fetchMyPlayerId(token)
      .then((pid) => {
        this.setData({ currentPlayerId: pid, playerContextResolved: true });
        this.refreshDerived();
      })
      .catch(() => {
        this.setData({ currentPlayerId: null, playerContextResolved: true });
        this.refreshDerived();
      });
  },

  loadMatch() {
    const token = getSession()?.access_token;
    this.setData({ loading: true, error: '' });
    fetchMatchById(this.matchId, token)
      .then((m) => {
        if (!m) {
          this.setData({ loading: false, error: 'No se pudo cargar el partido' });
          return;
        }
        const p = mapMatchToPartido(m);
        if (!p) {
          this.setData({ loading: false, error: 'Datos incompletos' });
          return;
        }
        const item = enrichBase(p);
        const isPrivate = item.visibility === 'private';
        const heroUri = item.cardImage || pickPlaceholderUri(item.id);
        const venueAddress = item.venueAddress || item.location || '';
        const locationLine =
          item.location && item.location !== '—' ? item.location : venueAddress;
        this.setData({
          loading: false,
          item,
          isPrivate,
          heroUri,
          venueAddress,
          locationLine,
          courtLine: courtLineFromItem(item),
          matchPhase: item.matchPhase || 'upcoming',
        });
        this.refreshDerived();
      })
      .catch(() => {
        this.setData({ loading: false, error: 'Error de red' });
      });
  },

  refreshDerived() {
    const item = this.data.item;
    if (!item || this.data.isPrivate) return;

    const pid = this.data.currentPlayerId;
    const ids = item.playerIds || [];
    const isInMatch = pid != null && ids.indexOf(pid) !== -1;
    const players = item.players || [];
    let firstFreeIndex = -1;
    for (let i = 0; i < players.length; i += 1) {
      if (players[i].isFree) {
        firstFreeIndex = i;
        break;
      }
    }
    const ctx = {
      playerContextResolved: this.data.playerContextResolved,
      isInMatch,
      matchPhase: this.data.matchPhase,
      joiningSlot: this.data.joiningSlot,
    };
    const { teamA, teamB } = buildTeams(players, ctx);

    const joinBusy = this.data.joiningSlot !== null;
    const canPressCta =
      this.data.playerContextResolved &&
      firstFreeIndex >= 0 &&
      !isInMatch &&
      !joinBusy &&
      this.data.matchPhase !== 'past';

    let ctaLabel = 'Reservar plaza';
    if (!this.data.playerContextResolved) ctaLabel = 'Comprobando…';
    else if (isInMatch) ctaLabel = 'Ya estás en el partido';
    else if (firstFreeIndex < 0) ctaLabel = 'No hay plazas libres';
    else if (this.data.matchPhase === 'past') ctaLabel = 'Partido finalizado';
    else ctaLabel = `Reservar plaza — ${item.price}`;

    this.setData({
      isInMatch,
      firstFreeIndex,
      teamA,
      teamB,
      joiningBusy: joinBusy,
      ctaLabel,
      ctaDisabled: !canPressCta,
    });
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab) this.setData({ activeTab: tab });
  },

  onOpenMaps() {
    const item = this.data.item;
    if (!item) return;
    const addr = [item.venue, this.data.venueAddress || item.location].filter(Boolean).join(', ');
    wx.setClipboardData({
      data: addr || item.venue,
      success: () => {
        wx.showToast({ title: 'Dirección copiada', icon: 'none' });
      },
    });
  },

  runJoinFlow(slotIndex) {
    const token = getSession()?.access_token;
    if (!token) {
      wx.showToast({ title: 'Inicia sesión', icon: 'none' });
      return;
    }
    this.setData({ joiningSlot: slotIndex, joiningBusy: true });
    this.refreshDerived();

    prepareJoin(this.matchId, slotIndex, token)
      .then((prep) => {
        if (prep.participantId == null) {
          this.setData({ joiningSlot: null, joiningBusy: false });
          this.refreshDerived();
          const err = prep.error || 'No se pudo preparar';
          if (String(err).includes('hora')) {
            wx.showToast({ title: 'Ya tienes partido a esa hora', icon: 'none' });
          } else {
            wx.showToast({ title: err, icon: 'none' });
          }
          return;
        }

        const amount =
          prep.shareAmountCents != null && prep.shareAmountCents >= 50
            ? prep.shareAmountCents
            : 500;

        wx.showModal({
          title: 'Pago simulado',
          content: '¿Confirmar plaza? Se usará el cobro simulado (sin pasarela).',
          success: (res) => {
            if (!res.confirm) {
              this.setData({ joiningSlot: null, joiningBusy: false });
              this.refreshDerived();
              return;
            }
            simulateTurnPayment(
              {
                booking_id: prep.bookingId,
                amount_cents: amount,
                participant_id: prep.participantId,
              },
              token
            )
              .then((sim) => {
                this.setData({ joiningSlot: null, joiningBusy: false });
                this.refreshDerived();
                if (!sim.ok) {
                  wx.showToast({ title: sim.error || 'Error al confirmar', icon: 'none' });
                  return;
                }
                wx.showToast({ title: 'Plaza confirmada', icon: 'success' });
                this.loadMatch();
              })
              .catch(() => {
                this.setData({ joiningSlot: null, joiningBusy: false });
                this.refreshDerived();
                wx.showToast({ title: 'Error de red', icon: 'none' });
              });
          },
        });
      })
      .catch(() => {
        this.setData({ joiningSlot: null, joiningBusy: false });
        this.refreshDerived();
        wx.showToast({ title: 'Error de red', icon: 'none' });
      });
  },

  onJoinTap(e) {
    const slot = Number(e.currentTarget.dataset.slot);
    if (Number.isNaN(slot)) return;
    this.runJoinFlow(slot);
  },

  onBottomCta() {
    const i = this.data.firstFreeIndex;
    if (i >= 0) this.runJoinFlow(i);
  },
});
