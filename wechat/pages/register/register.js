const { register } = require('../../api/auth');
const { setSession } = require('../../utils/storage');

Page({
  data: {
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    loading: false,
    error: '',
    showConfirm: false,
    year: new Date().getFullYear(),
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value, error: '' });
  },
  onEmailInput(e) {
    this.setData({ email: e.detail.value, error: '' });
  },
  onPasswordInput(e) {
    this.setData({ password: e.detail.value, error: '' });
  },
  onConfirmInput(e) {
    this.setData({ confirmPassword: e.detail.value, error: '' });
  },

  onGoToLogin() {
    if (this.data.loading) return;
    wx.navigateBack({ delta: 1 });
  },

  onConfirmGoLogin() {
    this.setData({ showConfirm: false });
    wx.navigateBack({ delta: 1 });
  },

  onSubmit() {
    if (this.data.loading) return;
    const email = (this.data.email || '').trim();
    const p = this.data.password || '';
    const cp = this.data.confirmPassword || '';

    if (!email || !p) {
      this.setData({ error: 'Email y contraseña son obligatorios' });
      return;
    }
    if (p.length < 6) {
      this.setData({ error: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }
    if (p !== cp) {
      this.setData({ error: 'Las contraseñas no coinciden' });
      return;
    }

    this.setData({ loading: true, error: '' });
    register(email, p, (this.data.name || '').trim() || undefined)
      .then((res) => {
        if (res.ok && res.user) {
          if (res.session) {
            setSession({
              access_token: res.session.access_token,
              refresh_token: res.session.refresh_token,
              expires_at: res.session.expires_at,
              user: res.user,
            });
            wx.switchTab({ url: '/pages/home/home' });
          } else {
            this.setData({
              name: '',
              email: '',
              password: '',
              confirmPassword: '',
              showConfirm: true,
            });
          }
        } else {
          this.setData({ error: res.error || 'Error al registrarse' });
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
