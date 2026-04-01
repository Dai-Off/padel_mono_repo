import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Equiv. CSS:
 * radial-gradient(at 30% 35%, rgba(227, 30, 36, 0.12) 0%, transparent 55%),
 * radial-gradient(at 70% 65%, rgba(59, 130, 246, 0.1) 0%, transparent 55%);
 */
type Props = {
  width: number;
  height: number;
};

export function BookingSuccessRadialBg({ width, height }: Props) {
  const uid = React.useId().replace(/:/g, '_');
  if (width <= 0 || height <= 0) return null;

  const g1 = `${uid}_r1`;
  const g2 = `${uid}_r2`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient
            id={g1}
            cx="30%"
            cy="35%"
            rx="55%"
            ry="55%"
            fx="30%"
            fy="35%"
            gradientUnits="objectBoundingBox"
          >
            <Stop offset="0" stopColor="rgb(227, 30, 36)" stopOpacity={0.12} />
            <Stop offset="0.55" stopColor="rgb(227, 30, 36)" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient
            id={g2}
            cx="70%"
            cy="65%"
            rx="55%"
            ry="55%"
            fx="70%"
            fy="65%"
            gradientUnits="objectBoundingBox"
          >
            <Stop offset="0" stopColor="rgb(59, 130, 246)" stopOpacity={0.1} />
            <Stop offset="0.55" stopColor="rgb(59, 130, 246)" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={`url(#${g1})`} />
        <Rect x="0" y="0" width={width} height={height} fill={`url(#${g2})`} />
      </Svg>
    </View>
  );
}
