const { getSession } = require('../../utils/storage');

Page({
  onShow() {
    const s = getSession();
    if (s && s.access_token) {
      wx.switchTab({ url: '/pages/home/home' });
    } else {
      wx.redirectTo({ url: '/pages/login/login' });
    }
  },
});
