import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StoryGroup } from '../../api/community';
import { Ionicons } from '@expo/vector-icons';

interface StoriesRowProps {
  groups: StoryGroup[];
  onPressStory: (group: StoryGroup) => void;
  onPressAdd: () => void;
}

export const StoriesRow: React.FC<StoriesRowProps> = ({ groups, onPressStory, onPressAdd }) => {
  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      <TouchableOpacity style={styles.addItem} onPress={onPressAdd}>
        <View style={styles.addCircle}>
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={24} color="rgba(255,255,255,0.3)" />
          </View>
          <View style={styles.plusBadge}>
            <Ionicons name="add" size={14} color="#000" />
          </View>
        </View>
        <Text style={styles.addText}>Tu historia</Text>
      </TouchableOpacity>

      {groups.map((group) => (
        <TouchableOpacity 
          key={group.player_id} 
          style={styles.storyItem}
          onPress={() => onPressStory(group)}
        >
          <LinearGradient
            colors={['#F18F34', '#ED1E79']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientBorder}
          >
            <View style={styles.avatarInner}>
              <Image 
                source={{ uri: group.player.avatar_url || 'https://via.placeholder.com/150' }} 
                style={styles.avatar} 
              />
            </View>
          </LinearGradient>
          <Text style={styles.name} numberOfLines={1}>
            {group.player.first_name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#0F0F0F',
  },
  addItem: {
    alignItems: 'center',
    marginRight: 16,
  },
  addCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 8,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F18F34',
    borderWidth: 2,
    borderColor: '#0F0F0F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: 'Outfit_400Regular',
  },
  storyItem: {
    alignItems: 'center',
    marginRight: 16,
  },
  gradientBorder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: '#0F0F0F',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 12,
    width: 68,
    textAlign: 'center',
    fontFamily: 'Outfit_400Regular',
  },
});
