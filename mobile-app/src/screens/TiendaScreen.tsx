import { useMemo, useState } from "react";
import type { StyleProp, TextStyle } from "react-native";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { lineHeightFor, theme } from "../theme";

/** Mismo ritmo horizontal que `PartidosScreen` y el resto de listas (`theme.spacing.lg`). */
const TIENDA_PAD_H = theme.spacing.lg;
const TIENDA_GRID_GAP = 12;

function gridCardWidthForPlatform(): number {
  const inner = theme.screenWidth - TIENDA_PAD_H * 2;
  if (Platform.OS === "android") {
    return Math.floor(inner);
  }
  return Math.floor((inner - TIENDA_GRID_GAP) / 2);
}

function flashCardWidthForPlatform(): number {
  const inner = theme.screenWidth - TIENDA_PAD_H * 2;
  if (Platform.OS === "android") {
    return Math.min(Math.floor(inner * 0.88), 320);
  }
  return 160;
}

function featuredCardWidthForPlatform(): number {
  const inner = theme.screenWidth - TIENDA_PAD_H * 2;
  if (Platform.OS === "android") {
    return Math.min(Math.floor(inner * 0.86), 300);
  }
  return 200;
}

const FLASH_CARD_W = flashCardWidthForPlatform();
const FEAT_CARD_W = featuredCardWidthForPlatform();

const CHAR_EURO = "\u20AC";

/** Deja solo la parte numérica (quita €, U+20AC, EUR, espacios finales). Sin regex `u` (Hermes). */
function parsePriceAmount(value: string): string {
  let s = value.trim();
  for (let i = 0; i < 8; i += 1) {
    const lower = s.toLowerCase();
    if (lower.endsWith("eur")) {
      s = s.slice(0, -3).trim();
      continue;
    }
    if (s.endsWith("€") || s.endsWith(CHAR_EURO)) {
      s = s.slice(0, -1).trim();
      continue;
    }
    if (s.endsWith("\u00a0") || s.endsWith(" ")) {
      s = s.trimEnd();
      continue;
    }
    break;
  }
  return s;
}

/**
 * Número y € en dos `Text`: en Android un solo nodo con "289€" suele recortar el símbolo (precios naranjas Flash).
 */
function PriceWithEuro({
  raw,
  style,
}: {
  raw: string;
  style: StyleProp<TextStyle>;
}) {
  const amount = parsePriceAmount(raw);
  return (
    <View style={styles.euroSplitRow}>
      <Text style={style}>{amount}</Text>
      <Text style={[style, styles.euroGlyph]}>{CHAR_EURO}</Text>
    </View>
  );
}

const BG = "#0F0F0F";
const ACCENT = "#F18F34";
const ACCENT_SOFT = "rgba(241, 143, 52, 0.35)";
const BORDER = "rgba(255,255,255,0.08)";
const CARD = "rgba(255,255,255,0.04)";

type CategoryId =
  | "all"
  | "palas"
  | "pelotas"
  | "calzado"
  | "ropa"
  | "accesorios";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

/** Icono + texto en fila: en Android, emoji + string en un mismo `Text` suele ocultar el texto. */
const CATEGORIES: { id: CategoryId; label: string; icon: IoniconName }[] = [
  { id: "all", label: "Todo", icon: "flame-outline" },
  { id: "palas", label: "Palas", icon: "tennisball-outline" },
  { id: "pelotas", label: "Pelotas", icon: "football-outline" },
  { id: "calzado", label: "Calzado", icon: "footsteps-outline" },
  { id: "ropa", label: "Ropa", icon: "shirt-outline" },
  { id: "accesorios", label: "Accesorios", icon: "bag-handle-outline" },
];

type Product = {
  id: string;
  brand: string;
  name: string;
  price: string;
  oldPrice?: string;
  image: string;
  rating: string;
  reviews: string;
  badgeHot?: boolean;
  badgePct?: string;
  stockNote?: string;
  category: CategoryId;
};

const PRODUCTS: Product[] = [
  {
    id: "1",
    brand: "Nox",
    name: "Pala Nox AT10 Luxury",
    price: "349€",
    oldPrice: "399€",
    image:
      "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&fit=crop",
    rating: "4.9",
    reviews: "156",
    badgeHot: true,
    badgePct: "-13%",
    stockNote: "Quedan 5",
    category: "palas",
  },
  {
    id: "2",
    brand: "Bullpadel",
    name: "Pala Bullpadel Hack 03",
    price: "289€",
    oldPrice: "349€",
    image:
      "https://images.unsplash.com/photo-1767128890439-1af9ca2ff1ac?w=800&fit=crop",
    rating: "4.8",
    reviews: "124",
    badgeHot: true,
    badgePct: "-17%",
    category: "palas",
  },
  {
    id: "3",
    brand: "Adidas",
    name: "Mochila Adidas Padel Tour",
    price: "79€",
    oldPrice: "99€",
    image:
      "https://images.unsplash.com/photo-1622560481979-f5b0174242a0?w=800&fit=crop",
    rating: "4.7",
    reviews: "67",
    badgeHot: true,
    badgePct: "-20%",
    category: "accesorios",
  },
  {
    id: "4",
    brand: "Asics",
    name: "Zapatillas Asics Gel Padel Pro",
    price: "129€",
    oldPrice: "159€",
    image:
      "https://images.unsplash.com/photo-1610000750238-28d5e469692d?w=800&fit=crop",
    rating: "4.6",
    reviews: "89",
    badgeHot: true,
    badgePct: "-19%",
    category: "calzado",
  },
  {
    id: "5",
    brand: "Hesacore",
    name: "Grip Hesacore Tour",
    price: "14.99€",
    image:
      "https://images.unsplash.com/photo-1569597773059-6d747e5f8ed5?w=800&fit=crop",
    rating: "4.5",
    reviews: "312",
    category: "accesorios",
  },
  {
    id: "6",
    brand: "Head",
    name: "Pelotas Head Padel Pro",
    price: "5.99€",
    image:
      "https://images.unsplash.com/photo-1599409091912-88526846d833?w=800&fit=crop",
    rating: "4.8",
    reviews: "203",
    category: "pelotas",
  },
  {
    id: "7",
    brand: "Adidas",
    name: "Pantalón Adidas Club",
    price: "44.99€",
    image:
      "https://images.unsplash.com/photo-1661474973381-130596c650c4?w=800&fit=crop",
    rating: "4.6",
    reviews: "78",
    category: "ropa",
  },
  {
    id: "8",
    brand: "Wilson",
    name: "Camiseta técnica Wilson",
    price: "34.99€",
    image:
      "https://images.unsplash.com/photo-1659081469066-c88ca2dec240?w=800&fit=crop",
    rating: "4.2",
    reviews: "45",
    category: "ropa",
  },
];

const FLASH = PRODUCTS.slice(0, 4);
const FEATURED = PRODUCTS.slice(0, 4);

/**
 * En Android, `elevation` en el mismo nodo que `overflow: 'hidden'` y texto multilínea suele recortar
 * glifos (véase comentario en `PartidosScreen` FAB). Sombras solo en iOS; Android plano.
 */
function cardShadow() {
  if (Platform.OS === "android") {
    return {};
  }
  return {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  };
}

const androidText = Platform.select({
  android: {
    paddingVertical: 1,
    textBreakStrategy: "simple" as const,
  },
  default: {},
});

function textBase(size: number, weight: "400" | "500" | "600" | "700" | "800") {
  return {
    fontSize: size,
    fontWeight: weight as "400" | "500" | "600" | "700" | "800",
    lineHeight: lineHeightFor(size),
    ...androidText,
  };
}

export function TiendaScreen() {
  const [category, setCategory] = useState<CategoryId>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (category === "all") return PRODUCTS;
    return PRODUCTS.filter((p) => p.category === category);
  }, [category]);

  const count = filtered.length;
  const gridCardWidth = gridCardWidthForPlatform();

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces
      >
        <View style={styles.heroTop}>
          <Text style={[styles.proShop, textBase(11, "700")]}>PRO SHOP</Text>
          <View style={styles.searchWrap}>
            <Ionicons
              name="search"
              size={18}
              color="#6b7280"
              style={styles.searchIcon}
            />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar palas, zapatillas, ropa..."
              placeholderTextColor="#6b7280"
              style={styles.searchInput}
              underlineColorAndroid="transparent"
              returnKeyType="search"
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {CATEGORIES.map((c) => {
            const active = category === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategory(c.id)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                {active ? (
                  <LinearGradient
                    colors={[ACCENT, "#FFB347"]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                <View style={styles.chipInner}>
                  <Ionicons
                    name={c.icon}
                    size={15}
                    color={active ? "#fff" : "#9ca3af"}
                    style={styles.chipIcon}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      textBase(13, "600"),
                      active && styles.chipTextActive,
                      styles.chipLabelOnGradient,
                    ]}
                  >
                    {c.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {Platform.OS === "android" ? (
          <View style={styles.filterColumnAndroid}>
            <View style={styles.filterTopRowAndroid}>
              <Pressable
                style={({ pressed }) => [styles.filterBtn, pressed && styles.pressed]}
              >
                <Ionicons name="options-outline" size={16} color="#9ca3af" />
                <Text style={[styles.filterBtnText, textBase(12, "600")]}>Filtros</Text>
              </Pressable>
              <Text style={[styles.count, textBase(11, "500")]}>
                {count} items
              </Text>
            </View>
            <View style={styles.sortWrapAndroid}>
              <View style={styles.sortLabelWrap}>
                <Text style={[styles.sortLabel, textBase(12, "600")]}>Destacados</Text>
              </View>
              <Ionicons name="chevron-down" size={14} color="#6b7280" />
            </View>
          </View>
        ) : (
          <View style={styles.filterRow}>
            <Pressable
              style={({ pressed }) => [styles.filterBtn, pressed && styles.pressed]}
            >
              <Ionicons name="options-outline" size={16} color="#9ca3af" />
              <Text style={[styles.filterBtnText, textBase(12, "600")]}>Filtros</Text>
            </Pressable>
            <View style={styles.sortWrap}>
              <View style={styles.sortLabelWrap}>
                <Text style={[styles.sortLabel, textBase(12, "600")]}>Destacados</Text>
              </View>
              <Ionicons name="chevron-down" size={14} color="#6b7280" />
            </View>
            <Text style={[styles.count, textBase(11, "500")]}>
              {count} items
            </Text>
          </View>
        )}

        <View style={styles.bannerOuter}>
          <Image
            source={{
              uri: "https://images.unsplash.com/photo-1717138751802-135ce738e36b?w=800&fit=crop",
            }}
            style={styles.bannerImg}
            resizeMode="cover"
          />
          <LinearGradient
            colors={["rgba(241,143,52,0.92)", "rgba(241,143,52,0.45)", "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.bannerTextBlock}>
            <Text style={[styles.bannerTitle, textBase(26, "800")]}>
              Nueva Colección
            </Text>
            <Text style={[styles.bannerSub, textBase(14, "500")]}>
              Primavera 2026
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.bannerCta,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={[styles.bannerCtaText, textBase(12, "700")]}>
                Explorar ahora
              </Text>
              <Ionicons name="arrow-forward" size={16} color={BG} />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.aiCard, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[
              "rgba(227,30,36,0.14)",
              "rgba(147,22,26,0.55)",
              "rgba(174,25,29,0.4)",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.aiIcon}>
            <LinearGradient
              colors={[ACCENT, "#FFB347"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons
              name="sparkles"
              size={22}
              color="#fff"
              style={styles.aiIconGlyph}
            />
          </View>
          <View style={styles.aiTextCol}>
            <Text style={[styles.aiTitle, textBase(15, "700")]}>
              Tu IA personal de compras
            </Text>
            <Text style={[styles.aiSub, textBase(12, "400")]}>
              Recomendaciones según tu nivel y estilo
            </Text>
          </View>
          <View style={styles.aiChevronWrap}>
            <Ionicons name="chevron-forward" size={22} color={ACCENT} />
          </View>
        </Pressable>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="flash" size={20} color={ACCENT} />
              <Text style={[styles.sectionTitle, textBase(16, "700")]}>
                Flash Deals
              </Text>
            </View>
            <View style={styles.timerRow}>
              <TimerBox value="05" />
              <Text style={styles.timerSep}>:</Text>
              <TimerBox value="41" />
              <Text style={styles.timerSep}>:</Text>
              <TimerBox value="55" dim />
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScrollPad}
          >
            {FLASH.map((p) => (
              <FlashCard key={p.id} product={p} cardWidth={FLASH_CARD_W} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="star" size={18} color="#eab308" />
              <Text style={[styles.sectionTitle, textBase(16, "700")]}>
                Destacados
              </Text>
            </View>
            <Pressable style={({ pressed }) => pressed && styles.pressed}>
              <View style={styles.seeAllRow}>
                <Text style={[styles.seeAll, textBase(11, "600")]}>Ver todo</Text>
                <Ionicons name="chevron-forward" size={14} color={ACCENT} />
              </View>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScrollPad}
          >
            {FEATURED.map((p) => (
              <FeaturedCard key={p.id} product={p} cardWidth={FEAT_CARD_W} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.gridSection}>
          <Text style={[styles.gridTitle, textBase(16, "700")]}>
            Todos los productos
            <Text style={styles.gridTitleMuted}> ({count})</Text>
          </Text>
          <View style={styles.grid}>
            {filtered.map((p) => (
              <GridProduct key={p.id} product={p} cardWidth={gridCardWidth} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function TimerBox({ value, dim }: { value: string; dim?: boolean }) {
  return (
    <View style={[styles.timerBox, dim && styles.timerBoxDim]}>
      <Text style={[styles.timerText, textBase(14, "700"), dim && styles.timerTextDim]}>
        {value}
      </Text>
    </View>
  );
}

function FlashCard({
  product,
  cardWidth,
}: {
  product: Product;
  cardWidth: number;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.flashCard,
        { width: cardWidth },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.flashImgWrap}>
        <Image source={{ uri: product.image }} style={styles.flashImg} />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)"]}
          style={StyleSheet.absoluteFill}
        />
        {product.badgePct ? (
          <View style={styles.pctBadge}>
            <Text style={[styles.pctBadgeText, textBase(10, "800")]}>
              {product.badgePct}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.flashBody}>
        <Text style={[styles.flashBrand, textBase(10, "600")]}>{product.brand}</Text>
        <Text style={[styles.flashName, textBase(12, "700")]}>{product.name}</Text>
        <View style={styles.flashPriceRow}>
          <PriceWithEuro
            raw={product.price}
            style={[styles.priceAccent, textBase(14, "800")]}
          />
          {product.oldPrice ? (
            <PriceWithEuro
              raw={product.oldPrice}
              style={[styles.priceOld, textBase(11, "500")]}
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function FeaturedCard({
  product,
  cardWidth,
}: {
  product: Product;
  cardWidth: number;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.featCard,
        { width: cardWidth },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.featGlass} pointerEvents="none" />
      <View style={styles.featContent}>
        <View style={styles.featImgWrap}>
          <Image source={{ uri: product.image }} style={styles.featImg} />
          <LinearGradient
            colors={["transparent", "transparent", "rgba(15,15,15,0.65)"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable style={styles.heartBtn}>
            <Ionicons name="heart-outline" size={18} color="rgba(255,255,255,0.85)" />
          </Pressable>
          <View style={styles.ratingPill}>
            <Ionicons name="star" size={12} color="#eab308" />
            <Text style={[styles.ratingPillText, textBase(10, "700")]}>
              {product.rating}
            </Text>
          </View>
        </View>
        <View style={styles.featBody}>
          <Text style={[styles.featBrand, textBase(9, "700")]}>{product.brand}</Text>
          <Text style={[styles.featName, textBase(14, "700")]}>{product.name}</Text>
          <View style={styles.featFooter}>
            <View style={styles.featPriceBlock}>
              <PriceWithEuro
                raw={product.price}
                style={[styles.featPrice, textBase(18, "800")]}
              />
              {product.oldPrice ? (
                <PriceWithEuro
                  raw={product.oldPrice}
                  style={[styles.featOld, textBase(12, "500")]}
                />
              ) : null}
            </View>
            <Pressable style={styles.cartRound}>
              <Ionicons name="cart-outline" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function GridProduct({
  product,
  cardWidth,
}: {
  product: Product;
  cardWidth: number;
}) {
  const fullStars = Math.min(5, Math.round(parseFloat(product.rating) || 0));
  return (
    <Pressable
      style={({ pressed }) => [
        styles.gridCard,
        { width: cardWidth },
        cardShadow(),
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.gridImgWrap}>
        <Image source={{ uri: product.image }} style={styles.gridImg} />
        <LinearGradient
          colors={["transparent", "rgba(15,15,15,0.75)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.gridBadges}>
          {product.badgeHot ? (
            <View style={styles.hotBadge}>
              <Ionicons name="flame" size={10} color="#fff" />
              <Text style={[styles.hotBadgeText, textBase(9, "800")]}>HOT</Text>
            </View>
          ) : null}
          {product.badgePct ? (
            <View style={styles.greenBadge}>
              <Text style={[styles.greenBadgeText, textBase(9, "800")]}>
                {product.badgePct}
              </Text>
            </View>
          ) : null}
        </View>
        {product.stockNote ? (
          <View style={styles.stockPill}>
            <Ionicons name="time-outline" size={11} color="#fff" />
            <Text style={[styles.stockPillText, textBase(9, "600")]}>
              {product.stockNote}
            </Text>
          </View>
        ) : null}
        <Pressable style={styles.gridHeart}>
          <Ionicons name="heart-outline" size={14} color="rgba(255,255,255,0.65)" />
        </Pressable>
      </View>
      <View style={styles.gridBody}>
        <Text style={[styles.gridBrand, textBase(9, "700")]}>{product.brand}</Text>
        <Text style={[styles.gridName, textBase(13, "600")]}>{product.name}</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Ionicons
              key={i}
              name="star"
              size={11}
              color={i <= fullStars ? "#eab308" : "#374151"}
            />
          ))}
          <Text style={[styles.reviews, textBase(10, "400")]}>
            {" "}
            ({product.reviews})
          </Text>
        </View>
        <View style={styles.gridFooter}>
          <View style={styles.gridPriceCol}>
            <PriceWithEuro
              raw={product.price}
              style={[styles.gridPrice, textBase(16, "800")]}
            />
            {product.oldPrice ? (
              <PriceWithEuro
                raw={product.oldPrice}
                style={[styles.gridOld, textBase(10, "500")]}
              />
            ) : null}
          </View>
          <Pressable style={styles.gridCart}>
            <Ionicons name="cart-outline" size={16} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.scrollBottomPadding + theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  heroTop: {
    paddingHorizontal: TIENDA_PAD_H,
    marginBottom: theme.spacing.sm,
  },
  proShop: {
    color: ACCENT,
    letterSpacing: 1.2,
    marginBottom: theme.spacing.sm,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    borderRadius: 14,
    minHeight: Platform.OS === "android" ? 48 : 44,
  },
  searchIcon: {
    marginLeft: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: "#fff",
    paddingVertical: 12,
    paddingRight: 14,
    fontSize: theme.fontSize.sm,
    lineHeight: lineHeightFor(theme.fontSize.sm),
    ...androidText,
  },
  chipsRow: {
    paddingHorizontal: TIENDA_PAD_H,
    paddingBottom: theme.spacing.sm,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    position: "relative",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "android" ? 12 : 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: CARD,
  },
  chipLabelOnGradient: {
    zIndex: 1,
  },
  chipInner: {
    flexDirection: "row",
    alignItems: "center",
    zIndex: 1,
    gap: 6,
  },
  chipIcon: {
    flexShrink: 0,
  },
  chipActive: {
    borderColor: ACCENT_SOFT,
  },
  chipText: {
    color: "#9ca3af",
  },
  chipTextActive: {
    color: "#fff",
  },
  pressed: {
    opacity: 0.88,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: TIENDA_PAD_H,
    marginBottom: theme.spacing.md,
  },
  filterColumnAndroid: {
    paddingHorizontal: TIENDA_PAD_H,
    marginBottom: theme.spacing.md,
    gap: 10,
    width: "100%",
  },
  filterTopRowAndroid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  sortWrapAndroid: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  filterBtnText: {
    color: "#9ca3af",
  },
  sortWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Platform.OS === "android" ? 10 : 12,
    paddingVertical: Platform.OS === "android" ? 9 : 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  sortLabelWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  sortLabel: {
    color: "#9ca3af",
    flexShrink: 1,
  },
  count: {
    color: "#6b7280",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
    minWidth: Platform.OS === "android" ? 56 : 48,
    textAlign: "right",
  },
  bannerOuter: {
    marginHorizontal: TIENDA_PAD_H,
    minHeight: 180,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: theme.spacing.lg,
    ...cardShadow(),
  },
  bannerImg: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    minHeight: 180,
  },
  bannerTextBlock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.spacing.lg,
    paddingBottom: Platform.OS === "android" ? theme.spacing.xl : theme.spacing.lg,
  },
  bannerTitle: {
    color: "#fff",
    marginBottom: 4,
    flexShrink: 1,
    width: "100%",
  },
  bannerSub: {
    color: "rgba(255,255,255,0.75)",
    marginBottom: 12,
  },
  bannerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  bannerCtaText: {
    color: BG,
  },
  aiCard: {
    position: "relative",
    marginHorizontal: TIENDA_PAD_H,
    borderRadius: 18,
    overflow: Platform.OS === "ios" ? "hidden" : "visible",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(241,143,52,0.22)",
    padding: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: theme.spacing.lg,
  },
  aiIcon: {
    position: "relative",
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {},
    }),
  },
  aiIconGlyph: {
    zIndex: 1,
  },
  aiTextCol: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
    ...Platform.select({
      android: { alignItems: "stretch" as const },
      default: {},
    }),
  },
  aiChevronWrap: {
    zIndex: 1,
  },
  aiTitle: {
    color: "#fff",
    marginBottom: 4,
    flexShrink: 1,
  },
  aiSub: {
    color: "#9ca3af",
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    rowGap: 8,
    paddingHorizontal: TIENDA_PAD_H,
    marginBottom: theme.spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
    marginRight: 8,
  },
  sectionTitle: {
    color: "#fff",
    flexShrink: 1,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timerBox: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 36,
    alignItems: "center",
  },
  timerBoxDim: {
    opacity: 0.45,
  },
  timerText: {
    color: "#fff",
    fontVariant: ["tabular-nums"],
  },
  timerTextDim: {
    color: "#fff",
  },
  timerSep: {
    color: ACCENT,
    fontWeight: "800",
    fontSize: 14,
  },
  seeAll: {
    color: ACCENT,
  },
  seeAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  hScrollPad: {
    paddingLeft: TIENDA_PAD_H,
    paddingRight: theme.spacing.sm,
    gap: 12,
  },
  flashCard: {
    borderRadius: 16,
    overflow: Platform.OS === "ios" ? "hidden" : "visible",
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
  },
  flashImgWrap: {
    aspectRatio: 4 / 3,
    width: "100%",
    overflow: "hidden",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  flashImg: {
    width: "100%",
    height: "100%",
  },
  pctBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
      },
      android: {},
    }),
  },
  pctBadgeText: {
    color: "#fff",
  },
  flashBody: {
    paddingTop: 12,
    paddingBottom: Platform.OS === "android" ? 14 : 12,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: CARD,
    ...Platform.select({
      android: { alignItems: "stretch" as const },
      default: {},
    }),
  },
  flashBrand: {
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  flashName: {
    color: "#fff",
    marginBottom: 8,
    width: "100%",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  /** Fila de precios en tarjetas Flash: ancho completo, wrap y baseline para que no se corten. */
  euroSplitRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexShrink: 0,
  },
  euroGlyph: {
    marginLeft: 3,
    ...Platform.select({
      android: { minWidth: 14, paddingRight: 1 },
      default: { minWidth: 12 },
    }),
  },
  flashPriceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 8,
    rowGap: 4,
    width: "100%",
    marginTop: 2,
    paddingBottom: Platform.OS === "android" ? 2 : 0,
    paddingRight: 4,
  },
  priceAccent: {
    color: ACCENT,
  },
  priceOld: {
    color: "#6b7280",
    textDecorationLine: "line-through",
  },
  featCard: {
    position: "relative",
    borderRadius: 16,
    overflow: Platform.OS === "ios" ? "hidden" : "visible",
  },
  featGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    zIndex: 0,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  featContent: {
    zIndex: 1,
  },
  featImgWrap: {
    aspectRatio: 1,
    width: "100%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  featImg: {
    width: "100%",
    height: "100%",
  },
  heartBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  ratingPill: {
    position: "absolute",
    bottom: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  ratingPillText: {
    color: "#fff",
  },
  featBody: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    position: "relative",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: Platform.OS === "android" ? "visible" : "hidden",
    ...Platform.select({
      android: { alignItems: "stretch" as const },
      default: {},
    }),
  },
  featBrand: {
    color: ACCENT,
    letterSpacing: Platform.OS === "android" ? 0.8 : 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  featName: {
    color: "#fff",
    marginBottom: 10,
    width: "100%",
  },
  featFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  featPriceBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  featPrice: {
    color: "#fff",
  },
  featOld: {
    color: "#6b7280",
    textDecorationLine: "line-through",
    marginTop: 2,
  },
  cartRound: {
    flexShrink: 0,
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {},
    }),
  },
  gridSection: {
    paddingHorizontal: TIENDA_PAD_H,
  },
  gridTitle: {
    color: "#fff",
    marginBottom: theme.spacing.sm,
  },
  gridTitleMuted: {
    color: "#6b7280",
    fontWeight: "400",
    fontSize: theme.fontSize.sm,
  },
  grid: {
    width: "100%",
    ...Platform.select({
      android: {
        flexDirection: "column",
        rowGap: 10,
      },
      default: {
        flexDirection: "row",
        flexWrap: "wrap",
        columnGap: TIENDA_GRID_GAP,
        rowGap: TIENDA_GRID_GAP,
      },
    }),
  },
  gridCard: {
    borderRadius: 16,
    overflow: Platform.OS === "ios" ? "hidden" : "visible",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
  },
  gridImgWrap: {
    aspectRatio: 4 / 3.5,
    width: "100%",
    overflow: "hidden",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  gridImg: {
    width: "100%",
    height: "100%",
  },
  gridBadges: {
    position: "absolute",
    top: 8,
    left: 8,
    gap: 6,
  },
  hotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  hotBadgeText: {
    color: "#fff",
    letterSpacing: 0.6,
  },
  greenBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(34,197,94,0.92)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  greenBadgeText: {
    color: "#fff",
  },
  stockPill: {
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
  stockPillText: {
    color: "#fff",
  },
  gridHeart: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  gridBody: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    width: "100%",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    ...Platform.select({
      android: { alignItems: "stretch" as const },
      default: {},
    }),
  },
  gridBrand: {
    color: "#6b7280",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  gridName: {
    color: "#fff",
    marginBottom: 8,
    width: "100%",
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    flexWrap: "wrap",
  },
  reviews: {
    color: "#6b7280",
  },
  gridFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
  },
  gridPriceCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    flexWrap: "wrap",
  },
  gridPrice: {
    color: "#fff",
  },
  gridOld: {
    color: "#525252",
    textDecorationLine: "line-through",
  },
  gridCart: {
    flexShrink: 0,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {},
    }),
  },
});
