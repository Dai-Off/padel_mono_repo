import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, Animated, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { androidReadableText } from '../components/home/inicio/textStyles';
import { Question } from '../api/learning';

const { width } = Dimensions.get('window');

type Props = {
  question: Question;
  currentIndex: number;
  total: number;
  onClose: () => void;
  onAnswer: (selectedAnswer: any, timeMs: number) => void;
};

export function DailyLessonInteractionScreen({ question, currentIndex, total, onClose, onAnswer }: Props) {
  const insets = useSafeAreaInsets();
  const startTime = useRef(Date.now());
  const [selected, setSelected] = useState<any>(null);
  const [multiSelected, setMultiSelected] = useState<number[]>([]);
  
  // Para match_columns
  const [links, setLinks] = useState<Record<number, number>>({}); // index of left -> index of right_shuffled
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);

  // Para order_sequence
  const [orderedItems, setOrderedItems] = useState<string[]>([]);
  const [availableItems, setAvailableItems] = useState<string[]>([]);

  // Animaciones
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
    startTime.current = Date.now();
    
    // Reset states if needed
    setSelected(null);
    setMultiSelected([]);
    if (question.type === 'match_columns') {
         setLinks({});
         setSelectedLeft(null);
    }
    if (question.type === 'order_sequence') {
      setOrderedItems([]);
      setAvailableItems([...(question.content.steps_shuffled || [])]);
    }
  }, [question.id]);

  const handleConfirm = () => {
    const timeMs = Date.now() - startTime.current;
    let finalAnswer: any = selected;

    if (question.type === 'multi_select') {
      finalAnswer = multiSelected;
    } else if (question.type === 'match_columns') {
      // Formatear como array de strings (derecha) en el orden de la izquierda
      const rights_shuffled = question.content.rights_shuffled as string[];
      const leftsCount = (question.content.lefts as string[]).length;
      finalAnswer = Array.from({ length: leftsCount }).map((_, i) => {
        const rightIdx = links[i];
        return rightIdx !== undefined ? rights_shuffled[rightIdx] : null;
      });
    } else if (question.type === 'order_sequence') {
      finalAnswer = orderedItems;
    }
    
    onAnswer(finalAnswer, timeMs);
  };

  const renderContent = () => {
    switch (question.type) {
      case 'test_classic':
        return (
          <View style={styles.optionsContainer}>
            {question.content.options.map((opt: string, idx: number) => (
              <Pressable
                key={idx}
                onPress={() => setSelected(idx)}
                style={[styles.optionCard, selected === idx && styles.optionCardSelected]}
              >
                <View style={[styles.radio, selected === idx && styles.radioSelected]}>
                  {selected === idx && <View style={styles.radioInner} />}
                </View>
                <Text style={[styles.optionText, selected === idx && styles.optionTextSelected]}>{opt}</Text>
              </Pressable>
            ))}
          </View>
        );
      case 'true_false':
        return (
          <View style={styles.tfContainer}>
            <Pressable
              onPress={() => setSelected(true)}
              style={[styles.tfButton, selected === true && styles.tfButtonTrue]}
            >
              <Ionicons name="checkmark-circle" size={32} color={selected === true ? 'white' : '#10B981'} />
              <Text style={[styles.tfText, selected === true && styles.tfTextSelected]}>VERDADERO</Text>
            </Pressable>
            <Pressable
              onPress={() => setSelected(false)}
              style={[styles.tfButton, selected === false && styles.tfButtonFalse]}
            >
              <Ionicons name="close-circle" size={32} color={selected === false ? 'white' : '#EF4444'} />
              <Text style={[styles.tfText, selected === false && styles.tfTextSelected]}>FALSO</Text>
            </Pressable>
          </View>
        );
      case 'multi_select':
        return (
          <View style={styles.optionsContainer}>
            {question.content.options.map((opt: string, idx: number) => {
              const isSel = multiSelected.includes(idx);
              return (
                <Pressable
                  key={idx}
                  onPress={() => {
                    if (isSel) setMultiSelected(multiSelected.filter(i => i !== idx));
                    else setMultiSelected([...multiSelected, idx]);
                  }}
                  style={[styles.optionCard, isSel && styles.optionCardSelected]}
                >
                  <View style={[styles.checkbox, isSel && styles.checkboxSelected]}>
                    {isSel && <Ionicons name="checkmark" size={14} color="white" />}
                  </View>
                  <Text style={[styles.optionText, isSel && styles.optionTextSelected]}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
        );
      case 'order_sequence':
        return (
          <View style={styles.orderContainer}>
            <View style={styles.orderTargetArea}>
              <Text style={styles.orderLabel}>Tu orden:</Text>
              <View style={styles.orderTargetList}>
                {orderedItems.length === 0 ? (
                  <View style={styles.orderEmpty}>
                    <Text style={styles.orderEmptyText}>Selecciona los pasos en orden</Text>
                  </View>
                ) : (
                  orderedItems.map((item, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => {
                        setOrderedItems(orderedItems.filter((_, i) => i !== idx));
                        setAvailableItems([...availableItems, item]);
                      }}
                      style={styles.orderItem}
                    >
                      <View style={styles.orderItemBadge}>
                        <Text style={styles.orderItemBadgeText}>{idx + 1}</Text>
                      </View>
                      <Text style={styles.orderItemText}>{item}</Text>
                      <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.3)" />
                    </Pressable>
                  ))
                )}
              </View>
            </View>

            <View style={styles.orderAvailableArea}>
              <Text style={styles.orderLabel}>Pasos disponibles:</Text>
              <View style={styles.availableList}>
                {availableItems.map((item, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => {
                      setOrderedItems([...orderedItems, item]);
                      setAvailableItems(availableItems.filter((_, i) => i !== idx));
                    }}
                    style={styles.availableItem}
                  >
                    <Text style={styles.availableItemText}>{item}</Text>
                    <Ionicons name="add-circle-outline" size={20} color="#F18F34" />
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        );

      case 'match_columns': {
        const lefts = question.content.lefts as string[];
        const rights_shuffled = question.content.rights_shuffled as string[];
        
        return (
          <View style={styles.matchContainer}>
            <View style={styles.matchColumnLeft}>
              <Text style={styles.orderLabel}>Concepto</Text>
              {lefts.map((l, i) => {
                const isLinked = links[i] !== undefined;
                const isSelected = selectedLeft === i;
                return (
                  <Pressable
                    key={i}
                    onPress={() => setSelectedLeft(isSelected ? null : i)}
                    style={[
                      styles.matchCard,
                      isSelected && styles.matchCardActive,
                      isLinked && styles.matchCardLinked
                    ]}
                  >
                    <Text 
                      style={[styles.matchText, (isSelected || isLinked) && styles.matchTextActive]}
                      numberOfLines={2}
                    >
                      {l}
                    </Text>
                    {isLinked && <Ionicons name="link" size={14} color="#F18F34" />}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.matchColumnRight}>
              <Text style={styles.orderLabel} numberOfLines={1}>Definición</Text>
              {rights_shuffled.map((r, j) => {
                const linkedTo = Object.keys(links).find(k => links[parseInt(k)] === j);
                const isLinked = linkedTo !== undefined;
                
                return (
                  <Pressable
                    key={j}
                    onPress={() => {
                      if (selectedLeft !== null) {
                        const newLinks = { ...links };
                        if (isLinked) delete newLinks[parseInt(linkedTo!)];
                        newLinks[selectedLeft] = j;
                        setLinks(newLinks);
                        setSelectedLeft(null);
                      }
                    }}
                    style={[
                      styles.matchCard,
                      styles.matchCardRight,
                      isLinked && styles.matchCardLinkedRight
                    ]}
                  >
                    <Text 
                      style={[styles.matchText, isLinked && styles.matchTextActive]}
                      numberOfLines={4}
                    >
                      {r}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      }
      default:
        return (
          <View style={styles.placeholderContainer}>
             <Ionicons name="construct-outline" size={48} color="#F18F34" />
             <Text style={styles.placeholderText}>Tipo de pregunta "{question.type}" en desarrollo...</Text>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Header con progreso */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
        </Pressable>
        <View style={styles.progressTrack}>
           <View style={[styles.progressFill, { width: `${((currentIndex + 1) / total) * 100}%` }]} />
        </View>
        <Text style={styles.stepIndicator}>{currentIndex + 1}/{total}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.questionBox, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.areaBadge}>
             <Text style={styles.areaBadgeText}>{question.area.toUpperCase()}</Text>
          </View>
          <Text style={styles.questionText}>
            {question.content.question || "¿Qué deberías hacer en esta situación?"}
          </Text>
        </Animated.View>

        {renderContent()}
      </ScrollView>

      {/* Botón de Confirmar */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <Pressable
          onPress={handleConfirm}
          disabled={
            (question.type === 'test_classic' || question.type === 'true_false') ? selected === null :
            (question.type === 'multi_select') ? multiSelected.length === 0 :
            (question.type === 'order_sequence') ? availableItems.length > 0 :
            (question.type === 'match_columns') ? Object.keys(links).length < (question.content.lefts as string[]).length :
            true
          }
          style={({ pressed }) => [
            styles.confirmButton,
            ((question.type === 'test_classic' || question.type === 'true_false') ? selected === null :
             (question.type === 'multi_select') ? multiSelected.length === 0 :
             (question.type === 'order_sequence') ? availableItems.length > 0 :
             (question.type === 'match_columns') ? Object.keys(links).length < (question.content.lefts as string[]).length :
             true) && styles.confirmButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <LinearGradient
            colors={["#F18F34", "#C46A20"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.confirmGradient}
          >
            <Text style={styles.confirmText}>Confirmar respuesta</Text>
            <Ionicons name="arrow-forward" size={18} color="white" />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
    zIndex: 20,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F18F34',
  },
  stepIndicator: androidReadableText({
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
    width: 35,
    textAlign: 'right',
  }),
  scrollContent: {
    padding: 24,
    paddingTop: 40,
  },
  questionBox: {
    marginBottom: 32,
  },
  areaBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(241, 143, 52, 0.15)',
    marginBottom: 12,
  },
  areaBadgeText: androidReadableText({
    color: '#F18F34',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  }),
  questionText: androidReadableText({
    color: 'white',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
  }),
  optionsContainer: {
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  optionCardSelected: {
    borderColor: '#F18F34',
    backgroundColor: 'rgba(241, 143, 52, 0.05)',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioSelected: {
    borderColor: '#F18F34',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F18F34',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    borderColor: '#F18F34',
    backgroundColor: '#F18F34',
  },
  optionText: androidReadableText({
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  }),
  optionTextSelected: {
    color: 'white',
  },
  tfContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  tfButton: {
    flex: 1,
    height: 120,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  tfButtonTrue: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
  },
  tfButtonFalse: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#EF4444',
  },
  tfText: androidReadableText({
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '800',
  }),
  tfTextSelected: {
    color: 'white',
  },
  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  placeholderText: androidReadableText({
    color: '#9CA3AF',
    textAlign: 'center',
    fontSize: 14,
  }),
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: '#0F0F0F',
  },
  confirmButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  confirmButtonDisabled: {
    opacity: 0.3,
  },
  confirmGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  confirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  // Order Styles
  orderContainer: {
    gap: 24,
  },
  orderTargetArea: {
    gap: 8,
  },
  orderLabel: androidReadableText({
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  }),
  orderTargetList: {
    gap: 8,
    minHeight: 120,
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  orderEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderEmptyText: androidReadableText({
    color: 'rgba(255,255,255,0.2)',
    fontSize: 14,
  }),
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  orderItemBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F18F34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderItemBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '800',
  },
  orderItemText: androidReadableText({
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  }),
  orderAvailableArea: {
    gap: 8,
  },
  availableList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  availableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(241, 143, 52, 0.2)',
    gap: 8,
  },
  availableItemText: androidReadableText({
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
  }),
  // Match Styles
  matchContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  matchColumnLeft: {
    flex: 1.2,
    gap: 10,
  },
  matchColumnRight: {
    flex: 1.8,
    gap: 10,
  },
  matchCard: {
    minHeight: 54,
    padding: 8,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  matchCardRight: {
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  matchCardActive: {
    borderColor: '#7C3AED', 
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
  },
  matchCardLinked: {
    borderColor: '#F18F34',
    backgroundColor: 'rgba(241, 143, 52, 0.1)',
  },
  matchCardLinkedRight: {
    borderColor: 'rgba(241, 143, 52, 0.5)',
    backgroundColor: 'rgba(241, 143, 52, 0.1)',
  },
  matchText: androidReadableText({
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  }),
  matchTextActive: {
    color: 'white',
  },
});
