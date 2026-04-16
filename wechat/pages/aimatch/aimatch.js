const { getSession } = require('../../utils/storage');
const { fetchMyPlayerProfile } = require('../../api/players');
const { searchAiMatch } = require('../../api/aiMatch');

Page({
  data: {
    prompt: '',
    loading: false,
    error: '',
    result: '',
    profile: null,
  },

  onShow() {
    const s = getSession();
    if (!s || !s.access_token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    fetchMyPlayerProfile(s.access_token).then((profile) => {
      this.setData({ profile });
    });
  },

  onInput(e) {
    this.setData({ prompt: e.detail.value, error: '' });
  },

  onSubmit() {
    const prompt = (this.data.prompt || '').trim();
    if (!prompt) {
      this.setData({ error: 'Escribe qué buscas' });
      return;
    }
    const s = getSession();
    const session = s || {};
    const profile = this.data.profile;

    const userName =
      [profile && profile.firstName, profile && profile.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      (session.user && session.user.user_metadata && session.user.user_metadata.full_name) ||
      (session.user && session.user.email && session.user.email.split('@')[0]) ||
      'Sin dato';

    const enrichedPrompt = [
      'CONTEXTO JUGADOR LOGUEADO (ANCLA)',
      `- player_id: ${(profile && profile.id) || 'Sin dato'}`,
      `- nombre: ${userName}`,
      `- email: ${(profile && profile.email) || (session.user && session.user.email) || 'Sin dato'}`,
      `- elo_rating: ${(profile && profile.eloRating) ?? 'Sin dato'}`,
      `- telefono: ${(profile && profile.phone) || 'Sin dato'}`,
      '',
      'SOLICITUD DEL USUARIO',
      prompt,
      '',
      'INSTRUCCION IMPORTANTE',
      'Usa el jugador logueado como jugador ancla para el matching.',
    ].join('\n');

    this.setData({ loading: true, error: '', result: '' });
    searchAiMatch(enrichedPrompt)
      .then((res) => {
        if (res.ok && res.text) {
          this.setData({ result: res.text });
        } else {
          this.setData({ error: res.error || 'No se pudo completar la búsqueda.' });
        }
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },
});
