import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { PartidoItem, PartidoPlayer } from "../../screens/PartidosScreen";

const ACCENT = "#F18F34";
const ACCENT_END = "#E95F32";

const PLACEHOLDER_URIS = [
  "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400&h=300&fit=crop",
];

function pickPlaceholderUri(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h += id.charCodeAt(i);
  return PLACEHOLDER_URIS[h % PLACEHOLDER_URIS.length];
}

function splitDateTime(dateTime: string): {
  datePart: string;
  timePart: string;
} {
  const parts = dateTime.split(" · ");
  if (parts.length >= 2) {
    return {
      datePart: parts[0]?.trim() ?? "",
      timePart: parts[1]?.trim() ?? "",
    };
  }
  return { datePart: dateTime, timePart: "" };
}

function durationHuman(raw: string): string {
  const match = /^(\d+)/.exec(raw.trim());
  if (!match) return raw;
  const n = parseInt(match[1], 10);
  if (Number.isNaN(n)) return raw;
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return h === 1 ? "1 hora" : `${h} horas`;
  return `${h} hora${h > 1 ? "s" : ""} ${m} minutos`;
}

function countFree(players: PartidoPlayer[]): number {
  return players.filter((p) => p.isFree).length;
}

type Props = {
  item: PartidoItem;
  onPress: () => void;
  /** Ancho completo del padre (p. ej. una sola reserva en Inicio). */
  fullWidth?: boolean;
};

function PlayerFace({ player }: { player: PartidoPlayer }) {
  if (player.isFree) {
    return (
      <View style={styles.slotFree}>
        <Text style={styles.slotPlus}>+</Text>
      </View>
    );
  }
  return (
    <LinearGradient
      colors={[ACCENT, ACCENT_END]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.slotFill}
    >
      {player.avatar ? (
        <Image source={{ uri: player.avatar }} style={styles.slotAvatar} />
      ) : (
        <Text style={styles.slotInitials} numberOfLines={1}>
          {(player.initial ?? player.name?.slice(0, 2) ?? "?").toUpperCase()}
        </Text>
      )}
    </LinearGradient>
  );
}

/** Tarjeta alineada al listado web (imagen + meta + slots horizontales). */
export function PartidoOpenCard({ item, onPress, fullWidth }: Props) {
  const { datePart, timePart } = splitDateTime(item.dateTime);
  const uri = item.venueImage ?? pickPlaceholderUri(item.id);
  const libres = countFree(item.players);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        fullWidth && styles.cardFullWidth,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0.07)", "rgba(255,255,255,0.03)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.cardBorder} pointerEvents="none" />
      <View style={styles.inner}>
        <View style={styles.row}>
          <View style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} />
            <LinearGradient
              colors={["rgba(0,0,0,0.42)", "transparent"]}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={styles.thumbOverlay}
            />
            <View style={styles.priceTag}>
              <Text style={styles.priceLine}>
                <Text style={styles.priceMain}>{item.pricePerPlayer}</Text>
                <Text style={styles.priceSub}>
                  /{durationHuman(item.duration)}
                </Text>
              </Text>
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {item.venue}
            </Text>
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={14} color="#6b7280" />
              <Text style={styles.dateTxt} numberOfLines={1}>
                {datePart}
              </Text>
              {timePart ? (
                <>
                  <Text style={styles.dot}>•</Text>
                  <Text style={styles.timeTxt}>{timePart}</Text>
                </>
              ) : null}
            </View>
            <View style={styles.badgesColumn}>
              <View style={[styles.badge, styles.badgeBand]}>
                <Text style={styles.badgeTxt}>{item.typeLabel}</Text>
              </View>
              <View style={[styles.badge, styles.badgeBand]}>
                <Text style={styles.badgeTxt}>
                  📊 {item.levelRange.replace(/\./g, ",")}
                </Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={styles.slotsRow}
            >
              {item.players.map((p, i) => (
                <PlayerFace key={i} player={p} />
              ))}
              {libres > 0 ? (
                <Text style={styles.libresTxt}>{libres} libres</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const SLOT = 28;

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  cardFullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  pressed: { opacity: 0.92 },
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  inner: {
    padding: 12,
    position: "relative",
    zIndex: 2,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  thumbWrap: {
    width: 112,
    height: 112,
    borderRadius: 12,
    overflow: "hidden",
    flexShrink: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  thumb: { width: "100%", height: "100%" },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  priceTag: {
    position: "absolute",
    left: 6,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  priceLine: { lineHeight: 14 },
  priceMain: {
    fontSize: 12,
    fontWeight: "900",
    color: "#fff",
  },
  priceSub: {
    fontSize: 9,
    color: "#d1d5db",
    fontWeight: "600",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 20,
    paddingRight: 8,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
    marginBottom: 2,
  },
  dateTxt: {
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "500",
    flexShrink: 1,
  },
  dot: { fontSize: 12, color: "#4b5563" },
  timeTxt: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  /**
   * Dos filas a ancho completo: texto íntegro (sin …), ELO siempre debajo del tipo.
   * Evita el layout en columnas estrechas donde el tipo y el ELO competían en una fila.
   */
  badgesColumn: {
    flexDirection: "column",
    alignSelf: "stretch",
    gap: 6,
    marginBottom: 4,
    /** Misma altura mínima del bloque (tipo + ELO) entre cards; si el texto ocupa más, crece sin recortar. */
    minHeight: 54,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  badgeBand: {
    alignSelf: "stretch",
  },
  badgeTxt: {
    fontSize: 9,
    fontWeight: "700",
    color: "#d1d5db",
    textTransform: "uppercase",
    lineHeight: 12,
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  slotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingRight: 8,
  },
  slotFill: {
    width: SLOT,
    height: SLOT,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  slotAvatar: {
    width: SLOT,
    height: SLOT,
    borderRadius: 6,
  },
  slotInitials: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },
  slotFree: {
    width: SLOT,
    height: SLOT,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  slotPlus: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  libresTxt: {
    fontSize: 9,
    fontWeight: "800",
    color: ACCENT,
    marginLeft: 4,
    alignSelf: "center",
    flexShrink: 0,
    paddingRight: 12,
  },
});
