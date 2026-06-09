import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommunityPost } from '../../api/community';
import { formatPlayerLabel } from '../../lib/username';

const { height } = Dimensions.get('window');

interface ClipViewerProps {
  isVisible: boolean;
  clip: CommunityPost | null;
  onClose: () => void;
}

/**
 * Visor de un Clip a pantalla completa. Versión provisional (un solo clip):
 * el visor inmersivo con swipe vertical y acciones laterales llega en el Bloque 4.
 */
export const ClipViewer: React.FC<ClipViewerProps> = ({ isVisible, clip, onClose }) => {
  const insets = useSafeAreaInsets();
  const url = clip?.images?.[0]?.media_url ?? null;

  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (isVisible && url) {
      try {
        player.replace(url);
        player.play();
      } catch {}
    } else {
      try { player.pause(); } catch {}
    }
  }, [isVisible, url, player]);

  if (!isVisible || !clip) return null;

  return (
    <Modal visible={isVisible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />

        <LinearGradient
          colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.7)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="box-none"
        >
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { top: insets.top + 12 }]}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={[styles.info, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={styles.author}>{formatPlayerLabel(clip.player)}</Text>
            {!!clip.caption && <Text style={styles.caption} numberOfLines={2}>{clip.caption}</Text>}
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height,
    backgroundColor: '#000',
  },
  closeBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    marginTop: 'auto',
    paddingHorizontal: 20,
  },
  author: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
    marginBottom: 4,
  },
  caption: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontFamily: 'Outfit_400Regular',
  },
});
