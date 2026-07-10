import React from 'react';
import { Text, type TextStyle, type StyleProp } from 'react-native';
import { RARITY_CONFIG, type AchievementRarity } from '../../design/rarity';
import type { NameColorAttrs } from '../../api/profileCustomization';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const int = parseInt(n, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Color en la posición t∈[0,1] del gradiente definido por `stops`. */
function sampleGradient(stops: string[], t: number): string {
  if (stops.length === 1) return stops[0];
  const clamped = Math.max(0, Math.min(1, t));
  const seg = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const local = seg - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return rgbToHex(a.r + (b.r - a.r) * local, a.g + (b.g - a.g) * local, a.b + (b.b - a.b) * local);
}

interface Props {
  name: string;
  nameColor?: NameColorAttrs | null;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/**
 * Nombre del jugador con color/gradiente cosmético (name_color). 1 color = sólido;
 * 2+ = gradiente interpolado por carácter (sin dependencias nativas). Sin cosmético,
 * cae a un <Text> normal con el estilo recibido.
 */
export const PlayerName: React.FC<Props> = ({ name, nameColor, style, numberOfLines }) => {
  const colors = nameColor?.colors ?? null;
  if (!colors || colors.length === 0) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {name}
      </Text>
    );
  }

  const conf = RARITY_CONFIG[(nameColor?.rarity as AchievementRarity) ?? 'common'] ?? RARITY_CONFIG.common;
  const glowy = nameColor?.rarity === 'epic' || nameColor?.rarity === 'legendary';
  const shadow: TextStyle = {
    textShadowColor: conf.glow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: glowy ? 8 : 3,
  };

  if (colors.length === 1) {
    return (
      <Text style={[style, { color: colors[0] }, shadow]} numberOfLines={numberOfLines}>
        {name}
      </Text>
    );
  }

  // Gradiente por carácter: Text anidados heredan fontSize/fontWeight del padre.
  const chars = Array.from(name);
  const denom = Math.max(1, chars.length - 1);
  return (
    <Text style={[style, shadow]} numberOfLines={numberOfLines ?? 1}>
      {chars.map((ch, i) => (
        <Text key={i} style={{ color: sampleGradient(colors, i / denom) }}>
          {ch}
        </Text>
      ))}
    </Text>
  );
};
