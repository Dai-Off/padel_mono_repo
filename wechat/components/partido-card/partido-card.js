Component({
  properties: {
    item: {
      type: Object,
      value: {},
    },
  },
  methods: {
    onTap() {
      const item = this.properties.item || {};
      this.triggerEvent('cardtap', { id: item.id });
    },
  },
});
