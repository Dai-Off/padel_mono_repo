import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { 
  Polygon, 
  Line, 
  Circle, 
  Text as SvgText,
} from 'react-native-svg';
import { useTranslation } from '../../i18n';

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

interface SkillPolarChartProps {
  skills?: {
    technical: number;
    physical: number;
    mental: number;
    tactical: number;
  };
}

export const SkillPolarChart: React.FC<SkillPolarChartProps> = ({ 
  skills = { technical: 25, physical: 25, mental: 25, tactical: 25 } 
}) => {
  const { t } = useTranslation();
  const animatedValue = useRef(new Animated.Value(0)).current;

  const skillLabels = {
    technical: t('learning.skillTechnical'),
    physical: t('learning.skillPhysical'),
    mental: t('learning.skillMental'),
    tactical: t('learning.skillTactical'),
  };

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [animatedValue]);

  const size = 300;
  const center = size / 2;
  const maxRadius = 90;

  const getPoints = (val: number) => {
    const tech = (skills.technical / 100) * maxRadius * val;
    const phys = (skills.physical / 100) * maxRadius * val;
    const ment = (skills.mental / 100) * maxRadius * val;
    const tact = (skills.tactical / 100) * maxRadius * val;

    const p1 = `${center},${center - tech}`;
    const p2 = `${center + phys},${center}`;
    const p3 = `${center},${center + ment}`;
    const p4 = `${center - tact},${center}`;
    
    return `${p1} ${p2} ${p3} ${p4}`;
  };

  const polygonPoints = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [getPoints(0), getPoints(1)],
  });

  const renderSkillBar = (label: string, value: number, color: string) => (
    <View style={styles.skillBarRow}>
      <View style={[styles.skillDot, { backgroundColor: color }]} />
      <Text style={[styles.skillLabel, { color }]}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.skillValueText, { color }]}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {[1, 0.75, 0.5, 0.25].map((scale, idx) => (
            <Polygon
              key={idx}
              points={`${center},${center - maxRadius * scale} ${center + maxRadius * scale},${center} ${center},${center + maxRadius * scale} ${center - maxRadius * scale},${center}`}
              fill="rgba(255,255,255,0.015)"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
              strokeDasharray={idx < 3 ? "4 6" : ""}
            />
          ))}

          <Line x1={center} y1={center} x2={center} y2={center - maxRadius} stroke="#F18F34" strokeOpacity="0.2" strokeWidth="1.5" />
          <Line x1={center} y1={center} x2={center + maxRadius} y2={center} stroke="#34D399" strokeOpacity="0.2" strokeWidth="1.5" />
          <Line x1={center} y1={center} x2={center} y2={center + maxRadius} stroke="#F472B6" strokeOpacity="0.2" strokeWidth="1.5" />
          <Line x1={center} y1={center} x2={center - maxRadius} y2={center} stroke="#818CF8" strokeOpacity="0.2" strokeWidth="1.5" />

          <AnimatedPolygon
            points={polygonPoints}
            fill="rgba(241, 143, 52, 0.18)"
            stroke="#F18F34"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          <SvgText x={center} y={center - maxRadius - 15} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#F18F34">{skillLabels.technical}</SvgText>
          <SvgText x={center + maxRadius + 10} y={center + 4} textAnchor="start" fontSize="11" fontWeight="bold" fill="#34D399">{skillLabels.physical}</SvgText>
          <SvgText x={center} y={center + maxRadius + 22} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#F472B6">{skillLabels.mental}</SvgText>
          <SvgText x={center - maxRadius - 10} y={center + 4} textAnchor="end" fontSize="11" fontWeight="bold" fill="#818CF8">{skillLabels.tactical}</SvgText>

          <Circle cx={center} cy={center} r="4" fill="#F18F34" />
        </Svg>
      </View>

      <View style={styles.skillsContainer}>
        {renderSkillBar(skillLabels.technical, skills.technical, '#F18F34')}
        {renderSkillBar(skillLabels.physical, skills.physical, '#34D399')}
        {renderSkillBar(skillLabels.mental, skills.mental, '#F472B6')}
        {renderSkillBar(skillLabels.tactical, skills.tactical, '#818CF8')}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  chartWrapper: {
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skillsContainer: {
    width: '100%',
    paddingHorizontal: 10,
    gap: 10,
  },
  skillBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  skillLabel: {
    fontSize: 10,
    fontWeight: '600',
    width: 50,
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  skillValueText: {
    fontSize: 10,
    fontWeight: '900',
    width: 24,
    textAlign: 'right',
  },
});
