import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Image,
  Dimensions,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { createPost } from '../../api/community';
import { buildVideoCoverAndFrames } from '../../lib/videoFrames';
import { Transformable } from './Transformable';
import {
  StoryFilterId,
  StoryLayer,
  StoryOverlays,
  MediaTransform,
  STORY_FILTERS,
  filterById,
  TEXT_COLORS,
} from '../../lib/storyOverlays';

const { width, height } = Dimensions.get('window');

const STICKERS = ['🎾', '🏆', '🔥', '💪', '😎', '👏', '🥇', '⚡', '❤️', '😂', '🎉', '👀', '💯', '🙌', '🚀', '⭐'];

interface StoryEditorProps {
  isVisible: boolean;
  token?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

type Media = { uri: string; name: string; type: string; durationMs: number };

let layerSeq = 0;
const nextId = () => `l${Date.now()}_${layerSeq++}`;

export const StoryEditor: React.FC<StoryEditorProps> = ({ isVisible, token, onClose, onSuccess }) => {
  const [media, setMedia] = useState<Media | null>(null);
  const [layers, setLayers] = useState<StoryLayer[]>([]);
  const [filter, setFilter] = useState<StoryFilterId>('none');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [containerH, setContainerH] = useState(height);
  const [loading, setLoading] = useState(false);
  const [mediaTransform, setMediaTransform] = useState<MediaTransform>({ x: 0, y: 0, scale: 1, rotation: 0 });

  // Paneles
  const [showFilters, setShowFilters] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [textDraft, setTextDraft] = useState<{ id?: string; value: string; color: string } | null>(null);

  const isVideo = media?.type.startsWith('video') ?? false;
  const player = useVideoPlayer(null, (p) => { p.loop = true; });

  const reset = () => {
    setMedia(null);
    setLayers([]);
    setFilter('none');
    setSelectedId(null);
    setShowFilters(false);
    setShowStickers(false);
    setTextDraft(null);
    setMediaTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
  };

  // Al abrir, pedimos la media; si cancela, cerramos.
  useEffect(() => {
    if (!isVisible) return;
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería.');
        onClose();
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: false,
        quality: 0.8,
        videoMaxDuration: 60,
      });
      if (result.canceled) { onClose(); return; }
      const a = result.assets[0];
      const vid = a.type === 'video';
      const m: Media = {
        uri: a.uri,
        type: a.mimeType || (vid ? 'video/mp4' : 'image/jpeg'),
        name: a.fileName || (vid ? `story-${Date.now()}.mp4` : `story-${Date.now()}.jpg`),
        durationMs: a.duration ?? 0,
      };
      setMedia(m);
      if (vid) { try { player.replace(m.uri); player.play(); } catch {} }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  const updateLayer = (id: string, patch: Partial<StoryLayer>) => {
    setLayers(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  };
  const deleteSelected = () => {
    if (!selectedId) return;
    setLayers(prev => prev.filter(l => l.id !== selectedId));
    setSelectedId(null);
  };

  // Abre el editor de texto: si hay un texto seleccionado lo edita; si no, crea uno nuevo.
  const openTextEditor = () => {
    if (selectedId) {
      const sel = layers.find(l => l.id === selectedId);
      if (sel && sel.type === 'text') {
        setTextDraft({ id: sel.id, value: sel.value, color: sel.color });
        return;
      }
    }
    setTextDraft({ value: '', color: '#FFFFFF' });
  };

  const addText = () => {
    if (!textDraft || !textDraft.value.trim()) { setTextDraft(null); return; }
    if (textDraft.id) {
      updateLayer(textDraft.id, { value: textDraft.value.trim(), color: textDraft.color });
    } else {
      setLayers(prev => [...prev, {
        id: nextId(), type: 'text', value: textDraft.value.trim(), color: textDraft.color,
        x: 0.5, y: 0.45, scale: 1, rotation: 0,
      }]);
    }
    setTextDraft(null);
  };

  const addSticker = (emoji: string) => {
    setLayers(prev => [...prev, {
      id: nextId(), type: 'sticker', value: emoji, color: '#fff',
      x: 0.5, y: 0.45, scale: 1, rotation: 0,
    }]);
    setShowStickers(false);
  };

  const handleShare = async () => {
    if (!media || !token) return;
    setLoading(true);
    try {
      const overlays: StoryOverlays = { filter, layers, media: mediaTransform };
      let thumbnail; let moderationFrames;
      if (isVideo) {
        const r = await buildVideoCoverAndFrames(media.uri, media.durationMs, true);
        thumbnail = r.cover;
        moderationFrames = r.moderationFrames;
      }
      const res = await createPost(token, {
        files: [{ uri: media.uri, name: media.name, type: media.type }],
        thumbnail,
        moderationFrames,
        post_type: 'story',
        overlays,
      });
      if (res.ok) { onSuccess(); reset(); onClose(); }
      else Alert.alert('Error', res.error || 'No se pudo publicar la historia');
    } catch {
      Alert.alert('Error', 'No se pudo preparar la historia. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const f = filterById(filter);

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container} onLayout={(e) => setContainerH(Math.round(e.nativeEvent.layout.height))}>
        {/* Media de fondo, encuadrable con 2 dedos (mover + zoom + rotar) y recortada al marco. */}
        {media && (
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
            <Transformable
              fill
              panMinPointers={2}
              initX={0}
              initY={0}
              initScale={1}
              initRotation={0}
              containerW={width}
              containerH={height}
              onSelect={() => setSelectedId(null)}
              onCommit={setMediaTransform}
              style={StyleSheet.absoluteFill}
            >
              {isVideo ? (
                <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
              ) : (
                <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              )}
            </Transformable>
          </View>
        )}

        {/* Filtro */}
        {f.opacity > 0 && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: f.color, opacity: f.opacity }]} />
        )}

        {/* Capas */}
        {media && containerH > 0 && layers.map(layer => (
          <DraggableLayer
            key={layer.id}
            layer={layer}
            containerW={width}
            containerH={containerH}
            selected={selectedId === layer.id}
            onSelect={setSelectedId}
            onChange={updateLayer}
          />
        ))}

        {/* Barra superior */}
        <View style={styles.topBar} pointerEvents="box-none">
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.topRight}>
            {selectedId && (
              <TouchableOpacity onPress={deleteSelected} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={22} color="#FFF" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={openTextEditor} style={styles.iconBtn}>
              <Ionicons name="text" size={22} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowStickers(true)} style={styles.iconBtn}>
              <Ionicons name="happy-outline" size={22} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowFilters(s => !s)} style={styles.iconBtn}>
              <Ionicons name="color-filter-outline" size={22} color={showFilters ? '#F18F34' : '#FFF'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Selector de filtros */}
        {showFilters && (
          <View style={styles.filterBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {STORY_FILTERS.map(opt => (
                <TouchableOpacity key={opt.id} style={styles.filterChip} onPress={() => setFilter(opt.id)}>
                  <View style={[styles.filterSwatch, opt.id === filter && styles.filterSwatchActive]}>
                    {opt.opacity > 0
                      ? <View style={[StyleSheet.absoluteFill, { backgroundColor: opt.color, opacity: Math.min(opt.opacity * 2.5, 0.9), borderRadius: 8 }]} />
                      : <Ionicons name="ban-outline" size={18} color="rgba(255,255,255,0.6)" />}
                  </View>
                  <Text style={styles.filterLabel}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Capa de texto seleccionada: botón para reeditarla */}
        {selectedId && (() => {
          const sel = layers.find(l => l.id === selectedId);
          if (!sel || sel.type !== 'text') return null;
          return (
            <TouchableOpacity style={styles.editTextBtn} onPress={openTextEditor}>
              <Ionicons name="create-outline" size={16} color="#FFF" />
              <Text style={styles.editTextLabel}>Editar texto</Text>
            </TouchableOpacity>
          );
        })()}

        {/* Botón compartir */}
        {media && (
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} disabled={loading}>
            {loading
              ? <ActivityIndicator size="small" color="#FFF" />
              : <><Text style={styles.shareText}>Compartir historia</Text><Ionicons name="arrow-forward" size={18} color="#FFF" /></>}
          </TouchableOpacity>
        )}

        {/* Selector de stickers */}
        {showStickers && (
          <View style={styles.sheetBackdrop}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowStickers(false)} />
            <View style={styles.stickerSheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.stickerGrid}>
                {STICKERS.map(s => (
                  <TouchableOpacity key={s} onPress={() => addSticker(s)} style={styles.stickerItem}>
                    <Text style={styles.stickerEmoji}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Editor de texto */}
        {textDraft && (
          <View style={styles.textEditor}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={addText} />
            <TextInput
              style={[styles.textInput, { color: textDraft.color }]}
              value={textDraft.value}
              onChangeText={(t) => setTextDraft({ ...textDraft, value: t })}
              placeholder="Escribe algo..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              autoFocus
              multiline
            />
            <View style={styles.colorRow}>
              {TEXT_COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setTextDraft({ ...textDraft, color: c })}
                  style={[styles.colorDot, { backgroundColor: c }, textDraft.color === c && styles.colorDotActive]} />
              ))}
            </View>
            <TouchableOpacity style={styles.doneBtn} onPress={addText}>
              <Text style={styles.doneText}>Listo</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

// ─── Capa arrastrable / escalable / rotable ──────────────────────────────────

interface DraggableLayerProps {
  layer: StoryLayer;
  containerW: number;
  containerH: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<StoryLayer>) => void;
}

const DraggableLayer: React.FC<DraggableLayerProps> = ({ layer, containerW, containerH, selected, onSelect, onChange }) => {
  return (
    <Transformable
      initX={layer.x * containerW}
      initY={layer.y * containerH}
      initScale={layer.scale}
      initRotation={layer.rotation}
      containerW={containerW}
      containerH={containerH}
      panMinPointers={1}
      onSelect={() => onSelect(layer.id)}
      onCommit={(t) => onChange(layer.id, t)}
      style={[styles.layer, selected && styles.layerSelected]}
    >
      {layer.type === 'text' ? (
        <Text style={[styles.layerText, { color: layer.color }]}>{layer.value}</Text>
      ) : (
        <Text style={styles.layerSticker}>{layer.value}</Text>
      )}
    </Transformable>
  );
};

const styles = StyleSheet.create({
  container: {
    // Alto fijo: así el teclado se superpone en vez de empujar/encoger la imagen.
    width,
    height,
    backgroundColor: '#000',
  },
  deselect: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 24,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
    padding: 6,
  },
  layerSelected: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderStyle: 'dashed',
    borderRadius: 6,
  },
  layerText: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  layerSticker: {
    fontSize: 56,
  },
  filterBar: {
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
  },
  filterChip: {
    alignItems: 'center',
    marginRight: 14,
  },
  filterSwatch: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  filterSwatchActive: {
    borderWidth: 2,
    borderColor: '#F18F34',
  },
  filterLabel: {
    color: '#FFF',
    fontSize: 11,
    marginTop: 4,
    fontFamily: 'Outfit_400Regular',
  },
  editTextBtn: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  editTextLabel: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'Outfit_600SemiBold',
  },
  shareBtn: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F18F34',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 28,
  },
  shareText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  stickerSheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  stickerItem: {
    width: '12.5%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerEmoji: {
    fontSize: 30,
  },
  textEditor: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  textInput: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: '60%',
    fontFamily: 'Outfit_700Bold',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  colorDotActive: {
    borderColor: '#FFF',
    borderWidth: 3,
  },
  doneBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 28,
    right: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: '#F18F34',
  },
  doneText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
});
