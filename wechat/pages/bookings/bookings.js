const { getSession, getLocalBookings } = require('../../utils/storage');



function formatDateDisplay(yyyyMmDd) {

  if (!yyyyMmDd) return '';

  const parts = String(yyyyMmDd).split('-');

  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;

  return yyyyMmDd;

}



function statusLabel(status) {

  if (status === 'simulated_paid') return 'Pago simulado';

  if (status === 'succeeded') return 'Pago simulado';

  return status || '—';

}



function enrichBooking(b) {

  return Object.assign({}, b, {

    dateDisplay: formatDateDisplay(b.date),

    statusLabel: statusLabel(b.status),

  });

}



Page({

  data: {

    list: [],

  },



  onShow() {

    const s = getSession();

    if (!s || !s.access_token) {

      wx.reLaunch({ url: '/pages/login/login' });

      return;

    }

    this.setData({ list: (getLocalBookings() || []).map(enrichBooking) });

  },



  onGoSearch() {

    wx.switchTab({ url: '/pages/search/search' });

  },

});

