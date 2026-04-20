import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface ComingSoonProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const ComingSoon: React.FC<ComingSoonProps> = ({ title, icon }) => {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(241, 143, 52, 0.15)', 'transparent']}
        style={styles.gradientCircle}
      >
        <Ionicons name={icon} size={64} color="#F18F34" />
      </LinearGradient>
      
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Estamos trabajando para traerte la mejor experiencia de comunidad.</Text>
      
      <View style={styles.badge}>
        <Text style={styles.badgeText}>PRÓXIMAMENTE</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    marginTop: 60,
  },
  gradientCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 15,
    fontFamily: 'Outfit_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  badge: {
    backgroundColor: 'rgba(241, 143, 52, 0.1)',
    borderWidth: 1,
    borderColor: '#F18F34',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    color: '#F18F34',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Outfit_700Bold',
    letterSpacing: 1,
  },
});
