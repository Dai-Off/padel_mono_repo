const { getSession } = require('../../utils/storage');

Page({
  data: {
    activeTab: 'disponibles',
  },

  onShow() {
    const s = getSession();
    if (!s || !s.access_token) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab) this.setData({ activeTab: tab });
  },
});
