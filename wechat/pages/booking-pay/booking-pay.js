const { addLocalBooking } = require('../../utils/storage');

function formatDateLabel(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const parts = yyyyMmDd.split('-');
  if (parts.length !== 3) return yyyyMmDd;
  const d = parseInt(parts[2], 10);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const m = months[parseInt(parts[1], 10) - 1] || '';
  return `${d} ${m} ${parts[0]}`;
}

Page({
  data: {
    clubId: '',
    courtId: '',
    clubName: '',
    courtName: '',
    slot: '',
    dateStr: '',
    dateLabel: '',
    priceDisplay: '',
    paying: false,
  },

  onLoad(options) {
    const clubId = options.clubId || '';
    const courtId = options.courtId || '';
    const clubName = decodeURIComponent(options.clubName || '');
    const courtName = decodeURIComponent(options.courtName || '');
    const slot = decodeURIComponent(options.slot || '');
    const dateStr = options.date || '';
    const price = decodeURIComponent(options.price || '');
    const dateLabel = formatDateLabel(dateStr);
    const priceDisplay = price ? `Total: ${price}` : 'Total: —';
    this.setData({
      clubId,
      courtId,
      clubName,
      courtName,
      slot,
      dateStr,
      dateLabel,
      priceDisplay,
    });
  },

  onPay() {
    if (this.data.paying) return;
    this.setData({ paying: true });
    setTimeout(() => {
      addLocalBooking({
        clubId: this.data.clubId,
        courtId: this.data.courtId,
        clubName: this.data.clubName,
        courtName: this.data.courtName,
        slot: this.data.slot,
        date: this.data.dateStr,
        priceText: this.data.priceDisplay,
        status: 'simulated_paid',
      });
      this.setData({ paying: false });
      wx.showToast({ title: 'Reserva guardada', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/bookings/bookings' });
      }, 600);
    }, 800);
  },
});
