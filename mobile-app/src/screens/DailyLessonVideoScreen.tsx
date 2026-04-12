import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, Animated, Easing, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { androidReadableText } from '../components/home/inicio/textStyles';

type Props = {
  videoUrl?: string | null;
  currentIndex: number;
  total: number;
  onClose: () => void;
  onNext: () => void; // Para ir a la pregunta
};

export function DailyLessonVideoScreen({ videoUrl, currentIndex, total, onClose, onNext }: Props) {
  const insets = useSafeAreaInsets();
  const [showQuestionButton, setShowQuestionButton] = useState(false);
  const buttonOpacity = useRef(new Animated.Value(0)).current;

  // Mock de 5 segundos para simular el video reproduciéndose
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowQuestionButton(true);
      Animated.timing(buttonOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* Fondo negro mockeando el video */}
      <View style={styles.videoMockContainer}>
        {/* Aquí iría el WebView u otro reproductor en el futuro */}
        {!showQuestionButton && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#F18F34" />
            <Text style={styles.loadingText}>Cargando lección...</Text>
          </View>
        )}
      </View>

      {/* Gradientes encima del video para mejorar legibilidad */}
      <LinearGradient
        colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.8)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* Cabecera (Botón cerrar e Indicador) */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
        </Pressable>
        <Text style={styles.stepIndicator}>{currentIndex + 1}/{total}</Text>
      </View>

      {/* Botón flotante que aparece después de 5 seg */}
      {showQuestionButton && (
        <Animated.View style={[styles.questionButtonContainer, { opacity: buttonOpacity }]}>
          <Pressable onPress={onNext} style={styles.questionButton}>
            <Text style={styles.questionButtonText}>Ver pregunta</Text>
            <Ionicons name="chevron-forward" size={16} color="white" />
          </Pressable>
        </Animated.View>
      )}

      {/* Footer con info de la academia y coach */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.infoRow}>
          {/* Icono Shield */}
          <View style={styles.shieldWrapper}>
            <LinearGradient
              colors={['#F18F34', '#FFB347']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.shieldIcon}
            >
              <Ionicons name="shield-checkmark" size={20} color="white" />
            </LinearGradient>
          </View>
          
          {/* Nombres */}
          <View style={styles.textStack}>
            <Text style={styles.academyName} numberOfLines={1}>WeMatch Academy</Text>
            <Text style={styles.coachName} numberOfLines={1}>Coach Carlos Ruiz</Text>
          </View>
        </View>

        {/* Tags y Barras de progreso */}
        <View style={styles.progressRow}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>TÉCNICA</Text>
          </View>
          <View style={styles.progressBars}>
            <View style={styles.barActive} />
            <View style={styles.barActive} />
            <View style={styles.barActive} />
            <View style={styles.barInactive} />
            <View style={styles.barInactive} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoMockContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: androidReadableText({
    color: '#F18F34',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  }),
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 20,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    // Efecto de blur en RN es complejo sin expo-blur, usamos un bg oscuro translúcido que simula bien
  },
  stepIndicator: androidReadableText({
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    width: 40, // Para balancear con el botón cerrar si estuviera al revés
  }),
  questionButtonContainer: {
    position: 'absolute',
    bottom: 120, // .bottom-32 tailwind = 128px ~ 120px
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  questionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', // Para resaltar un poco
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  questionButtonText: androidReadableText({
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  }),
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  shieldWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    shadowColor: '#F18F34',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  shieldIcon: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  textStack: {
    flex: 1,
  },
  academyName: androidReadableText({
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  }),
  coachName: androidReadableText({
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  }),
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tagBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.25)',
    backgroundColor: 'rgba(241, 143, 52, 0.15)',
  },
  tagBadgeText: androidReadableText({
    color: '#F18F34',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  }),
  progressBars: {
    flexDirection: 'row',
    gap: 2,
  },
  barActive: {
    width: 6,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#F18F34',
  },
  barInactive: {
    width: 6,
    height: 12,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});
