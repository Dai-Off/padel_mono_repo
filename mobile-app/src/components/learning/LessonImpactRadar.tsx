import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

export type SkillValues = {
  technical: number;
  physical: number;
  mental: number;
  tactical: number;
};

type Props = {
  baseSkills: SkillValues;
  deltas: SkillValues;
};

// Paleta alineada con SkillPolarChart
const COLORS = {
  technical: '#F18F34',
  physical: '#34D399',
  mental: '#F472B6',
  tactical: '#818CF8',
};

const LABELS = {
  technical: 'Técnico',
  physical: 'Físico',
  mental: 'Mental',
  tactical: 'Táctico',
};

// Clamp 0..100
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function LessonImpactRadar({ baseSkills, deltas }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [baseSkills.technical, baseSkills.physical, baseSkills.mental, baseSkills.tactical,
      deltas.technical, deltas.physical, deltas.mental, deltas.tactical]);

  const size = 220;
  const center = size / 2;
  const maxRadius = 72;

  // Puntos del polígono: Norte=Técnico, Este=Físico, Sur=Mental, Oeste=Táctico
  const getPoints = (skills: SkillValues, scale = 1) => {
    const tech = (clamp(skills.technical) / 100) * maxRadius * scale;
    const phys = (clamp(skills.physical) / 100) * maxRadius * scale;
    const ment = (clamp(skills.mental) / 100) * maxRadius * scale;
    const tact = (clamp(skills.tactical) / 100) * maxRadius * scale;
    return `${center},${center - tech} ${center + phys},${center} ${center},${center + ment} ${center - tact},${center}`;
  };

  const finalSkills: SkillValues = {
    technical: clamp(baseSkills.technical + deltas.technical),
    physical: clamp(baseSkills.physical + deltas.physical),
    mental: clamp(baseSkills.mental + deltas.mental),
    tactical: clamp(baseSkills.tactical + deltas.tactical),
  };

  const basePoints = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [getPoints(baseSkills, 0), getPoints(baseSkills, 1)],
  });

  const finalPoints = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [getPoints(baseSkills, 1), getPoints(finalSkills, 1)],
  });

  const hasAnyDelta =
    deltas.technical > 0 || deltas.physical > 0 || deltas.mental > 0 || deltas.tactical > 0;

  const renderSkillRow = (key: keyof SkillValues) => {
    const color = COLORS[key];
    const label = LABELS[key];
    const base = clamp(baseSkills[key]);
    const delta = deltas[key];
    const final = clamp(base + delta);

    return (
      <View key={key} style={styles.row}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.label, { color }]}>{label}</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFillBase, { width: `${base}%`, backgroundColor: color, opacity: 0.35 }]} />
          {delta > 0 && (
            <View
              style={[
                styles.barFillDelta,
                { left: `${base}%`, width: `${final - base}%`, backgroundColor: color },
              ]}
            />
          )}
        </View>
        <Text style={[styles.value, { color }]}>{final}</Text>
        <Text style={[styles.delta, delta > 0 ? styles.deltaUp : styles.deltaZero]}>
          {delta > 0 ? `+${delta}` : '0'}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="locate-outline" size={14} color="#A855F7" />
        </View>
        <Text style={styles.headerTitle}>Impacto en tus stats</Text>
      </View>

      <View style={styles.chartWrap}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Grid de fondo */}
          {[1, 0.75, 0.5, 0.25].map((scale, idx) => (
            <Polygon
              key={idx}
              points={`${center},${center - maxRadius * scale} ${center + maxRadius * scale},${center} ${center},${center + maxRadius * scale} ${center - maxRadius * scale},${center}`}
              fill="rgba(255,255,255,0.015)"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
              strokeDasharray={idx < 3 ? '4 6' : ''}
            />
          ))}

          {/* Ejes */}
          <Line x1={center} y1={center} x2={center} y2={center - maxRadius} stroke={COLORS.technical} strokeOpacity="0.2" strokeWidth="1.5" />
          <Line x1={center} y1={center} x2={center + maxRadius} y2={center} stroke={COLORS.physical} strokeOpacity="0.2" strokeWidth="1.5" />
          <Line x1={center} y1={center} x2={center} y2={center + maxRadius} stroke={COLORS.mental} strokeOpacity="0.2" strokeWidth="1.5" />
          <Line x1={center} y1={center} x2={center - maxRadius} y2={center} stroke={COLORS.tactical} strokeOpacity="0.2" strokeWidth="1.5" />

          {/* Polígono base (skills actuales, tenue) */}
          <AnimatedPolygon
            points={basePoints}
            fill="rgba(241,143,52,0.08)"
            stroke="rgba(241,143,52,0.35)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeLinejoin="round"
          />

          {/* Polígono final (base + delta, saturado) */}
          {hasAnyDelta && (
            <AnimatedPolygon
              points={finalPoints}
              fill="rgba(241,143,52,0.22)"
              stroke="#F18F34"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          )}

          {/* Etiquetas de ejes */}
          <SvgText x={center} y={center - maxRadius - 12} textAnchor="middle" fontSize="10" fontWeight="bold" fill={COLORS.technical}>Técnico</SvgText>
          <SvgText x={center + maxRadius + 8} y={center + 3} textAnchor="start" fontSize="10" fontWeight="bold" fill={COLORS.physical}>Físico</SvgText>
          <SvgText x={center} y={center + maxRadius + 18} textAnchor="middle" fontSize="10" fontWeight="bold" fill={COLORS.mental}>Mental</SvgText>
          <SvgText x={center - maxRadius - 8} y={center + 3} textAnchor="end" fontSize="10" fontWeight="bold" fill={COLORS.tactical}>Táctico</SvgText>

          {/* Punto central */}
          <Circle cx={center} cy={center} r="3" fill="#F18F34" />
        </Svg>
      </View>

      <View style={styles.rows}>
        {renderSkillRow('technical')}
        {renderSkillRow('physical')}
        {renderSkillRow('mental')}
        {renderSkillRow('tactical')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  headerIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(168,85,247,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  chartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  rows: {
    width: '100%',
    gap: 8,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    width: 52,
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  barFillBase: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 3,
  },
  barFillDelta: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  value: {
    fontSize: 10,
    fontWeight: '900',
    width: 22,
    textAlign: 'right',
  },
  delta: {
    fontSize: 10,
    fontWeight: '900',
    width: 26,
    textAlign: 'right',
  },
  deltaUp: {
    color: '#22C55E',
  },
  deltaZero: {
    color: '#6B7280',
  },
});
