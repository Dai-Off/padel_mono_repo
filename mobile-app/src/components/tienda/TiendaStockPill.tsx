import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TiendaStockDisplay } from "../../api/store";
import { lineHeightFor } from "../../theme";

type TiendaStockPillProps = {
  display?: TiendaStockDisplay;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function tiendaStockPillLabel(
  display: TiendaStockDisplay,
  t: TiendaStockPillProps["t"],
): string {
  if (display.kind === "last_units") {
    if (display.count === 1) {
      return t("common.stockLastUnit");
    }
    return t("common.stockLastUnits");
  }
  return t("common.stockRemaining", { count: display.count });
}

export function TiendaStockPill({ display, t }: TiendaStockPillProps) {
  if (!display) return null;

  return (
    <View style={styles.pill}>
      <Ionicons name="time-outline" size={11} color="#fff" />
      <Text style={styles.text}>{tiendaStockPillLabel(display, t)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(249,115,22,0.92)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  text: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "600",
    lineHeight: lineHeightFor(9),
  },
});
