import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { CourseEnrollment } from '../../api/schoolCourses';

const { width } = Dimensions.get('window');

interface BookedCourseCardProps {
  enrollment: CourseEnrollment;
  onPress?: () => void;
  onCancel?: () => void;
}

export const BookedCourseCard: React.FC<BookedCourseCardProps> = ({ enrollment, onPress, onCancel }) => {
  const course = enrollment.course;
  if (!course) return null;

  return (
    <View style={styles.outerContainer}>
      <BlurView intensity={20} tint="light" style={styles.container}>
        {/* Border Overlay */}
        <View style={styles.borderOverlay} />

        {/* Badge "Confirmada" */}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✓</Text>
          <Text style={styles.badgeLabel}>Confirmada</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.row}>
            {/* Image Placeholder / Icon */}
            <View style={[styles.imageContainer, { backgroundColor: '#10B981' }]}>
              <View style={styles.calendarIcon}>
                <Text style={styles.emoji}>🎯</Text>
              </View>
            </View>

            <View style={styles.details}>
              <Text style={styles.title} numberOfLines={1}>{course.name}</Text>
              <Text style={styles.clubName} numberOfLines={1}>
                <Ionicons name="location-outline" size={12} color="#9CA3AF" /> {course.club_name}
              </Text>
              
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="stats-chart" size={12} color="#10B981" />
                  <Text style={styles.metaText}>{course.level}</Text>
                </View>
                <View style={[styles.metaItem, { marginLeft: 12 }]}>
                  <Ionicons name="people" size={12} color="#3B82F6" />
                  <Text style={styles.metaText}>Grupo</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Schedule Info */}
          <View style={styles.scheduleContainer}>
            <View style={styles.scheduleItem}>
              <Ionicons name="calendar-outline" size={14} color="#9CA3AF" />
              <Text style={styles.scheduleText}>
                {(course.days || []).map(d => d.weekday.charAt(0).toUpperCase() + d.weekday.slice(1)).join(', ')}
              </Text>
            </View>
            <View style={styles.scheduleDivider} />
            <View style={styles.scheduleItem}>
              <Ionicons name="time-outline" size={14} color="#9CA3AF" />
              <Text style={styles.scheduleText}>
                {course.days?.[0]?.start_time} - {course.days?.[0]?.end_time}
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.detailsButton}
              onPress={onPress}
              activeOpacity={0.7}
            >
              <Text style={styles.detailsButtonText}>Ver detalles</Text>
              <Ionicons name="chevron-forward" size={14} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    marginBottom: 16,
    borderRadius: 24,
    overflow: 'hidden',
  },
  container: {
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: 'rgba(34, 197, 94, 0.4)',
    borderRadius: 24,
  },
  badge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#22C55E',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
    marginRight: 4,
  },
  badgeLabel: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  content: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  calendarIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 24,
  },
  details: {
    flex: 1,
    marginLeft: 16,
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  clubName: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  metaText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  scheduleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  scheduleText: {
    color: '#E5E7EB',
    fontSize: 13,
    marginLeft: 6,
    fontWeight: '600',
  },
  scheduleDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 12,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '700',
  },
  detailsButton: {
    flex: 2,
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  detailsButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
