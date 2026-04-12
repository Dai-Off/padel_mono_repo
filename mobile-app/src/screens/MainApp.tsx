import { useState } from "react";
import { View, StyleSheet } from "react-native";
import type { SearchCourtResult } from "../api/search";
import { BackHeader } from "../components/layout/BackHeader";
import {
  BottomNavbar,
  type MainTabId,
} from "../components/layout/BottomNavbar";
import { HomeHeader } from "../components/layout/HomeHeader";
import { MobileSidebar } from "../components/layout/MobileSidebar";
import { ScreenLayout } from "../components/layout/ScreenLayout";
import { SidebarContent } from "../components/layout/SidebarContent";
import { SidebarProvider } from "../contexts/SidebarContext";
import { useSidebar } from "../hooks/useSidebar";
import {
  BookingConfirmationScreen,
  type BookingConfirmationData,
} from "./BookingConfirmationScreen";
import { PrivateReservationModal } from "../components/partido/PrivateReservationModal";
import { CrearPartidoLocationSheet } from "../components/partido/CrearPartidoLocationSheet";
import { ClubDetailScreen } from "./ClubDetailScreen";
import { CompeticionesScreen } from "./CompeticionesScreen";
import { HomeScreen } from "./HomeScreen";
import type { PartidoItem } from "./PartidosScreen";
import { PartidoDetailScreen } from "./PartidoDetailScreen";
import { PartidoPrivadoDetailScreen } from "./PartidoPrivadoDetailScreen";
import { PartidosScreen } from "./PartidosScreen";
import { MatchSearchScreen } from "./MatchSearchScreen";
import { TusPagosScreen } from "./TusPagosScreen";
import { TransaccionesScreen } from "./TransaccionesScreen";
import { TiendaScreen } from "./TiendaScreen";
import { DailyLessonIntroScreen } from "./DailyLessonIntroScreen";
import { DailyLessonVideoScreen } from "./DailyLessonVideoScreen";
import { DailyLessonInteractionScreen } from "./DailyLessonInteractionScreen";
import { Question, LessonAnswer, submitDailyLesson } from "../api/learning";
import { useAuth } from "../contexts/AuthContext";
import { LessonCompletionResponse } from "../api/learning";
import { CoursesScreen } from "./CoursesScreen";

export function MainApp() {
  const sidebar = useSidebar(false);
  const [activeTab, setActiveTab] = useState<MainTabId>("inicio");
  const [showDailyLessonIntro, setShowDailyLessonIntro] = useState(false);
  const [showDailyLessonVideo, setShowDailyLessonVideo] = useState(false);
  const [showDailyLessonInteraction, setShowDailyLessonInteraction] =
    useState(false);
  const [dailyLessonQuestions, setDailyLessonQuestions] = useState<Question[]>(
    [],
  );
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [lessonAnswers, setLessonAnswers] = useState<LessonAnswer[]>([]);
  const [lessonResult, setLessonResult] =
    useState<LessonCompletionResponse | null>(null);

  const { session } = useAuth();
  const [clubDetailCourt, setClubDetailCourt] =
    useState<SearchCourtResult | null>(null);
  const [selectedPartido, setSelectedPartido] = useState<PartidoItem | null>(
    null,
  );
  const [showTusPagos, setShowTusPagos] = useState(false);
  const [showTransacciones, setShowTransacciones] = useState(false);
  const [crearPartidoFlow, setCrearPartidoFlow] = useState<{
    open: boolean;
    organizerId: string | null;
  }>({ open: false, organizerId: null });
  const [partidosRefreshNonce, setPartidosRefreshNonce] = useState(0);
  const [bookingSuccessData, setBookingSuccessData] =
    useState<BookingConfirmationData | null>(null);
  const [dailyLessonRefreshNonce, setDailyLessonRefreshNonce] = useState(0);
  const [showCourses, setShowCourses] = useState(false);

  const showClubDetail = activeTab === "pistas" && clubDetailCourt != null;
  const showPartidoDetail = selectedPartido != null;

  const renderContent = () => {
    if (showCourses) {
      return <CoursesScreen onBack={() => setShowCourses(false)} />;
    }
    if (showDailyLessonIntro) {
      return (
        <DailyLessonIntroScreen
          onBack={() => setShowDailyLessonIntro(false)}
          onStart={(questions) => {
            setDailyLessonQuestions(questions);
            setCurrentQuestionIndex(0);
            setLessonAnswers([]);
            setShowDailyLessonIntro(false);
            if (questions[0].has_video) {
              setShowDailyLessonVideo(true);
            } else {
              setShowDailyLessonInteraction(true);
            }
          }}
        />
      );
    }
    if (showDailyLessonVideo) {
      const currentQuestion = dailyLessonQuestions[currentQuestionIndex];
      return (
        <DailyLessonVideoScreen
          videoUrl={currentQuestion?.video_url}
          currentIndex={currentQuestionIndex}
          total={dailyLessonQuestions.length}
          onClose={() => setShowDailyLessonVideo(false)}
          onNext={() => {
            setShowDailyLessonVideo(false);
            setShowDailyLessonInteraction(true);
          }}
        />
      );
    }
    if (showDailyLessonInteraction) {
      const currentQuestion = dailyLessonQuestions[currentQuestionIndex];
      return (
        <DailyLessonInteractionScreen
          question={currentQuestion}
          currentIndex={currentQuestionIndex}
          total={dailyLessonQuestions.length}
          onClose={() => setShowDailyLessonInteraction(false)}
          onAnswer={(selectedAnswer, timeMs) => {
            const newAnswer: LessonAnswer = {
              question_id: currentQuestion.id,
              selected_answer: selectedAnswer,
              response_time_ms: timeMs,
            };
            const updatedAnswers = [...lessonAnswers, newAnswer];
            setLessonAnswers(updatedAnswers);

            if (currentQuestionIndex < dailyLessonQuestions.length - 1) {
              const nextIndex = currentQuestionIndex + 1;
              setCurrentQuestionIndex(nextIndex);
              setShowDailyLessonInteraction(false);
              if (dailyLessonQuestions[nextIndex].has_video) {
                setShowDailyLessonVideo(true);
              } else {
                setShowDailyLessonInteraction(true);
              }
            } else {
              // Finalizar lección
              if (session?.access_token) {
                submitDailyLesson(session.access_token, updatedAnswers).then(
                  (res) => {
                    setLessonResult(res);
                    setShowDailyLessonInteraction(false);
                    setDailyLessonRefreshNonce((n) => n + 1);
                    // Aquí podrías mostrar una pantalla de resultados
                  },
                );
              }
            }
          }}
        />
      );
    }
    if (crearPartidoFlow.open) {
      const bumpPartidos = () => setPartidosRefreshNonce((n) => n + 1);
      const closeFlow = () => {
        setCrearPartidoFlow({ open: false, organizerId: null });
        bumpPartidos();
      };
      return (
        <CrearPartidoLocationSheet
          presentation="fullscreen"
          initialStep="clubs"
          organizerPlayerId={crearPartidoFlow.organizerId}
          onClose={closeFlow}
          onSiguiente={closeFlow}
          onPartidoCreado={(data) => {
            setCrearPartidoFlow({ open: false, organizerId: null });
            bumpPartidos();
            setBookingSuccessData(data);
          }}
        />
      );
    }
    if (showTransacciones) {
      return <TransaccionesScreen onBack={() => setShowTransacciones(false)} />;
    }
    if (showTusPagos) {
      return (
        <TusPagosScreen
          onBack={() => setShowTusPagos(false)}
          onTransaccionesPress={() => setShowTransacciones(true)}
        />
      );
    }
    if (showPartidoDetail && selectedPartido) {
      if (selectedPartido.visibility === "private") {
        return (
          <PartidoPrivadoDetailScreen
            partido={selectedPartido}
            onBack={() => setSelectedPartido(null)}
          />
        );
      }
      return (
        <PartidoDetailScreen
          partido={selectedPartido}
          onBack={() => setSelectedPartido(null)}
          onGoHome={() => {
            setSelectedPartido(null);
            setActiveTab("inicio");
          }}
        />
      );
    }
    if (showClubDetail && clubDetailCourt) {
      return (
        <ClubDetailScreen
          court={clubDetailCourt}
          onClose={() => setClubDetailCourt(null)}
          onPartidoPress={(p) => setSelectedPartido(p)}
        />
      );
    }
    switch (activeTab) {
      case "inicio":
        return (
          <HomeScreen
            onNavigateToTab={(tab) => setActiveTab(tab)}
            onPartidoPress={(p) => setSelectedPartido(p)}
            onStartDailyLesson={() => setShowDailyLessonIntro(true)}
            onCoursesPress={() => setShowCourses(true)}
            dailyLessonRefreshNonce={dailyLessonRefreshNonce}
          />
        );
      case "pistas":
        return (
          <MatchSearchScreen
            onCourtPress={(court) => setClubDetailCourt(court)}
            onBack={() => setActiveTab("inicio")}
          />
        );
      case "tienda":
        return <TiendaScreen />;
      case "torneos":
        return <CompeticionesScreen onBack={() => setActiveTab("inicio")} />;
      case "partidos":
        return (
          <PartidosScreen
            onPartidoPress={(p) => setSelectedPartido(p)}
            onOpenWeMatchClubsFlow={(organizerId) =>
              setCrearPartidoFlow({ open: true, organizerId })
            }
            partidosRefreshNonce={partidosRefreshNonce}
          />
        );
      default:
        return <HomeScreen />;
    }
  };

  const showMainTabs =
    bookingSuccessData == null &&
    !showTusPagos &&
    !showTransacciones &&
    !showPartidoDetail &&
    !showClubDetail &&
    !crearPartidoFlow.open &&
    !showDailyLessonIntro &&
    !showDailyLessonVideo &&
    !showDailyLessonInteraction &&
    !showCourses;

  const customHeader =
    bookingSuccessData != null ||
    showTusPagos ||
    showTransacciones ||
    showPartidoDetail ||
    crearPartidoFlow.open ||
    showDailyLessonIntro ||
    showDailyLessonVideo ||
    showDailyLessonInteraction ||
    showCourses ? undefined : activeTab === "tienda" ? (
      <BackHeader
        title="Tienda"
        tone="dark"
        onBack={() => setActiveTab("inicio")}
      />
    ) : activeTab === "partidos" ? (
      <BackHeader
        title="Partidos"
        tone="dark"
        onBack={() => setActiveTab("inicio")}
      />
    ) : activeTab === "inicio" ? (
      <HomeHeader onMenuPress={sidebar.toggle} />
    ) : undefined;

  const layoutBackgroundColor =
    bookingSuccessData != null
      ? "#000000"
      : showPartidoDetail
        ? "#0F0F0F"
        : crearPartidoFlow.open
          ? "#0F0F0F"
          : showDailyLessonVideo
            ? "#000000"
            : showDailyLessonInteraction
              ? "#0F0F0F"
              : showMainTabs &&
                  (activeTab === "inicio" || activeTab === "partidos")
                ? "#000000"
                : showMainTabs &&
                    (activeTab === "pistas" ||
                      activeTab === "tienda" ||
                      activeTab === "torneos")
                  ? "#0F0F0F"
                  : "#ffffff";

  return (
    <View style={styles.container}>
      <SidebarProvider
        close={sidebar.close}
        onNavigateToTusPagos={() => setShowTusPagos(true)}
      >
        <View style={styles.mainColumn}>
          <ScreenLayout
            sidebar={sidebar}
            customHeader={customHeader}
            hideHeader={
              bookingSuccessData != null ||
              showClubDetail ||
              showPartidoDetail ||
              showTusPagos ||
              showTransacciones ||
              crearPartidoFlow.open ||
              showDailyLessonIntro ||
              showDailyLessonVideo ||
              showDailyLessonInteraction ||
              showCourses ||
              (showMainTabs && activeTab === "pistas") ||
              (showMainTabs && activeTab === "torneos")
            }
            layoutBackgroundColor={layoutBackgroundColor}
          >
            {renderContent()}
          </ScreenLayout>
          {bookingSuccessData == null &&
            !showClubDetail &&
            !showPartidoDetail &&
            !showTusPagos &&
            !showTransacciones &&
            !crearPartidoFlow.open && (
              <View style={styles.bottomBar}>
                <BottomNavbar
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />
              </View>
            )}
        </View>
        <MobileSidebar visible={sidebar.isOpen} onClose={sidebar.close}>
          <SidebarContent />
        </MobileSidebar>
      </SidebarProvider>

      {bookingSuccessData != null &&
      bookingSuccessData.matchVisibility === "private" ? (
        <PrivateReservationModal
          visible
          data={bookingSuccessData}
          onClose={() => setBookingSuccessData(null)}
        />
      ) : null}
      {bookingSuccessData != null &&
      bookingSuccessData.matchVisibility === "public" ? (
        <View style={styles.bookingSuccessOverlay} accessibilityViewIsModal>
          <BookingConfirmationScreen
            data={bookingSuccessData}
            onClose={() => setBookingSuccessData(null)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  /** Columna explícita: ScreenLayout + barra inferior compartidos en flex (evita barra invisible en Android). */
  mainColumn: {
    flex: 1,
    minHeight: 0,
  },
  /** Ancho completo del dispositivo (sin márgenes laterales). */
  bottomBar: {
    width: "100%",
    alignSelf: "stretch",
  },
  /** Por encima de ScreenLayout y navbar: la confirmación no puede quedar recortada por el contenedor flex. */
  bookingSuccessOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 2000,
  },
});
