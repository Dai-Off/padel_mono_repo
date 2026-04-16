const { aggregateCourtsByClub } = require('../../utils/aggregateCourts');
const { fetchSearchCourts } = require('../../api/search');
const { toDateStringLocal } = require('../../utils/date');
const { getSession, setSearchDate, getSearchDate } = require('../../utils/storage');

function formatDateChip(yyyyMmDd) {
  if (!yyyyMmDd) return 'Fecha';
  const parts = yyyyMmDd.split('-');
  if (parts.length !== 3) return yyyyMmDd;
  const d = parseInt(parts[2], 10);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const m = months[parseInt(parts[1], 10) - 1] || '';
  return `${d} ${m}`;
}

function decorateGroups(rawGroups) {
  return rawGroups.map((g) => {
    const c = g.representative;
    const slots = Array.isArray(c.timeSlots) ? c.timeSlots : [];
    const locationLine = [c.city, c.address]
      .filter((x) => x && String(x).trim().length > 0)
      .join(' ')
      .trim();
    return {
      clubId: c.clubId,
      clubName: c.clubName,
      imageUrl: c.imageUrl,
      minPriceFormatted: c.minPriceFormatted,
      distanceLabel: c.distanceKm != null ? `${Math.round(c.distanceKm)}km` : '',
      locationLine,
      cerramientoLabel: c.indoor ? 'Indoor' : 'Exterior',
      paredesLabel: c.glassType === 'panoramic' ? 'Cristal' : 'Muro',
      visibleSlots: slots.slice(0, 3),
      extraSlots: Math.max(0, slots.length - 3),
      representative: c,
      courtCount: g.courtCount,
    };
  });
}

Page({
  data: {
    searchQuery: '',
    dateStr: '',
    dateLabel: 'Fecha',
    sportLabel: 'Deporte',
    timeLabel: 'Hora',
    sport: null,
    indoor: undefined,
    glassType: undefined,
    apiResults: [],
    clubGroups: [],
    loading: true,
    skeletonPlaceholders: [1, 2, 3, 4],
  },

  onShow() {
    const s = getSession();
    if (!s || !s.access_token) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  onLoad() {
    const stored = getSearchDate();
    const dateStr = stored || toDateStringLocal(new Date());
    if (!stored) setSearchDate(dateStr);
    this.setData({
      dateStr,
      dateLabel: formatDateChip(dateStr),
    });
    this.loadSearch();
  },

  onPullDownRefresh() {
    this.loadSearch().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadSearch() {
    this.setData({ loading: true });
    const { dateStr, indoor, glassType } = this.data;
    const opts = {
      dateFrom: dateStr,
      dateTo: dateStr,
    };
    if (indoor !== undefined) opts.indoor = indoor;
    if (glassType) opts.glassType = glassType;

    return fetchSearchCourts(opts)
      .then((results) => {
        this.setData({
          apiResults: Array.isArray(results) ? results : [],
          loading: false,
        });
        this.applyLocalFilter();
      })
      .catch(() => {
        this.setData({ apiResults: [], clubGroups: [], loading: false });
      });
  },

  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value });
    this.applyLocalFilter();
  },

  applyLocalFilter() {
    const { apiResults, searchQuery } = this.data;
    const q = (searchQuery || '').trim().toLowerCase();
    let filtered = apiResults;
    if (q) {
      filtered = apiResults.filter(
        (r) =>
          String(r.courtName || '')
            .toLowerCase()
            .includes(q) ||
          String(r.clubName || '')
            .toLowerCase()
            .includes(q) ||
          String(r.city || '')
            .toLowerCase()
            .includes(q)
      );
    }
    const groups = aggregateCourtsByClub(filtered);
    this.setData({ clubGroups: decorateGroups(groups) });
  },

  onDateChange(e) {
    const v = e.detail.value;
    setSearchDate(v);
    this.setData({
      dateStr: v,
      dateLabel: formatDateChip(v),
    });
    this.loadSearch();
  },

  onSportPress() {
    wx.showActionSheet({
      itemList: ['Todos los deportes', 'Pádel', 'Tenis', 'Pickleball'],
      success: (res) => {
        const labels = ['Deporte', 'Pádel', 'Tenis', 'Pickleball'];
        const sport = res.tapIndex === 0 ? null : ['padel', 'tenis', 'pickle'][res.tapIndex - 1];
        this.setData({
          sportLabel: labels[res.tapIndex],
          sport,
        });
        wx.showToast({ title: 'Filtro deporte (UI)', icon: 'none' });
      },
    });
  },

  onTimePress() {
    wx.showToast({ title: 'Próximamente', icon: 'none' });
  },

  onOpenFilters() {
    wx.showActionSheet({
      itemList: [
        'Quitar filtros',
        'Solo indoor',
        'Solo exterior',
        'Solo cristal (panorámico)',
        'Solo muro',
      ],
      success: (res) => {
        const i = res.tapIndex;
        let indoor;
        let glassType;
        if (i === 0) {
          indoor = undefined;
          glassType = undefined;
        } else if (i === 1) {
          indoor = true;
          glassType = undefined;
        } else if (i === 2) {
          indoor = false;
          glassType = undefined;
        } else if (i === 3) {
          indoor = undefined;
          glassType = 'panoramic';
        } else if (i === 4) {
          indoor = undefined;
          glassType = 'normal';
        }
        this.setData({ indoor, glassType });
        this.loadSearch();
      },
    });
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  onClubTap(e) {
    const clubId = e.currentTarget.dataset.clubId;
    const { dateStr } = this.data;
    wx.navigateTo({
      url: `/pages/club-detail/club-detail?clubId=${encodeURIComponent(clubId)}&date=${encodeURIComponent(dateStr)}`,
    });
  },

  onFavoriteTap() {
    wx.showToast({ title: 'Favoritos próximamente', icon: 'none' });
  },
});
