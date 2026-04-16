const { login } = require('../../api/auth');
const { setSession } = require('../../utils/storage');

Page({
  data: {
    email: '',
    password: '',
    rememberMe: false,
    loading: false,
    error: '',
    year: new Date().getFullYear(),
  },

  onEmailInput(e) {
    this.setData({
      email: e.detail.value,
      error: '',
    });
  },

  onPasswordInput(e) {
    this.setData({
      password: e.detail.value,
      error: '',
    });
  },

  onToggleRemember() {
    if (this.data.loading) return;
    this.setData({ rememberMe: !this.data.rememberMe });
  },

  onForgotPassword() {
    if (this.data.loading) return;
    wx.showToast({ title: 'Próximamente', icon: 'none' });
  },

  onGoToRegister() {
    if (this.data.loading) return;
    wx.navigateTo({ url: '/pages/register/register' });
  },

  onSubmit() {
    if (this.data.loading) return;
    const email = (this.data.email || '').trim();
    const password = this.data.password || '';
    if (!email || !password) {
      this.setData({ error: 'Email y contraseña son obligatorios' });
      return;
    }
    this.setData({ loading: true, error: '' });
    login(email, password)
      .then((res) => {
        if (res.ok && res.user && res.session) {
          setSession({
            access_token: res.session.access_token,
            refresh_token: res.session.refresh_token,
            expires_at: res.session.expires_at,
            user: res.user,
          });
          wx.switchTab({ url: '/pages/home/home' });
        } else {
          this.setData({
            error: res.error || 'Error al iniciar sesión',
          });
        }
      })
      .catch(() => {
        this.setData({
          error: 'Error de conexión. ¿Está el backend corriendo?',
        });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
});
