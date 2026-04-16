const { getSession } = require('../../utils/storage');
const { fetchMyPlayerId } = require('../../api/players');
const { fetchClubAvailabilityForCreate } = require('../../api/partidoClubs');
const { createMatchWithBooking } = require('../../api/matches');
const { simulateTurnPayment } = require('../../api/payments');

const DURATION_MIN = 90;

const GENDER_KEYS = ['any', 'male', 'female', 'mixed'];
const GENDER_LABELS = ['Todos', 'Masculino', 'Femenino', 'Mixto'];

function buildStartEnd(dateStr, time) {
  const start = new Date(`${dateStr}T${time}:00`);
  const end = new Date(start.getTime() + DURATION_MIN * 60 * 1000);
  return {
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  };
}

Page({
  data: {
    step: 'list',
    clubs: [],
    clubsLoading: true,
    clubsError: '',
    organizerId: null,
    selectedClubName: '',
    selectedDateLabel: '',
    selectedTime: '',
    selectedPriceFmt: '',
    selectedSlot: null,
    partidoPrivado: false,
    competitive: true,
    genderIndex: 0,
    genderLabel: 'Todos',
    createError: '',
    creating: false,
  },

  onLoad() {
    const token = getSession()?.access_token;
    if (!token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    fetchMyPlayerId(token).then((id) => {
      this.setData({ organizerId: id });
      if (!id) {
        wx.showToast({ title: 'Perfil no encontrado', icon: 'none' });
      }
    });
    this.loadClubs();
  },

  loadClubs() {
    this.setData({ clubsLoading: true, clubsError: '' });
    fetchClubAvailabilityForCreate()
      .then((clubs) => {
        this.setData({ clubs: clubs || [], clubsLoading: false });
      })
      .catch(() => {
        this.setData({
          clubs: [],
          clubsLoading: false,
          clubsError: 'No se pudo cargar la disponibilidad',
        });
      });
  },

  onSlotTap(e) {
    const cidx = Number(e.currentTarget.dataset.cidx);
    const didx = Number(e.currentTarget.dataset.didx);
    const sidx = Number(e.currentTarget.dataset.sidx);
    const clubs = this.data.clubs || [];
    const club = clubs[cidx];
    const slot = club && club.dates && club.dates[didx] && club.dates[didx].slots
      ? club.dates[didx].slots[sidx]
      : null;
    const clubName = club ? club.clubName : '';
    if (!slot || !this.data.organizerId) {
      wx.showToast({
        title: this.data.organizerId ? 'Datos incompletos' : 'Cargando perfil…',
        icon: 'none',
      });
      return;
    }
    const totalCents = Math.max(Math.round(slot.minPriceCents * (DURATION_MIN / 60)), 100);
    const euros = (totalCents / 100).toFixed(2).replace('.', ',');
    this.setData({
      step: 'config',
      selectedClubName: clubName || '',
      selectedDateLabel: slot.dateLabel || '',
      selectedTime: slot.time || '',
      selectedPriceFmt: `${euros}€ (90 min)`,
      selectedSlot: slot,
      createError: '',
      partidoPrivado: false,
      competitive: true,
      genderIndex: 0,
      genderLabel: 'Todos',
    });
  },

  onPrivateChange(e) {
    this.setData({ partidoPrivado: !!e.detail.value });
  },

  onCompetitiveChange(e) {
    this.setData({ competitive: !!e.detail.value });
  },

  onGenderTap() {
    wx.showActionSheet({
      itemList: GENDER_LABELS,
      success: (res) => {
        const i = res.tapIndex;
        if (i >= 0 && i < GENDER_KEYS.length) {
          this.setData({
            genderIndex: i,
            genderLabel: GENDER_LABELS[i],
          });
        }
      },
    });
  },

  onBackConfig() {
    this.setData({ step: 'list', selectedSlot: null, createError: '' });
  },

  onConfirmCreate() {
    const token = getSession()?.access_token;
    const orgId = this.data.organizerId;
    const slot = this.data.selectedSlot;
    if (!token || !orgId || !slot) {
      wx.showToast({ title: 'Sesión o slot inválido', icon: 'none' });
      return;
    }
    if (this.data.creating) return;

    const { start_at, end_at } = buildStartEnd(slot.dateStr, slot.time);
    const total_price_cents = Math.max(Math.round(slot.minPriceCents * (DURATION_MIN / 60)), 100);
    const genderKey = GENDER_KEYS[this.data.genderIndex] || 'any';

    this.setData({ creating: true, createError: '' });

    createMatchWithBooking(
      {
        court_id: slot.courtId,
        organizer_player_id: orgId,
        start_at,
        end_at,
        total_price_cents,
        visibility: this.data.partidoPrivado ? 'private' : 'public',
        competitive: this.data.competitive,
        gender: genderKey,
        source_channel: 'mobile',
      },
      token
    )
      .then((res) => {
        if (!res || !res.ok) {
          const err = (res && res.error) || 'Error al crear';
          this.setData({ creating: false, createError: err });
          if (String(err).includes('horario') || String(err).includes('pista')) {
            wx.showToast({ title: 'Horario no disponible', icon: 'none' });
          }
          return null;
        }
        const shareCents = Math.ceil(total_price_cents / 4);
        const partId = res.organizerParticipantId;
        if (!partId || !res.bookingId) {
          this.setData({ creating: false, createError: 'Respuesta incompleta del servidor' });
          return null;
        }
        return simulateTurnPayment(
          {
            booking_id: res.bookingId,
            amount_cents: shareCents,
            participant_id: partId,
          },
          token
        ).then((sim) => ({ res, sim }));
      })
      .then((bundle) => {
        if (!bundle) return;
        const { res, sim } = bundle;
        if (!sim.ok) {
          this.setData({
            creating: false,
            createError: sim.error || 'Pago simulado fallido',
          });
          return;
        }
        this.setData({ creating: false });
        wx.showToast({ title: 'Partido creado', icon: 'success' });
        setTimeout(() => {
          wx.navigateTo({
            url: `/pages/partido-detail/partido-detail?id=${encodeURIComponent(res.match.id)}`,
          });
        }, 500);
      })
      .catch(() => {
        this.setData({ creating: false, createError: 'Error de red' });
      });
  },
});
