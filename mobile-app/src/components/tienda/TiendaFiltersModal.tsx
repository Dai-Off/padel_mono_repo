import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TiendaFilterFlags } from "../../lib/tiendaCatalog";
import { lineHeightFor } from "../../theme";
import { useTranslation } from "../../i18n";

const ACCENT = "#F18F34";
const BG = "#0F0F0F";
const BORDER = "rgba(255,255,255,0.08)";

type TiendaFiltersModalProps = {
  visible: boolean;
  value: TiendaFilterFlags;
  onChange: (next: TiendaFilterFlags) => void;
  onClose: () => void;
};

function FilterToggle({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
    >
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggleBox, checked && styles.toggleBoxOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
    </Pressable>
  );
}

export function TiendaFiltersModal({
  visible,
  value,
  onChange,
  onClose,
}: TiendaFiltersModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("tienda.filtersTitle")}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#9ca3af" />
            </Pressable>
          </View>

          <FilterToggle
            label={t("tienda.filterFeaturedOnly")}
            checked={value.featuredOnly}
            onPress={() => onChange({ ...value, featuredOnly: !value.featuredOnly })}
          />
          <FilterToggle
            label={t("tienda.filterFlashOnly")}
            checked={value.flashOnly}
            onPress={() => onChange({ ...value, flashOnly: !value.flashOnly })}
          />
          <FilterToggle
            label={t("tienda.filterFavoritesOnly")}
            checked={value.favoritesOnly}
            onPress={() => onChange({ ...value, favoritesOnly: !value.favoritesOnly })}
          />

          <View style={styles.actions}>
            <Pressable
              onPress={() =>
                onChange({
                  featuredOnly: false,
                  flashOnly: false,
                  favoritesOnly: false,
                })
              }
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryBtnText}>{t("tienda.filtersClear")}</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.primaryBtnText}>{t("tienda.filtersApply")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: "#141414",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    lineHeight: lineHeightFor(17),
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  toggleLabel: {
    color: "#e5e7eb",
    fontSize: 15,
    lineHeight: lineHeightFor(15),
  },
  toggleBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  toggleBoxOn: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  secondaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: "#d1d5db",
    fontSize: 14,
    fontWeight: "600",
  },
  primaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: ACCENT,
    paddingVertical: 12,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.85,
  },
});
