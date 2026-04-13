import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  fetchPublicCourses,
  PublicCourse,
  fetchMyEnrollments,
  CourseEnrollment,
} from "../api/schoolCourses";
import { fetchLearningCourses, EducationalCourse } from "../api/learning";
import { useAuth } from "../contexts/AuthContext";
import { PublicCourseCard } from "../components/schoolCourses/PublicCourseCard";
import { BookedCourseCard } from "../components/schoolCourses/BookedCourseCard";

const { width } = Dimensions.get("window");

type TabId = "apuntate" | "cursos" | "tusclases";

interface CoursesScreenProps {
  onBack: () => void;
  onCoursePress: (course: PublicCourse, isReserved: boolean) => void;
  refreshNonce?: number;
}

export function CoursesScreen({
  onBack,
  onCoursePress,
  refreshNonce,
}: CoursesScreenProps) {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabId>("apuntate");
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [eduCourses, setEduCourses] = useState<EducationalCourse[]>([]);
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [eduLoading, setEduLoading] = useState(false);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Filtros
  const [selectedSport, setSelectedSport] = useState<"padel" | "tenis" | null>(
    "padel",
  );
  const [filterPublic, setFilterPublic] = useState(true);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPublicCourses({
        sport: selectedSport || undefined,
      });
      if (res.ok) {
        setCourses(res.courses || []);
      }
    } catch (error) {
      console.error("Error loading courses:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSport]);

  const loadEduCourses = useCallback(async () => {
    if (!session?.access_token) return;
    setEduLoading(true);
    try {
      const res = await fetchLearningCourses(session.access_token);
      if (res.ok && res.courses) {
        setEduCourses(res.courses || []);
      }
    } catch (error) {
      console.error("Error loading educational courses:", error);
    } finally {
      setEduLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  const loadEnrollments = useCallback(async () => {
    if (!session?.access_token) return;
    setEnrollmentsLoading(true);
    try {
      const res = await fetchMyEnrollments(session.access_token);
      if (res.ok) {
        setEnrollments(res.enrollments || []);
      }
    } catch (error) {
      console.error("Error loading enrollments:", error);
    } finally {
      setEnrollmentsLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    loadCourses();
    loadEnrollments();
  }, [refreshNonce, loadCourses, loadEnrollments]);

  useEffect(() => {
    if (activeTab === "apuntate") {
      loadCourses();
    } else if (activeTab === "cursos") {
      loadEduCourses();
    } else if (activeTab === "tusclases") {
      loadEnrollments();
    }
  }, [loadCourses, loadEduCourses, loadEnrollments, activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    if (activeTab === "apuntate") {
      loadCourses();
    } else if (activeTab === "cursos") {
      loadEduCourses();
    } else {
      loadEnrollments();
    }
  };

  const filteredCourses = courses.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.club_name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <View style={styles.container}>
      {/* Header Fijo Premium */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </Pressable>
          <View style={styles.searchContainer}>
            <Ionicons
              name="search"
              size={16}
              color="rgba(255,255,255,0.4)"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar clases..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <Pressable style={styles.filterButton}>
            <Ionicons name="options-outline" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Tabs Premium */}
        <View style={styles.tabsContainer}>
          <Pressable
            onPress={() => setActiveTab("apuntate")}
            style={[styles.tab, activeTab === "apuntate" && styles.activeTab]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "apuntate" && styles.activeTabText,
              ]}
            >
              Apúntate
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("cursos")}
            style={[styles.tab, activeTab === "cursos" && styles.activeTab]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "cursos" && styles.activeTabText,
              ]}
            >
              Cursos
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("tusclases")}
            style={[styles.tab, activeTab === "tusclases" && styles.activeTab]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "tusclases" && styles.activeTabText,
              ]}
            >
              Tus clases
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#F18F34"
          />
        }
      >
        {/* Filtros Horizontales (Estilo Tailwind) */}
        <View style={styles.filtersWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersList}
          >
            <Pressable
              onPress={() => setFilterPublic(!filterPublic)}
              style={[
                styles.filterPill,
                filterPublic && styles.activeFilterPill,
              ]}
            >
              <MaterialCommunityIcons
                name="account-group-outline"
                size={16}
                color={filterPublic ? "#000" : "#fff"}
              />
              <Text
                style={[
                  styles.filterText,
                  filterPublic && styles.activeFilterText,
                ]}
              >
                Clases públicas
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                setSelectedSport(selectedSport === "padel" ? null : "padel")
              }
              style={[
                styles.filterPill,
                selectedSport === "padel" && styles.activeFilterPill,
              ]}
            >
              <MaterialCommunityIcons
                name="tennis-ball"
                size={16}
                color={selectedSport === "padel" ? "#000" : "#fff"}
              />
              <Text
                style={[
                  styles.filterText,
                  selectedSport === "padel" && styles.activeFilterText,
                ]}
              >
                Pádel
              </Text>
            </Pressable>

            <Pressable style={styles.filterPill}>
              <Ionicons name="location-outline" size={16} color="#fff" />
              <Text style={styles.filterText}>Cerca de mí</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Listado con Título "Hoy" o Vista de Cursos Educativos */}
        <View style={styles.mainContent}>
          {activeTab === "apuntate" ? (
            <>
              <Text style={styles.sectionTitle}>Hoy</Text>

              {loading && !refreshing ? (
                <View style={styles.loadingCenter}>
                  <ActivityIndicator size="large" color="#F18F34" />
                </View>
              ) : filteredCourses.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="school-outline"
                    size={64}
                    color="rgba(255,255,255,0.1)"
                  />
                  <Text style={styles.emptyText}>
                    No hay clases disponibles en este momento
                  </Text>
                </View>
              ) : (
                <View style={styles.listContainer}>
                  {(filteredCourses || []).map((course) => (
                    <PublicCourseCard
                      key={course.id}
                      course={course}
                      isReserved={(enrollments || []).some(e => e.course_id === course.id)}
                      onPress={() => {
                        const isRes = (enrollments || []).some(e => e.course_id === course.id);
                        onCoursePress(course, isRes);
                      }}
                    />
                  ))}
                </View>
              )}
            </>
          ) : activeTab === "cursos" ? (
            <View style={styles.eduContainer}>
              {eduLoading && !refreshing ? (
                <View style={styles.loadingCenter}>
                  <ActivityIndicator size="large" color="#F18F34" />
                </View>
              ) : (
                <>
                  {/* Para tu nivel */}
                  <EducationalSectionHeader title="Para tu nivel" />
                  <View style={styles.eduGrid}>
                    {(eduCourses || [])
                      .filter((c) => !c.locked)
                      .map((course) => (
                        <EducationalCourseCard
                          key={course.id}
                          course={course}
                        />
                      ))}
                  </View>

                  {/* Explora niveles superiores */}
                  <EducationalSectionHeader title="Explora niveles superiores" />
                  <View style={styles.eduGrid}>
                    {(eduCourses || [])
                      .filter((c) => c.locked)
                      .map((course) => (
                        <EducationalCourseCard
                          key={course.id}
                          course={course}
                        />
                      ))}
                  </View>

                  {(eduCourses || []).length === 0 && (
                    <View style={styles.emptyState}>
                      <Ionicons
                        name="layers-outline"
                        size={64}
                        color="rgba(255,255,255,0.1)"
                      />
                      <Text style={styles.emptyText}>
                        No hay cursos educativos disponibles
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          ) : (
            <View style={styles.tusClasesContent}>
              <View style={styles.tusClasesHeader}>
                <Text style={styles.sectionTitle}>
                  Tus clases reservadas ({(enrollments || []).length})
                </Text>
              </View>

              {enrollmentsLoading && !refreshing ? (
                <View style={styles.loadingCenter}>
                  <ActivityIndicator size="large" color="#F18F34" />
                </View>
              ) : (enrollments || []).length === 0 ? (
                <View style={styles.tusClasesEmptyContainer}>
                  <View style={styles.tusClasesIconWrapper}>
                    <View style={styles.tusClasesIconBackground}>
                      <Text style={styles.tusClasesEmoji}>🎾</Text>
                    </View>
                  </View>
                  <Text style={styles.tusClasesTitle}>No hay clases</Text>
                  <Text style={styles.tusClasesDescription}>
                    No tienes historial de clases planificadas pero siempre
                    puedes buscar una a la que apuntarte.
                  </Text>
                  <Pressable
                    onPress={() => setActiveTab("apuntate")}
                    style={styles.tusClasesButtonShadow}
                  >
                    <LinearGradient
                      colors={["#F18F34", "#E95F32"]}
                      style={styles.tusClasesButton}
                    >
                      <Text style={styles.tusClasesButtonText}>
                        Buscar clases disponibles
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.listContainer}>
                  {(enrollments || []).map((enrollment) => (
                    <BookedCourseCard
                      key={enrollment.id}
                      enrollment={enrollment}
                      onPress={() => {
                        if (enrollment.course) onCoursePress(enrollment.course, true);
                      }}
                      onCancel={() => {
                        console.log("Cancel enrollment placeholder");
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function EducationalSectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.eduSectionHeader}>
      <LinearGradient
        colors={["#F18F34", "transparent"]}
        style={styles.eduSectionBar}
      />
      <Text style={styles.eduSectionTitle}>{title}</Text>
    </View>
  );
}

function EducationalCourseCard({ course }: { course: EducationalCourse }) {
  const imageUrl =
    course.banner_url ||
    "https://images.unsplash.com/photo-1658491830143-72808ca237e3?w=400&h=300&fit=crop";
  const levelText = `Nivel ${course.elo_min.toFixed(0)}-${course.elo_max.toFixed(0)}`;

  return (
    <Pressable style={styles.eduCardWrapper}>
      <LinearGradient
        colors={["rgba(255,255,255,0.07)", "rgba(255,255,255,0.03)"]}
        style={styles.eduCardGradient}
      >
        {/* Imagen con Badges */}
        <View style={styles.eduImageContainer}>
          <Image source={{ uri: imageUrl }} style={styles.eduImage} />
          {course.is_certified && (
            <View style={styles.eduCertBadge}>
              <LinearGradient
                colors={["#F18F34", "#df7a1c"]}
                style={styles.eduCertGradient}
              >
                <Ionicons name="checkmark-circle" size={10} color="#fff" />
                <Text style={styles.eduCertText}>Certificación</Text>
              </LinearGradient>
            </View>
          )}
          <View style={styles.eduLevelTag}>
            <Text style={styles.eduLevelText}>{levelText}</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.eduInfo}>
          <Text style={styles.eduTitle} numberOfLines={1}>
            {course.title}
          </Text>

          <View style={styles.eduMetaRow}>
            <View style={styles.eduCoachInfo}>
              <Image
                source={{
                  uri: `https://ui-avatars.com/api/?name=${course.coach_name || "Coach"}&background=333&color=fff`,
                }}
                style={styles.eduCoachAvatar}
              />
              <Text style={styles.eduCoachName} numberOfLines={1}>
                {course.coach_name || "Matias Venditto"}
              </Text>
            </View>
            <View style={styles.eduRating}>
              <Ionicons name="star" size={10} color="#F18F34" />
              <Text style={styles.eduRatingText}>
                {course.rating.toFixed(1)}
              </Text>
            </View>
          </View>

          <View style={styles.eduDetailsRow}>
            <View style={styles.eduDetailItem}>
              <Ionicons name="play-circle-outline" size={12} color="#6B7280" />
              <Text style={styles.eduDetailText}>
                {course.total_lessons} lecciones
              </Text>
            </View>
            <View style={styles.eduDetailItem}>
              <Ionicons name="location-outline" size={12} color="#6B7280" />
              <Text style={styles.eduDetailText} numberOfLines={1}>
                {course.club_name || "Padel House"}
              </Text>
            </View>
          </View>
        </View>

        {course.locked && (
          <View style={styles.eduLockedOverlay}>
            <View style={styles.eduLockedCircle}>
              <Ionicons name="lock-closed" size={18} color="#fff" />
            </View>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

function ClassCard({
  course,
  onPress,
}: {
  course: PublicCourse;
  onPress: () => void;
}) {
  const imageUrl =
    course.club_logo_url ||
    "https://images.unsplash.com/photo-1658491830143-72808ca237e3?w=400&h=300&fit=crop";
  const firstDay = course.days[0];
  const timeText = firstDay ? `${firstDay.start_time}` : "Horario a confirmar";

  return (
    <Pressable
      style={({ pressed }) => [styles.cardWrapper, pressed && { opacity: 0.8 }]}
      onPress={onPress}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0.07)", "rgba(255,255,255,0.03)"]}
        style={styles.cardGradient}
      >
        <View style={styles.cardContent}>
          <View style={styles.imageContainer}>
            <Image source={{ uri: imageUrl }} style={styles.courseImage} />
            <View style={styles.imageOverlay} />
            <View style={styles.priceOverlay}>
              <Text style={styles.priceText}>
                {Math.round(course.price_cents / 100)}€
                <Text style={styles.priceUnitText}>/clase</Text>
              </Text>
            </View>
          </View>

          <View style={styles.infoContainer}>
            <View>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {course.name}
              </Text>
              <View style={styles.infoRow}>
                <Ionicons name="location-sharp" size={12} color="#9CA3AF" />
                <Text style={styles.infoText} numberOfLines={1}>
                  {course.club_name}
                </Text>
              </View>
            </View>

            <View>
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={12} color="#9CA3AF" />
                <Text style={styles.infoText}>{timeText}</Text>
              </View>
              <View style={styles.badgesRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{course.level}</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {course.sport.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F0F",
  },
  header: {
    backgroundColor: "rgba(15,15,15,0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchContainer: {
    flex: 1,
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
  },
  filterButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginTop: 4,
  },
  tab: {
    paddingVertical: 12,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#F18F34",
  },
  tabText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontWeight: "600",
  },
  activeTabText: {
    color: "#fff",
  },
  content: {
    flex: 1,
  },
  filtersWrapper: {
    paddingVertical: 16,
  },
  filtersList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  activeFilterPill: {
    backgroundColor: "#fff",
  },
  filterText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  activeFilterText: {
    color: "#000",
  },
  mainContent: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#fff",
    marginBottom: 16,
  },
  listContainer: {
    gap: 16,
  },
  cardWrapper: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 4,
  },
  cardGradient: {
    padding: 14,
  },
  cardContent: {
    flexDirection: "row",
    gap: 14,
  },
  imageContainer: {
    width: 112,
    height: 112,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  courseImage: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  priceOverlay: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  priceUnitText: {
    fontSize: 11,
    color: "#D1D5DB",
    fontWeight: "400",
  },
  infoContainer: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  dot: {
    color: "#374151",
    marginHorizontal: 2,
  },
  badgesRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#D1D5DB",
    textTransform: "uppercase",
  },
  loadingCenter: {
    marginTop: 60,
    alignItems: "center",
  },
  emptyState: {
    marginTop: 60,
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    marginTop: 16,
    fontSize: 14,
  },
  // Estilos Educación
  eduContainer: {
    flex: 1,
    marginTop: 8,
  },
  eduSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    marginTop: 24,
  },
  eduSectionBar: {
    width: 2,
    height: 16,
    borderRadius: 1,
  },
  eduSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  eduGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  eduCardWrapper: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    position: "relative",
  },
  eduCardGradient: {
    flex: 1,
  },
  eduImageContainer: {
    width: "100%",
    height: 160,
    position: "relative",
  },
  eduImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  eduCertBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    borderRadius: 6,
    overflow: "hidden",
  },
  eduCertGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 3,
  },
  eduCertText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  eduLevelTag: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.2)",
  },
  eduLevelText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  eduInfo: {
    padding: 10,
  },
  eduTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 8,
  },
  eduMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  eduCoachInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  eduCoachAvatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  eduCoachName: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
    flex: 1,
  },
  eduRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  eduRatingText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "700",
  },
  eduDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eduDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 1,
  },
  eduDetailText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  eduLockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  eduLockedCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  // Tus Clases
  tusClasesEmptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    paddingHorizontal: 20,
  },
  tusClasesIconWrapper: {
    width: 160,
    height: 160,
    marginBottom: 32,
    transform: [{ rotate: "6deg" }],
  },
  tusClasesIconBackground: {
    flex: 1,
    backgroundColor: "rgb(93, 31, 35)",
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  tusClasesEmoji: {
    fontSize: 70,
  },
  tusClasesTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  tusClasesDescription: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 280,
  },
  tusClasesButtonShadow: {
    shadowColor: "#F18F34",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  tusClasesButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  tusClasesButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  tusClasesContent: {
    flex: 1,
  },
  tusClasesHeader: {
    marginBottom: 4,
  },
});
