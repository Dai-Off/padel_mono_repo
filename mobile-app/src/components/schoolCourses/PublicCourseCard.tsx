import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PublicCourse } from '../../api/schoolCourses';

const { width } = Dimensions.get('window');

interface PublicCourseCardProps {
  course: PublicCourse;
  onPress?: () => void;
  isReserved?: boolean;
}

export const PublicCourseCard: React.FC<PublicCourseCardProps> = ({ course, onPress, isReserved }) => {
  const price = (course.price_cents / 100).toFixed(0);
  const imageUrl = course.club_logo_url || "https://images.unsplash.com/photo-1658491830143-72808ca237e3?w=400&h=300&fit=crop";

  // Formateo de fecha
  const firstDay = course.days[0];
  const weekdayNames: Record<string, string> = {
    mon: "jueves", // Mocked as per snippet or dynamic if needed
    tue: "martes",
    wed: "miércoles",
    thu: "jueves",
    fri: "viernes",
    sat: "sábado",
    sun: "domingo",
  };
  const dateStr = firstDay ? `${weekdayNames[firstDay.weekday]}, 29 de enero` : "Fecha a confirmar";
  const timeStr = firstDay ? firstDay.start_time : "11:30";

  return (
    <TouchableOpacity 
      activeOpacity={0.9} 
      onPress={onPress}
      style={styles.container}
    >
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.03)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, isReserved && styles.reservedBorder]}
      >
        {isReserved && (
          <View style={styles.reservedBadge}>
            <Text style={styles.reservedBadgeCheck}>✓</Text>
            <Text style={styles.reservedBadgeLabel}>Reservada</Text>
          </View>
        )}

        <View style={styles.row}>
          {/* Image Container */}
          <View style={styles.imageWrapper}>
            <Image source={{ uri: imageUrl }} style={styles.image} />
            <LinearGradient
              colors={['rgba(0, 0, 0, 0.4)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Price Badge Overlay */}
            <View style={styles.priceOverlay}>
              <Text style={styles.priceValue}>{price}€<Text style={styles.priceUnit}>/clase</Text></Text>
            </View>
          </View>

          {/* Info Section */}
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>{course.name.toUpperCase()}</Text>
            
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={14} color="#6B7280" />
              <Text style={styles.metaTextHighlight}>{dateStr}</Text>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaTextSecondary}>{timeStr}</Text>
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color="#6B7280" />
              <Text style={styles.metaTextSecondary} numberOfLines={1}>{course.club_name}</Text>
            </View>

            {/* Badges Row */}
            <View style={styles.badgesWrapper}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>📊 {course.level}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>⚥ Mixto</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>👥 {course.enrolled_count}/{course.capacity}</Text>
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    borderRadius: 12, // rounded-xl
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, // shadow for rgba(0,0,0,0.2) 0px 4px 20px
    shadowRadius: 10,
    elevation: 4,
  },
  gradient: {
    padding: 14, // p-3.5
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
  },
  reservedBorder: {
    borderColor: 'rgba(34, 197, 94, 0.5)', // border-green-500/50
  },
  reservedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#22C55E', // bg-green-500
    paddingHorizontal: 10, // px-2.5
    paddingVertical: 4, // py-1
    borderRadius: 8, // rounded-lg
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  reservedBadgeCheck: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
    marginRight: 4,
  },
  reservedBadgeLabel: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
  },
  row: {
    flexDirection: 'row',
    gap: 14, // gap-3.5
  },
  imageWrapper: {
    width: 112, // w-28
    height: 112, // h-28
    borderRadius: 12, // rounded-xl
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  priceOverlay: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // bg-black/70
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceValue: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900', // font-black
  },
  priceUnit: {
    fontSize: 9,
    color: '#D1D5DB', // text-gray-300
    fontWeight: '400',
  },
  info: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  title: {
    color: '#FFF', // text-white
    fontSize: 16, // text-base
    fontWeight: '700', // font-bold
    marginBottom: 2, // mb-0.5
    paddingRight: 40, // Space for badge if any
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2, // mb-0.5 / mb-1
  },
  metaTextHighlight: {
    fontSize: 12, // text-xs
    color: '#9CA3AF', // text-gray-400
    fontWeight: '500', // font-medium
    textTransform: 'capitalize',
  },
  metaDot: {
    color: '#374151', // text-gray-700
    fontSize: 12,
  },
  metaTextSecondary: {
    fontSize: 12, // text-xs
    color: '#6B7280', // text-gray-500
    fontWeight: '400',
  },
  badgesWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // bg-white/10
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)', // border-white/10
  },
  badgeText: {
    fontSize: 9, // text-[9px]
    fontWeight: '700', // font-bold
    color: '#D1D5DB', // text-gray-300
    textTransform: 'uppercase',
  },
});
