import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  Image, 
  TouchableOpacity, 
  Dimensions, 
  Animated,
  StatusBar,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StoryGroup } from '../../api/community';
import { formatTimeAgo } from '../../utils/timeAgo';

const { width, height } = Dimensions.get('window');
const STORY_DURATION = 5000; // 5 seconds

interface StoryViewerProps {
  isVisible: boolean;
  onClose: () => void;
  group: StoryGroup | null;
}

export const StoryViewer: React.FC<StoryViewerProps> = ({ isVisible, onClose, group }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const isPaused = useRef(false);

  useEffect(() => {
    if (isVisible && group) {
      setCurrentIndex(0);
      startProgress(0);
    } else {
      progress.stopAnimation();
      progress.setValue(0);
    }
  }, [isVisible, group]);

  const startProgress = (index: number) => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false, // width animation requires false
    }).start(({ finished }) => {
      if (finished && !isPaused.current) {
        handleNext();
      }
    });
  };

  const handleNext = () => {
    if (!group) return;
    if (currentIndex < group.stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
      startProgress(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      startProgress(currentIndex - 1);
    } else {
      // Re-start current if it's the first one
      startProgress(0);
    }
  };

  const handleTap = (evt: any) => {
    const x = evt.nativeEvent.locationX;
    if (x < width * 0.3) {
      handlePrev();
    } else {
      handleNext();
    }
  };

  if (!isVisible || !group) return null;

  const currentStory = group.stories[currentIndex];
  // Stories use community_posts table, images are in currentStory.images
  const imageUrl = currentStory?.images?.[0]?.image_url || 'https://via.placeholder.com/1000';

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <StatusBar hidden />
        
        {/* Background Layer: Blurred Mirror */}
        <Image 
          source={{ uri: imageUrl }} 
          style={styles.backgroundImage} 
          resizeMode="cover" 
          blurRadius={25}
        />
        
        {/* Overlay for contrast */}
        <View style={styles.overlay} />
        
        {/* Main Image: Contained without cropping */}
        <Image 
          source={{ uri: imageUrl }} 
          style={styles.mainImage} 
          resizeMode="contain" 
        />

        {/* Interaction Layer */}
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={handleTap} 
          style={styles.touchLayer}
          onLongPress={() => {
            isPaused.current = true;
            progress.stopAnimation();
          }}
          onPressOut={() => {
            if (isPaused.current) {
              isPaused.current = false;
              // Resume (simplified: just restart or continue from value)
              // For simplicity now, we re-start the segment
              const currentVal = (progress as any)._value;
              Animated.timing(progress, {
                toValue: 1,
                duration: STORY_DURATION * (1 - currentVal),
                useNativeDriver: false,
              }).start(({ finished }) => {
                if (finished) handleNext();
              });
            }
          }}
        >
          {/* Progress Bars */}
          <View style={styles.progressContainer}>
            {group.stories.map((_, i) => (
              <View key={i} style={styles.progressBarBg}>
                <Animated.View 
                  style={[
                    styles.progressBarActive,
                    { 
                      width: i < currentIndex 
                        ? '100%' 
                        : i === currentIndex 
                          ? progress.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0%', '100%']
                            })
                          : '0%' 
                    }
                  ]} 
                />
              </View>
            ))}
          </View>

          {/* Header Info */}
          <View style={styles.header}>
            <View style={styles.userInfo}>
              <Image 
                source={{ uri: group.player.avatar_url || 'https://via.placeholder.com/150' }} 
                style={styles.avatar} 
              />
              <View>
                <Text style={styles.username}>
                  {group.player.first_name} {group.player.last_name}
                </Text>
                <Text style={styles.timeAgo}>
                  {formatTimeAgo(currentStory.created_at)}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Caption (if exists) */}
          {currentStory.caption && (
            <View style={styles.captionContainer}>
              <Text style={styles.captionText}>{currentStory.caption}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  mainImage: {
    width: width,
    height: height,
    position: 'absolute',
  },
  touchLayer: {
    flex: 1,
  },
  progressContainer: {
    flexDirection: 'row',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 10,
    gap: 4,
  },
  progressBarBg: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressBarActive: {
    height: '100%',
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 15,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  username: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  timeAgo: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: 'Outfit_400Regular',
  },
  closeBtn: {
    padding: 5,
  },
  captionContainer: {
    position: 'absolute',
    bottom: 80,
    width: '100%',
    paddingHorizontal: 30,
    alignItems: 'center',
  },
  captionText: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 10,
    fontFamily: 'Outfit_500Medium',
  },
});
