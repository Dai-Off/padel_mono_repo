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
import { useVideoPlayer, VideoView } from 'expo-video';
import { StoryGroup } from '../../api/community';
import { formatTimeAgo } from '../../utils/timeAgo';
import { formatPlayerLabel } from '../../lib/username';
import { filterById } from '../../lib/storyOverlays';

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
  const indexRef = useRef(0);

  const currentStory = group?.stories?.[currentIndex];
  const currentMedia = currentStory?.images?.[0];
  const isVideo = currentMedia?.media_type === 'video';
  const mediaUrl = currentMedia?.media_url || 'https://via.placeholder.com/1000';
  // Fondo borroso: para vídeo usamos la portada (no se puede usar el vídeo como imagen).
  const bgUrl = isVideo ? (currentMedia?.thumbnail_url || 'https://via.placeholder.com/1000') : mediaUrl;

  // Reproductor de vídeo: se crea una vez y se le cambia la fuente al pasar de historia.
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
  });

  // Inicia una historia: si es vídeo lo reproduce (el progreso lo llevan sus eventos);
  // si es imagen, usa el temporizador fijo de 5s.
  const startStory = (index: number) => {
    if (!group) return;
    indexRef.current = index;
    setCurrentIndex(index);
    progress.stopAnimation();
    progress.setValue(0);
    const media = group.stories[index]?.images?.[0];
    const vid = media?.media_type === 'video';
    try { player.pause(); } catch {}
    if (vid && media?.media_url) {
      try {
        player.replace(media.media_url);
        player.play();
      } catch {}
    } else {
      Animated.timing(progress, {
        toValue: 1,
        duration: STORY_DURATION,
        useNativeDriver: false, // la animación de width requiere false
      }).start(({ finished }) => {
        if (finished && !isPaused.current) goNext();
      });
    }
  };

  const goNext = () => {
    if (!group) return;
    const idx = indexRef.current;
    if (idx < group.stories.length - 1) startStory(idx + 1);
    else onClose();
  };

  const goPrev = () => {
    const idx = indexRef.current;
    startStory(idx > 0 ? idx - 1 : 0);
  };

  // Referencia estable a goNext para los listeners del reproductor.
  const goNextRef = useRef(goNext);
  useEffect(() => { goNextRef.current = goNext; });

  // Listeners del reproductor: avanzar al terminar y mover la barra de progreso.
  useEffect(() => {
    const endSub = player.addListener('playToEnd', () => {
      if (!isPaused.current) goNextRef.current();
    });
    const timeSub = player.addListener('timeUpdate', (e: any) => {
      const dur = player.duration;
      if (dur > 0) progress.setValue(Math.min(e.currentTime / dur, 1));
    });
    return () => { endSub.remove(); timeSub.remove(); };
  }, [player]);

  useEffect(() => {
    if (isVisible && group) {
      startStory(0);
    } else {
      progress.stopAnimation();
      progress.setValue(0);
      try { player.pause(); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, group]);

  const handleTap = (evt: any) => {
    const x = evt.nativeEvent.locationX;
    if (x < width * 0.3) goPrev();
    else goNext();
  };

  if (!isVisible || !group || !currentStory) return null;

  // Encuadre guardado de la media (mover/zoom/rotar). Si existe, se muestra "cover" recortada.
  const mt = currentStory.overlays?.media;
  const mediaTransform = mt
    ? [{ translateX: mt.x * width }, { translateY: mt.y * height }, { scale: mt.scale }, { rotate: `${mt.rotation}deg` }]
    : [];

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
          source={{ uri: bgUrl }}
          style={styles.backgroundImage}
          resizeMode="cover"
          blurRadius={25}
        />

        {/* Overlay for contrast */}
        <View style={styles.overlay} />

        {/* Contenido principal: vídeo o imagen (con encuadre si lo hay) */}
        <View style={[styles.mainImage, { overflow: 'hidden' }]}>
          <View style={[StyleSheet.absoluteFill, { transform: mediaTransform }]}>
            {isVideo ? (
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit={mt ? 'cover' : 'contain'}
                nativeControls={false}
              />
            ) : (
              <Image
                source={{ uri: mediaUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode={mt ? 'cover' : 'contain'}
              />
            )}
          </View>
        </View>

        {/* Overlays de la historia: filtro + capas (texto/stickers) */}
        {(() => {
          const vf = filterById(currentStory.overlays?.filter);
          return vf.opacity > 0 ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: vf.color, opacity: vf.opacity }]} />
          ) : null;
        })()}
        {currentStory.overlays?.layers?.map(l => (
          <View
            key={l.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: [
                { translateX: l.x * width },
                { translateY: l.y * height },
                { scale: l.scale },
                { rotate: `${l.rotation}deg` },
              ],
            }}
          >
            {l.type === 'text' ? (
              <Text style={{ fontSize: 28, fontWeight: '700', color: l.color, fontFamily: 'Outfit_700Bold', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 4 }}>{l.value}</Text>
            ) : (
              <Text style={{ fontSize: 56 }}>{l.value}</Text>
            )}
          </View>
        ))}

        {/* Interaction Layer */}
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={handleTap} 
          style={styles.touchLayer}
          onLongPress={() => {
            isPaused.current = true;
            progress.stopAnimation();
            if (isVideo) { try { player.pause(); } catch {} }
          }}
          onPressOut={() => {
            if (!isPaused.current) return;
            isPaused.current = false;
            if (isVideo) {
              try { player.play(); } catch {}
              return;
            }
            // Imagen: reanudar el temporizador desde donde estaba.
            const currentVal = (progress as any)._value;
            Animated.timing(progress, {
              toValue: 1,
              duration: STORY_DURATION * (1 - currentVal),
              useNativeDriver: false,
            }).start(({ finished }) => {
              if (finished) goNext();
            });
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
                  {formatPlayerLabel(group.player)}
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
