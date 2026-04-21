import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  Animated,
  Easing,
  ActivityIndicator,
  Vibration,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { PublicCourse, enrollInCourse } from "../../api/schoolCourses";
import { useAuth } from "../../contexts/AuthContext";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface Props {
  visible: boolean;
  onClose: () => void;
  onEnrollSuccess?: () => void;
  course: PublicCourse;
}

export type ModalState = "confirm" | "loading" | "success" | "error";

export function PublicCourseBookingSuccessModal({
  visible,
  onClose,
  onEnrollSuccess,
  course,
}: Props) {
  const { session } = useAuth();
  const [shouldRender, setShouldRender] = useState(visible);
  const [step, setStep] = useState<ModalState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const animValue = useRef(new Animated.Value(0)).current;

  const priceFormatted = `${(course.price_cents / 100).toFixed(2)}€`;

  const handleEnroll = async () => {
    if (!session?.access_token) {
      setErrorMsg("Debes iniciar sesión para inscribirte");
      setStep("error");
      return;
    }
    try {
      setStep("loading");
      const res = await enrollInCourse(course.id, session.access_token);
      if (res.ok) {
        setStep("success");
        Vibration.vibrate(Platform.OS === "ios" ? [0, 10, 10, 10] : 100);
      } else {
        setErrorMsg(res.error || "No se pudo completar la reserva");
        setStep("error");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error de conexión");
      setStep("error");
    }
  };

  const handleDone = () => {
    if (step === "success") {
      onEnrollSuccess?.();
      onClose();
    } else {
      onClose();
    }
  };

  // Reset step and handle auto-enroll when visible changes
  useEffect(() => {
    if (visible) {
      setStep("loading");
      handleEnroll();
    } else {
      setTimeout(() => {
        setStep("loading");
        setErrorMsg(null);
      }, 400);
    }
  }, [visible]);

  // Formateo básico de fecha tomando el primer día disponible
  const firstDay = course.days[0];
  const weekdayNames: Record<string, string> = {
    mon: "LUNES",
    tue: "MARTES",
    wed: "MIÉRCOLES",
    thu: "JUEVES",
    fri: "VIERNES",
    sat: "SÁBADO",
    sun: "DOMINGO",
  };

  const dateTimeStr = firstDay
    ? `${weekdayNames[firstDay.weekday]} · ${firstDay.start_time}`
    : "Próximamente";

  const durationStr = firstDay
    ? calculateDuration(firstDay.start_time, firstDay.end_time)
    : "60 min";

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.timing(animValue, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(0.5)),
      }).start();
    } else {
      Animated.timing(animValue, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
        easing: Easing.in(Easing.exp),
      }).start(() => {
        setShouldRender(false);
      });
    }
  }, [visible]);

  const translateY = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  });

  const opacity = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  if (!shouldRender && !visible) return null;

  return (
    <Modal
      visible={shouldRender}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(0,0,0,0.7)", opacity },
          ]}
        >
          <TouchableOpacity
            style={styles.dismissArea}
            activeOpacity={1}
            onPress={step === "loading" ? undefined : onClose}
          />
        </Animated.View>

        <Animated.View
          style={[styles.modalContainer, { transform: [{ translateY }] }]}
        >
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.headerWrapper}>
              <BlurView
                intensity={20}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={[
                  "rgba(91, 141, 238, 0.15)",
                  "rgba(91, 141, 238, 0.05)",
                  "transparent",
                ]}
                style={StyleSheet.absoluteFill}
              />

              {step !== "loading" && (
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              )}

              <View style={styles.checkContainer}>
                {step === "loading" ? (
                  <ActivityIndicator size="large" color="#5B8DEE" />
                ) : step === "success" ? (
                  <LinearGradient
                    colors={["#10B981", "#059669"]}
                    style={styles.checkCircle}
                  >
                    <Ionicons name="checkmark" size={40} color="white" />
                  </LinearGradient>
                ) : step === "error" ? (
                  <LinearGradient
                    colors={["#EF4444", "#DC2626"]}
                    style={styles.checkCircle}
                  >
                    <Ionicons name="alert-circle" size={40} color="white" />
                  </LinearGradient>
                ) : (
                  <LinearGradient
                    colors={["#5B8DEE", "#4A7BD9"]}
                    style={styles.checkCircle}
                  >
                    <Ionicons name="calendar" size={36} color="white" />
                  </LinearGradient>
                )}
              </View>

              <Text style={styles.title}>
                {step === "loading"
                  ? "Procesando..."
                  : step === "success"
                  ? "¡Reserva Confirmada!"
                  : step === "error"
                  ? "Hubo un problema"
                  : "¿Confirmar Reserva?"}
              </Text>
              <Text style={styles.subtitle}>
                {step === "loading"
                  ? "Estamos asegurando tu plaza en la clase"
                  : step === "success"
                  ? "Tu plaza ha sido reservada con éxito"
                  : step === "error"
                  ? errorMsg || "No pudimos completar la operación"
                  : "Revisa los detalles antes de apuntarte"}
              </Text>
            </View>

            <View style={styles.body}>
              {/* Badge Clase */}
              <View style={styles.badgeContainer}>
                <View style={styles.badge}>
                  <Text style={styles.badgeEmoji}>🎯</Text>
                  <Text style={styles.badgeText}>Clase suelta</Text>
                </View>
              </View>

              <Text style={styles.courseName}>{course.name.toUpperCase()}</Text>

              <View style={styles.detailsGrid}>
                <DetailRow
                  icon="calendar-outline"
                  label="Fecha y hora"
                  value={dateTimeStr}
                />
                <DetailRow
                  icon="time-outline"
                  label="Duración"
                  value={durationStr}
                />
                <DetailRow
                  icon="location-outline"
                  label="Club"
                  value={course.club_name}
                />
                <DetailRow
                  icon="people-outline"
                  label="Asistentes"
                  value={`${course.enrolled_count}/${course.capacity}`}
                />
                <DetailRow
                  icon="cash-outline"
                  label="Precio"
                  value={priceFormatted}
                />
              </View>

              {step === "success" && (
                <View style={styles.emailNote}>
                  <Text style={styles.emailNoteText}>
                    📧 Recibirás un email de confirmación en breve
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer fijo */}
          <View style={styles.footer}>
            {step === "loading" ? (
              <View style={[styles.doneButton, { opacity: 0.7 }]}>
                <Text style={styles.doneButtonText}>Inscribiendo...</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={step === "error" ? [styles.doneButton, { backgroundColor: "#EF4444" }] : styles.doneButton}
                onPress={handleDone}
              >
                <Text style={styles.doneButtonText}>
                  {step === "error" ? "Cerrar" : "Entendido"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={20} color="white" />
      </View>
      <View style={styles.detailTextContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function calculateDuration(start: string, end: string): string {
  try {
    const [sH, sM] = start.split(":").map(Number);
    const [eH, eM] = end.split(":").map(Number);
    const totalMin = eH * 60 + eM - (sH * 60 + sM);
    return `${totalMin} min`;
  } catch {
    return "60 min";
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
  },
  dismissArea: {
    flex: 1,
  },
  modalContainer: {
    backgroundColor: "#1A1A1A",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: SCREEN_HEIGHT * 0.9,
    overflow: "hidden",
  },
  scrollContent: {
    paddingBottom: 20,
  },
  headerWrapper: {
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    position: "relative",
    overflow: "hidden",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkContainer: {
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#5B8DEE",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  badgeContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#5B8DEE",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  badgeEmoji: {
    fontSize: 18,
  },
  badgeText: {
    color: "white",
    fontWeight: "800",
    fontSize: 13,
  },
  courseName: {
    color: "white",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 24,
  },
  detailsGrid: {
    gap: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#5B8DEE",
    alignItems: "center",
    justifyContent: "center",
  },
  detailTextContent: {
    flex: 1,
  },
  detailLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 2,
  },
  detailValue: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  emailNote: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "rgba(91, 141, 238, 0.1)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(91, 141, 238, 0.2)",
  },
  emailNoteText: {
    color: "#60A5FA",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  footer: {
    padding: 24,
    backgroundColor: "rgba(26,26,26,0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  doneButton: {
    backgroundColor: "#5B8DEE",
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: "center",
    shadowColor: "#5B8DEE",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  doneButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "800",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: "#9CA3AF",
    fontSize: 16,
    fontWeight: "700",
  },
});
