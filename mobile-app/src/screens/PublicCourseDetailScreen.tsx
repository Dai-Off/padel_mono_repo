import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PublicCourse } from "../api/schoolCourses";
import { androidReadableText } from "../components/home/inicio/textStyles";
import { PublicCourseBookingSuccessModal } from "../components/schoolCourses/PublicCourseBookingSuccessModal";

const { width } = Dimensions.get("window");

type TabId = "info" | "coach" | "players";

interface PublicCourseDetailScreenProps {
  course: PublicCourse;
  onBack: () => void;
  onEnrollSuccess?: () => void;
  isReserved?: boolean;
}

export function PublicCourseDetailScreen({
  course,
  onBack,
  onEnrollSuccess,
  isReserved = false,
}: PublicCourseDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabId>("info");
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);

  const imageUrl =
    course.club_logo_url ||
    "https://images.unsplash.com/photo-1658491830143-72808ca237e3?w=400&h=300&fit=crop";

  const priceFormatted = `${Math.round(course.price_cents / 100)}€`;
  const levelText = course.level || "0 - 5.4";
  const slotsText = `${course.enrolled_count}/${course.capacity}`;

  // Formatear fecha para el ejemplo
  const dateText = "JUEVES, 29 DE ENERO · 11:30"; // Esto debería venir de course.starts_on y course.days

  const renderTabContent = () => {
    switch (activeTab) {
      case "info":
        return (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Detalles de la clase</Text>

              <View style={styles.rowStats}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>PRECIO</Text>
                  <Text style={styles.statValue}>{priceFormatted}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>NIVEL</Text>
                  <Text style={styles.statValue}>{levelText}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>PLAZAS</Text>
                  <Text style={styles.statValue}>{slotsText}</Text>
                </View>
              </View>

              <View style={styles.detailList}>
                <View style={styles.detailItem}>
                  <View style={styles.detailIconBox}>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color="#9CA3AF"
                    />
                  </View>
                  <View>
                    <Text style={styles.detailLabel}>FECHA</Text>
                    <Text style={styles.detailValue}>{dateText}</Text>
                  </View>
                </View>

                <View style={styles.detailItem}>
                  <View style={styles.detailIconBox}>
                    <Ionicons name="time-outline" size={18} color="#9CA3AF" />
                  </View>
                  <View>
                    <Text style={styles.detailLabel}>DURACIÓN</Text>
                    <Text style={styles.detailValue}>60 min</Text>
                  </View>
                </View>

                <View style={styles.detailItem}>
                  <View style={styles.detailIconBox}>
                    <Ionicons name="people-outline" size={18} color="#9CA3AF" />
                  </View>
                  <View>
                    <Text style={styles.detailLabel}>GÉNERO</Text>
                    <Text style={styles.detailValue}>Mixto</Text>
                  </View>
                </View>
              </View>

              <View style={styles.actionButtonsRow}>
                <Pressable style={styles.actionButton}>
                  <View
                    style={[
                      styles.actionIconBox,
                      { backgroundColor: "#F18F34" },
                    ]}
                  >
                    <Ionicons name="navigate-outline" size={20} color="white" />
                  </View>
                  <Text style={styles.actionLabel}>CÓMO LLEGAR</Text>
                </Pressable>
                <Pressable style={styles.actionButton}>
                  <View style={styles.actionIconBoxSecondary}>
                    <Ionicons name="globe-outline" size={20} color="#6B7280" />
                  </View>
                  <Text style={styles.actionLabel}>WEB</Text>
                </Pressable>
                <Pressable style={styles.actionButton}>
                  <View style={styles.actionIconBoxSecondary}>
                    <Ionicons name="call-outline" size={20} color="#6B7280" />
                  </View>
                  <Text style={styles.actionLabel}>LLAMAR</Text>
                </Pressable>
              </View>
            </View>

            {/* Club Card */}
            <View style={styles.cardClub}>
              <Image source={{ uri: imageUrl }} style={styles.clubThumb} />
              <View style={{ flex: 1 }}>
                <Text style={styles.clubName}>{course.club_name}</Text>
                <Text style={styles.clubAddress} numberOfLines={1}>
                  {course.club_address}
                </Text>
              </View>
              <View style={styles.clubMapIcon}>
                <Ionicons name="location-sharp" size={16} color="white" />
              </View>
            </View>

            {/* Methods Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Métodos de pago</Text>
              <View style={styles.paymentMethods}>
                <View style={styles.payItem}>
                  <Text style={{ fontSize: 18 }}>💳</Text>
                  <Text style={styles.payText}>
                    Tarjeta De Crédito O Débito
                  </Text>
                </View>
                <View style={styles.payItem}>
                  <Text style={{ fontSize: 18 }}>💰</Text>
                  <Text style={styles.payText}>Bono Monedero</Text>
                </View>
                <View style={styles.payItem}>
                  <Text style={{ fontSize: 18 }}>📱</Text>
                  <Text style={styles.payText}>Google Pay</Text>
                </View>
              </View>
            </View>
          </View>
        );
      case "coach":
        return (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Entrenador</Text>
              <View style={styles.coachRow}>
                <View style={styles.coachAvatarBox}>
                  <Text style={styles.coachInits}>
                    {(course.staff?.name || "MB")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.coachName}>
                    {course.staff?.name || "Marcos Blasco"}
                  </Text>
                  <Text style={styles.coachClub}>{course.club_name}</Text>
                  <Pressable>
                    <Text style={styles.viewProfile}>Ver perfil</Text>
                  </Pressable>
                </View>
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingText}>4.8</Text>
                </View>
              </View>
            </View>
          </View>
        );
      case "players":
        return (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Jugadores ({course.enrolled_count}/{course.capacity})
              </Text>
              <View style={styles.emptyPlayersBox}>
                <View style={styles.playersIconCircle}>
                  <Ionicons
                    name="people-outline"
                    size={24}
                    color="rgba(255,255,255,0.2)"
                  />
                </View>
                <Text style={styles.emptyPlayersText}>
                  Aún no hay jugadores
                </Text>
              </View>
              <Text style={styles.minPlayersHint}>
                Requiere un mínimo de 2 jugadores
              </Text>
            </View>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner */}
        <View style={styles.bannerContainer}>
          <Image source={{ uri: imageUrl }} style={styles.bannerImage} />
          <LinearGradient
            colors={["transparent", "rgba(15,15,15,0.5)", "#0F0F0F"]}
            style={styles.bannerGradient}
          />

          {/* Floating Header */}
          <View
            style={[styles.floatingHeader, { paddingTop: insets.top + 10 }]}
          >
            <Pressable onPress={onBack} style={styles.iconBtn}>
              <Ionicons name="arrow-back" size={20} color="white" />
            </Pressable>
            <View style={styles.headerRight}>
              <Pressable style={styles.iconBtn}>
                <Ionicons name="share-social-outline" size={20} color="white" />
              </Pressable>
              <Pressable style={styles.iconBtn}>
                <Ionicons name="heart-outline" size={20} color="white" />
              </Pressable>
            </View>
          </View>

          {/* Banner Info Content */}
          <View style={styles.bannerInfo}>
            <View style={styles.tagsRow}>
              <View style={styles.tagOrange}>
                <Text style={styles.tagText}>Nivelación</Text>
              </View>
              <View style={styles.tagGlass}>
                <Text style={styles.tagText}>Pádel</Text>
              </View>
            </View>
            <Text style={styles.mainTitle}>{course.name.toUpperCase()}</Text>
            <View style={styles.locationSmallRow}>
              <Ionicons
                name="location-outline"
                size={14}
                color="rgba(255,255,255,0.8)"
              />
              <Text style={styles.locationSmallText}>
                35km · {course.club_name}
              </Text>
            </View>
          </View>
        </View>

        {/* Custom Tab Bar */}
        <View style={styles.tabsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScroll}
          >
            <Pressable
              onPress={() => setActiveTab("info")}
              style={[
                styles.tabBtn,
                activeTab === "info" && styles.tabBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === "info" && styles.tabBtnTextActive,
                ]}
              >
                Información
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab("coach")}
              style={[
                styles.tabBtn,
                activeTab === "coach" && styles.tabBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === "coach" && styles.tabBtnTextActive,
                ]}
              >
                Entrenador
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab("players")}
              style={[
                styles.tabBtn,
                activeTab === "players" && styles.tabBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === "players" && styles.tabBtnTextActive,
                ]}
              >
                Jugadores
              </Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Body Content */}
        {renderTabContent()}
      </ScrollView>

      {/* Fixed Bottom Button */}
      {!isReserved && (
        <View
          style={[styles.bottomContainer, { paddingBottom: insets.bottom + 16 }]}
        >
          <LinearGradient
            colors={["#F18F34", "#E95F32"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.reserveBtnGradient}
          >
            <Pressable
              style={styles.reserveBtn}
              onPress={() => setIsSuccessModalVisible(true)}
            >
              <Text style={styles.reserveBtnText}>
                Reserva plaza - {priceFormatted}
              </Text>
            </Pressable>
          </LinearGradient>
        </View>
      )}

      <PublicCourseBookingSuccessModal
        visible={isSuccessModalVisible}
        onClose={() => setIsSuccessModalVisible(false)}
        onEnrollSuccess={onEnrollSuccess}
        course={course}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F0F",
  },
  scroll: {
    flex: 1,
  },
  bannerContainer: {
    height: 320,
    width: "100%",
    position: "relative",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  headerRight: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerInfo: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
  },
  tagsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  tagOrange: {
    backgroundColor: "#F18F34",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagGlass: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: androidReadableText({
    color: "white",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  }),
  mainTitle: androidReadableText({
    color: "white",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 4,
  }),
  locationSmallRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationSmallText: androidReadableText({
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
  }),
  // Tabs
  tabsWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  tabsScroll: {
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  tabBtnActive: {
    backgroundColor: "#F18F34",
  },
  tabBtnText: androidReadableText({
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  }),
  tabBtnTextActive: {
    fontWeight: "700",
  },
  // Cards
  tabContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardTitle: androidReadableText({
    color: "white",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 16,
  }),
  rowStats: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 12,
  },
  statLabel: androidReadableText({
    color: "rgba(255,255,255,0.5)",
    fontSize: 9,
    fontWeight: "800",
    marginBottom: 2,
  }),
  statValue: androidReadableText({
    color: "white",
    fontSize: 13,
    fontWeight: "800",
  }),
  detailList: {
    gap: 12,
    marginBottom: 20,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: androidReadableText({
    color: "#9CA3AF",
    fontSize: 9,
    fontWeight: "700",
  }),
  detailValue: androidReadableText({
    color: "white",
    fontSize: 13,
    fontWeight: "600",
  }),
  actionButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  actionIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconBoxSecondary: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: androidReadableText({
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  }),
  // Club Card
  cardClub: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  clubThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  clubName: androidReadableText({
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  }),
  clubAddress: androidReadableText({
    color: "#9CA3AF",
    fontSize: 12,
  }),
  clubMapIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F18F34",
    alignItems: "center",
    justifyContent: "center",
  },
  // Payments
  paymentMethods: {
    gap: 8,
  },
  payItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  payText: {
    color: "#D1D5DB",
    fontSize: 13,
    includeFontPadding: false,
    flex: 1,
  },
  // Coach
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  coachAvatarBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#F18F34",
    alignItems: "center",
    justifyContent: "center",
  },
  coachInits: androidReadableText({
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  }),
  coachName: androidReadableText({
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  }),
  coachClub: androidReadableText({
    color: "#9CA3AF",
    fontSize: 12,
  }),
  viewProfile: androidReadableText({
    color: "#F18F34",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  }),
  ratingBadge: {
    backgroundColor: "#FBBF24",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingText: androidReadableText({
    color: "#1A1A1A",
    fontSize: 10,
    fontWeight: "900",
  }),
  // Players
  emptyPlayersBox: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    gap: 8,
    alignSelf: "stretch",
  },
  playersIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPlayersText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 13,
    textAlign: "center",
    includeFontPadding: false,
    alignSelf: "stretch",
  },
  minPlayersHint: {
    color: "#6B7280",
    fontSize: 10,
    marginTop: 12,
    textAlign: "center",
    includeFontPadding: false,
    alignSelf: "stretch",
  },
  // Bottom Button
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    backgroundColor: "rgba(15,15,15,0.9)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  reserveBtnGradient: {
    borderRadius: 20,
    shadowColor: "#F18F34",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  reserveBtn: {
    paddingVertical: 18,
    alignItems: "center",
  },
  reserveBtnText: androidReadableText({
    color: "white",
    fontSize: 14,
    fontWeight: "800",
  }),
});
