import { useCallback, useEffect, useMemo, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, TextStyle } from "react-native";
import {
  ActivityIndicator,
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
import {
  type StoreCollectionPublic,
  type TiendaProduct,
} from "../api/store";
import { useTiendaCatalog } from "../queries/store";
import { TiendaFiltersModal } from "../components/tienda/TiendaFiltersModal";
import { ProductFavoriteButton } from "../components/tienda/ProductFavoriteButton";
import { TiendaStockPill } from "../components/tienda/TiendaStockPill";
import { PagerDots, VerticalScrollHint } from "../components/ui/PagerDots";
import { SafeScrollView } from "../components/ui/SafeScrollView";
import { useTiendaFavorites } from "../hooks/useTiendaFavorites";
import { useCart } from "../contexts/CartContext";
import {
  countActiveFilters,
  DEFAULT_TIENDA_FILTERS,
  filterTiendaProducts,
  sortTiendaProducts,
  type TiendaCategoryId,
  type TiendaFilterFlags,
  type TiendaSortMode,
} from "../lib/tiendaCatalog";
import { lineHeightFor, theme } from "../theme";
import { useTranslation } from "../i18n";

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

function collectionBannerHeightForPlatform(): number {
  return Math.round(theme.screenWidth * 0.52);
}

const COLLECTION_BANNER_W = theme.screenWidth;
const COLLECTION_BANNER_H = collectionBannerHeightForPlatform();
const FLASH_CARD_W = flashCardWidthForPlatform();
const FEAT_CARD_W = featuredCardWidthForPlatform();
const FLASH_TITLE_MAX_LEN = 24;

function truncateFlashTitle(value: string, maxLen = FLASH_TITLE_MAX_LEN): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trimEnd()}…`;
}

function computeFlashCountdown(endsAt: string | null | undefined) {
  if (!endsAt?.trim()) {
    return { h: "00", m: "00", s: "00", expired: true };
  }
  const endsMs = Date.parse(endsAt);
  if (Number.isNaN(endsMs)) {
    return { h: "00", m: "00", s: "00", expired: true };
  }
  const diff = endsMs - Date.now();
  if (diff <= 0) {
    return { h: "00", m: "00", s: "00", expired: true };
  }
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return {
    h: String(h).padStart(2, "0"),
    m: String(m).padStart(2, "0"),
    s: String(s).padStart(2, "0"),
    expired: false,
  };
}

function useFlashCountdown(endsAt: string | null | undefined) {
  const [parts, setParts] = useState(() => computeFlashCountdown(endsAt));

  useEffect(() => {
    setParts(computeFlashCountdown(endsAt));
    if (!endsAt?.trim()) return;

    const endsMs = Date.parse(endsAt);
    if (Number.isNaN(endsMs)) return;

    const tick = () => {
      setParts(computeFlashCountdown(endsAt));
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return parts;
}

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

type CategoryId = TiendaCategoryId;

type Product = TiendaProduct;

const SORT_CYCLE: TiendaSortMode[] = [
  "featured",
  "price_low",
  "price_high",
  "name",
];

function sortModeLabel(mode: TiendaSortMode, t: (key: string) => string): string {
  if (mode === "price_low") return t("tienda.sortPriceLow");
  if (mode === "price_high") return t("tienda.sortPriceHigh");
  if (mode === "name") return t("tienda.sortName");
  return t("tienda.sortFeatured");
}

/** Icono + texto en fila: en Android, emoji + string en un mismo `Text` suele ocultar el texto. */
type IoniconName = ComponentProps<typeof Ionicons>["name"];

const CATEGORY_META: { id: CategoryId; icon: IoniconName }[] = [
  { id: "all", icon: "flame-outline" },
  { id: "palas", icon: "tennisball-outline" },
  { id: "pelotas", icon: "football-outline" },
  { id: "calzado", icon: "footsteps-outline" },
  { id: "ropa", icon: "shirt-outline" },
  { id: "accesorios", icon: "bag-handle-outline" },
];

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
  const { t } = useTranslation();
  const { favoriteIds, toggleFavorite, isFavorite } = useTiendaFavorites();
  const { addItem } = useCart();
  const [category, setCategory] = useState<CategoryId>("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<TiendaSortMode>("featured");
  const [filters, setFilters] = useState<TiendaFilterFlags>(DEFAULT_TIENDA_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<TiendaFilterFlags>(DEFAULT_TIENDA_FILTERS);
  const [activeCollection, setActiveCollection] = useState<{
    id: string;
    title: string;
    productIds: string[];
  } | null>(null);
  const [collectionBannerIndex, setCollectionBannerIndex] = useState(0);

  // Catálogo en React Query: el caché en memoria elimina el spinner al remontar.
  const {
    products,
    flashCampaign,
    flashApiProducts,
    collections,
    loading,
    isError,
    refetch: loadProducts,
  } = useTiendaCatalog();
  const error = isError ? t("tienda.loadError") : null;

  const categories = useMemo(
    () =>
      CATEGORY_META.map((c) => ({
        ...c,
        label: t(`tienda.categories.${c.id}`),
      })),
    [t],
  );

  const browseBase = useMemo(
    () =>
      filterTiendaProducts(products, {
        category,
        search,
        filters: {
          ...filters,
          featuredOnly: false,
          flashOnly: false,
        },
      }),
    [products, category, search, filters],
  );

  const filtered = useMemo(
    () =>
      sortTiendaProducts(
        filterTiendaProducts(products, {
          category,
          search,
          filters,
          productIds: activeCollection?.productIds ?? null,
          favoriteIds,
        }),
        sortMode,
      ),
    [products, category, search, filters, sortMode, activeCollection, favoriteIds],
  );

  const flashProducts = useMemo(() => {
    if (!flashCampaign?.enabled || flashApiProducts.length === 0) return [];
    return filterTiendaProducts(flashApiProducts, {
      category,
      search,
      filters: {
        ...filters,
        featuredOnly: false,
        flashOnly: false,
      },
    });
  }, [flashCampaign, flashApiProducts, category, search, filters]);

  const flashEndsAt = flashCampaign?.ends_at ?? null;
  const flashCountdown = useFlashCountdown(flashEndsAt);
  const flashTitle = truncateFlashTitle(
    flashCampaign?.title?.trim() || t("common.flashDeals"),
  );
  const showFlashSection =
    Boolean(flashEndsAt) &&
    !flashCountdown.expired &&
    flashApiProducts.length > 0;
  const flashCarouselProducts =
    flashProducts.length > 0 ? flashProducts : flashApiProducts;

  const featuredProducts = useMemo(
    () => browseBase.filter((p) => p.isFeatured),
    [browseBase],
  );

  const activeFilterCount = countActiveFilters(filters);
  const hasBrowseConstraints =
    category !== "all" ||
    search.trim().length > 0 ||
    activeFilterCount > 0 ||
    activeCollection != null;

  const count = filtered.length;
  const sortLabel = sortModeLabel(sortMode, t);

  const openFilters = () => {
    setDraftFilters(filters);
    setFiltersOpen(true);
  };

  const cycleSortMode = () => {
    setSortMode((current) => {
      const idx = SORT_CYCLE.indexOf(current);
      return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
    });
  };

  const renderSortControl = () => (
    <Pressable
      onPress={cycleSortMode}
      style={({ pressed }) => [
        Platform.OS === "android" ? styles.sortWrapAndroid : styles.sortWrap,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.sortLabelWrap}>
        <Text style={[styles.sortLabel, textBase(12, "600")]} numberOfLines={1}>
          {sortLabel}
        </Text>
      </View>
      <Ionicons name="chevron-down" size={14} color="#6b7280" />
    </Pressable>
  );

  const renderFilterButton = () => (
    <Pressable
      onPress={openFilters}
      style={({ pressed }) => [styles.filterBtn, pressed && styles.pressed]}
    >
      <Ionicons name="options-outline" size={16} color="#9ca3af" />
      <Text style={[styles.filterBtnText, textBase(12, "600")]}>{t("tienda.filters")}</Text>
      {activeFilterCount > 0 ? (
        <View style={styles.filterBadge}>
          <Text style={[styles.filterBadgeText, textBase(10, "700")]}>{activeFilterCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
  const gridCardWidth = gridCardWidthForPlatform();

  const onCollectionBannerScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / COLLECTION_BANNER_W);
      setCollectionBannerIndex(Math.min(Math.max(index, 0), collections.length - 1));
    },
    [collections.length],
  );

  useEffect(() => {
    setCollectionBannerIndex(0);
  }, [collections.length]);

  const showCollectionCarousel =
    !loading &&
    collections.length > 1 &&
    !activeCollection &&
    !filters.favoritesOnly;

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.fullScreenLoader}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces
      >
        <View style={styles.heroTop}>
          <Text style={[styles.proShop, textBase(11, "700")]}>{t("common.proShop")}</Text>
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
              placeholder={t("tienda.searchPlaceholder")}
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
          {categories.map((c) => {
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
              {renderFilterButton()}
              <Text style={[styles.count, textBase(11, "500")]}>
                {t("common.itemsCount", { count })}
              </Text>
            </View>
            {renderSortControl()}
          </View>
        ) : (
          <View style={styles.filterRow}>
            {renderFilterButton()}
            {renderSortControl()}
            <Text style={[styles.count, textBase(11, "500")]}>
              {t("common.itemsCount", { count })}
            </Text>
          </View>
        )}

        {!loading && !showCollectionCarousel ? <VerticalScrollHint /> : null}

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={[styles.errorText, textBase(13, "500")]}>{error}</Text>
            <Pressable
              onPress={() => void loadProducts()}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
            >
              <Text style={[styles.retryText, textBase(12, "700")]}>{t("common.retry")}</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && collections.length > 0 && !activeCollection && !filters.favoritesOnly ? (
          collections.length === 1 ? (
            <CollectionBanner
              collection={collections[0]}
              onPressCta={() =>
                setActiveCollection({
                  id: collections[0].id,
                  title: collections[0].title,
                  productIds: collections[0].product_ids,
                })
              }
            />
          ) : (
            <View style={styles.collectionsCarouselWrap}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={COLLECTION_BANNER_W}
                snapToAlignment="start"
                scrollEventThrottle={16}
                onScroll={onCollectionBannerScroll}
                contentContainerStyle={styles.collectionsRow}
              >
                {collections.map((collection) => (
                  <CollectionBanner
                    key={collection.id}
                    collection={collection}
                    onPressCta={() =>
                      setActiveCollection({
                        id: collection.id,
                        title: collection.title,
                        productIds: collection.product_ids,
                      })
                    }
                  />
                ))}
              </ScrollView>
              <PagerDots count={collections.length} activeIndex={collectionBannerIndex} />
            </View>
          )
        ) : null}

        {activeCollection ? (
          <View style={styles.collectionChipRow}>
            <View style={styles.collectionChip}>
              <Text style={[styles.collectionChipText, textBase(11, "600")]} numberOfLines={1}>
                {activeCollection.title}
              </Text>
              <Pressable
                onPress={() => setActiveCollection(null)}
                hitSlop={8}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Ionicons name="close-circle" size={18} color="#9ca3af" />
              </Pressable>
            </View>
          </View>
        ) : null}

        {!loading && !filters.flashOnly && !filters.favoritesOnly && showFlashSection ? (
          <View style={styles.section}>
            <View style={styles.flashSectionHead}>
              <View style={styles.flashSectionTitleRow}>
                <Ionicons name="flash" size={20} color={ACCENT} style={styles.flashSectionIcon} />
                <Text
                  style={[styles.flashSectionTitle, textBase(16, "700")]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {flashTitle}
                </Text>
              </View>
              <View style={styles.timerRow}>
                <TimerBox value={flashCountdown.h} />
                <Text style={styles.timerSep}>:</Text>
                <TimerBox value={flashCountdown.m} />
                <Text style={styles.timerSep}>:</Text>
                <TimerBox value={flashCountdown.s} dim />
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScrollPad}
            >
              {flashCarouselProducts.map((p) => (
                <FlashCard
                  key={p.id}
                  product={p}
                  cardWidth={FLASH_CARD_W}
                  t={t}
                  isFavorite={isFavorite(p.id)}
                  onToggleFavorite={toggleFavorite}
                  onAddToCart={addItem}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!loading &&
        !filters.featuredOnly &&
        !filters.flashOnly &&
        !filters.favoritesOnly &&
        featuredProducts.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="star" size={18} color="#eab308" />
                <Text style={[styles.sectionTitle, textBase(16, "700")]}>
                  {t("common.featured")}
                </Text>
              </View>
              <Pressable style={({ pressed }) => pressed && styles.pressed}>
                <View style={styles.seeAllRow}>
                  <Text style={[styles.seeAll, textBase(11, "600")]}>{t("common.seeAll")}</Text>
                  <Ionicons name="chevron-forward" size={14} color={ACCENT} />
                </View>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScrollPad}
            >
              {featuredProducts.map((p) => (
                <FeaturedCard
                  key={p.id}
                  product={p}
                  cardWidth={FEAT_CARD_W}
                  isFavorite={isFavorite(p.id)}
                  onToggleFavorite={toggleFavorite}
                  onAddToCart={addItem}
                  t={t}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!loading ? (
          <View style={styles.gridSection}>
            <Text style={[styles.gridTitle, textBase(16, "700")]}>
              {t("tienda.gridTitleAll")}
              <Text style={styles.gridTitleMuted}> ({count})</Text>
            </Text>
            {filtered.length === 0 ? (
              <Text style={[styles.emptyText, textBase(14, "500")]}>
                {filters.favoritesOnly
                  ? t("tienda.emptyFavorites")
                  : hasBrowseConstraints
                    ? t("tienda.emptySearch")
                    : t("tienda.emptyProducts")}
              </Text>
            ) : (
              <View style={styles.grid}>
                {filtered.map((p) => (
                  <GridProduct
                    key={p.id}
                    product={p}
                    cardWidth={gridCardWidth}
                    t={t}
                    isFavorite={isFavorite(p.id)}
                    onToggleFavorite={toggleFavorite}
                    onAddToCart={addItem}
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}
      </SafeScrollView>

      <TiendaFiltersModal
        visible={filtersOpen}
        value={draftFilters}
        onChange={setDraftFilters}
        onClose={() => {
          setFilters(draftFilters);
          setFiltersOpen(false);
        }}
      />
    </View>
  );
}

function CollectionBanner({
  collection,
  onPressCta,
}: {
  collection: StoreCollectionPublic;
  onPressCta: () => void;
}) {
  const imageUrl = collection.image_url?.trim();
  if (!imageUrl) return null;

  return (
    <Pressable
      onPress={onPressCta}
      style={({ pressed }) => [styles.collectionBanner, pressed && styles.pressed]}
    >
      <Image source={{ uri: imageUrl }} style={styles.collectionBannerImg} resizeMode="cover" />
      <LinearGradient
        colors={["rgba(241,143,52,0.92)", "rgba(241,143,52,0.45)", "transparent"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.collectionBannerTextBlock}>
        <Text style={[styles.collectionBannerTitle, textBase(26, "800")]} numberOfLines={2}>
          {collection.title}
        </Text>
        {collection.subtitle ? (
          <Text style={[styles.collectionBannerSub, textBase(14, "500")]} numberOfLines={2}>
            {collection.subtitle}
          </Text>
        ) : null}
        <View style={styles.bannerCta}>
          <Text style={[styles.bannerCtaText, textBase(12, "700")]}>
            {collection.cta_text?.trim() || "Ver colección"}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={BG} />
        </View>
      </View>
    </Pressable>
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
  t,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
}: {
  product: Product;
  cardWidth: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  isFavorite: boolean;
  onToggleFavorite: (productId: string) => void;
  onAddToCart: (product: Product) => void;
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
        <View style={styles.gridBadges}>
          {product.isFlashDeal ? (
            <View style={styles.flashBadge}>
              <Ionicons name="flash" size={10} color="#fff" />
              <Text style={[styles.flashBadgeText, textBase(9, "800")]}>
                {t("common.flashBadge")}
              </Text>
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
        <ProductFavoriteButton
          productId={product.id}
          isFavorite={isFavorite}
          onToggle={onToggleFavorite}
          size={14}
          style={styles.gridHeart}
        />
        <TiendaStockPill display={product.stockDisplay} t={t} />
      </View>
      <View style={styles.flashBody}>
        <Text style={[styles.flashBrand, textBase(10, "600")]}>{product.brand}</Text>
        <Text style={[styles.flashName, textBase(12, "700")]}>{product.name}</Text>
        <View style={styles.flashFooter}>
          <View style={styles.flashPriceCol}>
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
          <Pressable
            onPress={() => onAddToCart(product)}
            hitSlop={6}
            accessibilityLabel={t("nav.tiendaCart")}
            style={({ pressed }) => [styles.gridCart, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function FeaturedCard({
  product,
  cardWidth,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
  t,
}: {
  product: Product;
  cardWidth: number;
  isFavorite: boolean;
  onToggleFavorite: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
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
          <ProductFavoriteButton
            productId={product.id}
            isFavorite={isFavorite}
            onToggle={onToggleFavorite}
            size={18}
            style={styles.heartBtn}
          />
          <View style={styles.gridBadges}>
            {product.isFeatured ? (
              <View style={styles.featuredBadge}>
                <Ionicons name="star" size={11} color="#fff" />
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
          <TiendaStockPill display={product.stockDisplay} t={t} />
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
            <Pressable
              onPress={() => onAddToCart(product)}
              hitSlop={6}
              accessibilityLabel={t("nav.tiendaCart")}
              style={({ pressed }) => [styles.cartRound, pressed && styles.pressed]}
            >
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
  t,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
}: {
  product: Product;
  cardWidth: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  isFavorite: boolean;
  onToggleFavorite: (productId: string) => void;
  onAddToCart: (product: Product) => void;
}) {
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
          {product.isFlashDeal ? (
            <View style={styles.flashBadge}>
              <Ionicons name="flash" size={10} color="#fff" />
              <Text style={[styles.flashBadgeText, textBase(9, "800")]}>
                {t("common.flashBadge")}
              </Text>
            </View>
          ) : null}
          {product.isFeatured ? (
            <View style={styles.featuredBadge}>
              <Ionicons name="star" size={11} color="#fff" />
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
        <TiendaStockPill display={product.stockDisplay} t={t} />
        <ProductFavoriteButton
          productId={product.id}
          isFavorite={isFavorite}
          onToggle={onToggleFavorite}
          size={14}
          style={styles.gridHeart}
        />
      </View>
      <View style={styles.gridBody}>
        <Text style={[styles.gridBrand, textBase(9, "700")]}>{product.brand}</Text>
        <Text style={[styles.gridName, textBase(13, "600")]}>{product.name}</Text>
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
          <Pressable
            onPress={() => onAddToCart(product)}
            hitSlop={6}
            accessibilityLabel={t("nav.tiendaCart")}
            style={({ pressed }) => [styles.gridCart, pressed && styles.pressed]}
          >
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
  errorBanner: {
    marginHorizontal: TIENDA_PAD_H,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: 12,
    backgroundColor: "rgba(227,30,36,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(227,30,36,0.35)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  errorText: {
    color: "#fca5a5",
    flex: 1,
  },
  fullScreenLoader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  retryText: {
    color: ACCENT,
  },
  emptyText: {
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: TIENDA_PAD_H,
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
    position: "relative",
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ACCENT,
  },
  filterBadgeText: {
    color: "#fff",
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
  collectionsCarouselWrap: {
    marginBottom: theme.spacing.lg,
  },
  collectionsRow: {},
  collectionBanner: {
    width: COLLECTION_BANNER_W,
    height: COLLECTION_BANNER_H,
    overflow: "hidden",
    backgroundColor: CARD,
  },
  collectionBannerImg: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  collectionBannerTextBlock: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingLeft: TIENDA_PAD_H,
    paddingRight: 96,
    maxWidth: "78%",
  },
  collectionBannerTitle: {
    color: "#fff",
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  collectionBannerSub: {
    color: "rgba(255,255,255,0.95)",
    marginBottom: theme.spacing.md,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  collectionChipRow: {
    paddingHorizontal: TIENDA_PAD_H,
    marginBottom: theme.spacing.sm,
  },
  collectionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  collectionChipText: {
    color: "#e5e7eb",
    flexShrink: 1,
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
  section: {
    marginBottom: theme.spacing.lg,
  },
  flashSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "nowrap",
    paddingHorizontal: TIENDA_PAD_H,
    marginBottom: theme.spacing.sm,
    gap: 10,
  },
  flashSectionTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  flashSectionIcon: {
    flexShrink: 0,
  },
  flashSectionTitle: {
    flex: 1,
    minWidth: 0,
    color: "#fff",
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
    flexShrink: 0,
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
  flashFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  flashPriceCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 4,
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
  flashBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "#dc2626",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  flashBadgeText: {
    color: "#fff",
    letterSpacing: 0.4,
  },
  featuredBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(234, 179, 8, 0.95)",
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
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
