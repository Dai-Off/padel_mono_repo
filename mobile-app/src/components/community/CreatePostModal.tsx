import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  TouchableOpacity, 
  Image, 
  FlatList, 
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPost } from '../../api/community';
import { useAuth } from '../../contexts/AuthContext';

type MediaFile = { uri: string; name: string; type: string };

// Nº de frames a moderar según la duración del vídeo (mín 3, máx 5).
// Acordado: ≤15s → 3 · 16–40s → 4 · 41–60s → 5.
function framesForDuration(durationMs: number): number {
  const s = durationMs / 1000;
  if (s <= 15) return 3;
  if (s <= 40) return 4;
  return 5;
}

// Tiempos (ms) repartidos uniformemente por la duración, incluyendo 0 y el final.
function sampleTimes(durationMs: number, count: number): number[] {
  if (count <= 1 || durationMs <= 0) return [0];
  const step = durationMs / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

// Extrae un frame del vídeo como imagen lista para subir.
async function extractFrame(videoUri: string, timeMs: number, idx: number): Promise<MediaFile> {
  const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: timeMs, quality: 0.7 });
  return { uri, name: `frame-${Date.now()}-${idx}.jpg`, type: 'image/jpeg' };
}

const { width } = Dimensions.get('window');

export type PostType = 'post' | 'story' | 'reel';

interface CreatePostModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Tipos que el modal permite crear. Si solo hay uno, se oculta el selector de pestañas. */
  allowedTypes?: PostType[];
}

const TITLE_BY_TYPE: Record<PostType, string> = {
  post: 'Nuevo Post',
  story: 'Nueva historia',
  reel: 'Nuevo Clip',
};

const TAB_LABEL_BY_TYPE: Record<PostType, string> = {
  post: 'Post',
  story: 'Historia',
  reel: 'Clip',
};

type PickerCfg = { mediaTypes: ('images' | 'videos')[]; multiple: boolean; limit: number };

// Configuración del picker por tipo de contenido:
//  - post:  varias imágenes (carrusel estilo Instagram). Sin vídeo.
//  - story: una sola pieza, imagen O vídeo.
//  - reel:  un solo vídeo.
const MEDIA_CONFIG: Record<PostType, PickerCfg> = {
  post: { mediaTypes: ['images'], multiple: true, limit: 10 },
  story: { mediaTypes: ['images', 'videos'], multiple: false, limit: 1 },
  reel: { mediaTypes: ['videos'], multiple: false, limit: 1 },
};

export const CreatePostModal: React.FC<CreatePostModalProps> = ({ isVisible, onClose, onSuccess, allowedTypes = ['post', 'story', 'reel'] }) => {
  const { session } = useAuth();
  const token = session?.access_token;
  const insets = useSafeAreaInsets();

  const [selectedType, setSelectedType] = useState<PostType>(allowedTypes[0]);
  const [selectedImages, setSelectedImages] = useState<MediaFile[]>([]);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMediaSheetVisible, setIsMediaSheetVisible] = useState(false);

  // Portada del vídeo (Clip / historia-vídeo)
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoDurationMs, setVideoDurationMs] = useState(0);
  const [cover, setCover] = useState<MediaFile | null>(null);
  const [coverIsAuto, setCoverIsAuto] = useState(true); // true = primer frame automático
  const [isCoverSheetVisible, setIsCoverSheetVisible] = useState(false);
  const [frameOptions, setFrameOptions] = useState<{ uri: string; timeMs: number }[] | null>(null);
  const [busyCover, setBusyCover] = useState(false); // generando portada/fotogramas

  const hasVideo = selectedImages.some(m => m.type.startsWith('video'));

  const clearVideoState = () => {
    setVideoUri(null);
    setVideoDurationMs(0);
    setCover(null);
    setCoverIsAuto(true);
    setFrameOptions(null);
    setIsCoverSheetVisible(false);
  };

  const cfg = MEDIA_CONFIG[selectedType];
  const allowsVideo = cfg.mediaTypes.includes('videos');
  const isVideoOnly = allowsVideo && !cfg.mediaTypes.includes('images'); // true solo en reel

  // Al abrir el modal partimos siempre del primer tipo permitido y limpiamos la selección.
  const typesKey = allowedTypes.join(',');
  useEffect(() => {
    if (isVisible) {
      setSelectedType(allowedTypes[0]);
      setSelectedImages([]);
      setIsMediaSheetVisible(false);
      clearVideoState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, typesKey]);

  // Genera la portada automática (primer frame) cuando se selecciona un vídeo.
  const prepareVideo = async (uri: string, durationMs: number) => {
    setVideoUri(uri);
    setVideoDurationMs(durationMs);
    setBusyCover(true);
    try {
      const auto = await extractFrame(uri, 0, 0);
      setCover({ ...auto, name: `cover-${Date.now()}.jpg` });
      setCoverIsAuto(true);
    } catch {
      // El módulo nativo puede no estar en el build actual (hasta el rebuild EAS).
      setCover(null);
    } finally {
      setBusyCover(false);
    }
  };

  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para publicar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: cfg.mediaTypes,
      allowsMultipleSelection: cfg.multiple,
      selectionLimit: cfg.limit,
      quality: 0.8,
      videoMaxDuration: 60,
    });

    if (!result.canceled) {
      const newMedia = result.assets.map(asset => {
        const isVid = asset.type === 'video';
        return {
          uri: asset.uri,
          name: asset.fileName || (isVid ? `video-${Date.now()}.mp4` : `image-${Date.now()}.jpg`),
          type: asset.mimeType || (isVid ? 'video/mp4' : 'image/jpeg'),
        };
      });
      // Si el tipo solo admite una pieza (story/reel) reemplazamos; en post acumulamos.
      setSelectedImages(cfg.multiple ? [...selectedImages, ...newMedia] : newMedia.slice(0, 1));

      // Si es vídeo (pieza única), preparamos la portada. asset.duration viene en ms.
      const vid = result.assets.find(a => a.type === 'video');
      if (vid) await prepareVideo(vid.uri, vid.duration ?? 0);
      else clearVideoState();
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu cámara.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: cfg.mediaTypes,
      quality: 0.8,
      videoMaxDuration: 60,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      const isVid = asset.type === 'video';
      const newMedia = {
        uri: asset.uri,
        name: asset.fileName || (isVid ? `video-${Date.now()}.mp4` : `photo-${Date.now()}.jpg`),
        type: asset.mimeType || (isVid ? 'video/mp4' : 'image/jpeg'),
      };
      setSelectedImages(cfg.multiple ? [...selectedImages, newMedia] : [newMedia]);

      if (isVid) await prepareVideo(asset.uri, asset.duration ?? 0);
      else clearVideoState();
    }
  };

  const handleAddMedia = () => setIsMediaSheetVisible(true);

  const pickFrom = (source: 'camera' | 'gallery') => {
    setIsMediaSheetVisible(false);
    if (source === 'camera') takePhoto();
    else openGallery();
  };

  // --- Portada del vídeo ---

  // Opción "Subir imagen": usa una imagen propia como portada.
  const pickCoverImage = async () => {
    setIsCoverSheetVisible(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled) {
      const a = result.assets[0];
      setCover({ uri: a.uri, name: a.fileName || `cover-${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg' });
      setCoverIsAuto(false);
    }
  };

  // Opción "Elegir fotograma": genera 5 fotogramas repartidos para elegir uno.
  const openFrameChooser = async () => {
    setIsCoverSheetVisible(false);
    if (!videoUri) return;
    setBusyCover(true);
    try {
      const times = sampleTimes(videoDurationMs, 5);
      const frames = await Promise.all(
        times.map(async (t) => ({
          uri: (await VideoThumbnails.getThumbnailAsync(videoUri, { time: t, quality: 0.6 })).uri,
          timeMs: t,
        }))
      );
      setFrameOptions(frames);
    } catch {
      Alert.alert('Error', 'No se pudieron generar los fotogramas.');
    } finally {
      setBusyCover(false);
    }
  };

  const chooseFrame = (f: { uri: string; timeMs: number }) => {
    setCover({ uri: f.uri, name: `cover-${Date.now()}.jpg`, type: 'image/jpeg' });
    setCoverIsAuto(f.timeMs === 0);
    setFrameOptions(null);
  };

  // Opción "Restaurar automática": vuelve al primer frame.
  const restoreAutoCover = async () => {
    setIsCoverSheetVisible(false);
    if (!videoUri) return;
    setBusyCover(true);
    try {
      const auto = await extractFrame(videoUri, 0, 0);
      setCover({ ...auto, name: `cover-${Date.now()}.jpg` });
      setCoverIsAuto(true);
    } catch {
      Alert.alert('Error', 'No se pudo generar la portada.');
    } finally {
      setBusyCover(false);
    }
  };

  const handlePost = async () => {
    if (selectedImages.length === 0) {
      Alert.alert(
        'Error',
        isVideoOnly ? 'Selecciona un vídeo' : allowsVideo ? 'Selecciona una imagen o un vídeo' : 'Selecciona al menos una imagen'
      );
      return;
    }

    if (!token) {
      Alert.alert('Error', 'Debes estar autenticado para publicar');
      return;
    }

    setLoading(true);
    try {
      let thumbnail: MediaFile | undefined;
      let moderationFrames: MediaFile[] | undefined;

      if (hasVideo) {
        if (!cover) {
          Alert.alert('Portada necesaria', 'No se pudo preparar la portada del vídeo. Inténtalo de nuevo.');
          return;
        }
        thumbnail = cover;
        // Frames de moderación muestreados del vídeo (mín 3, máx 5 según duración).
        // Si la portada es el frame automático (0), no lo repetimos.
        const count = framesForDuration(videoDurationMs);
        const times = sampleTimes(videoDurationMs, count);
        const frameTimes = coverIsAuto ? times.slice(1) : times;
        moderationFrames = await Promise.all(frameTimes.map((t, i) => extractFrame(videoUri!, t, i)));
      }

      const res = await createPost(token, {
        files: selectedImages,
        thumbnail,
        moderationFrames,
        caption,
        location,
        post_type: selectedType,
      });

      if (res.ok) {
        onSuccess();
        resetState();
        onClose();
      } else {
        Alert.alert('Error', res.error || 'No se pudo crear la publicación');
      }
    } catch {
      Alert.alert('Error', 'No se pudo preparar el vídeo. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setSelectedImages([]);
    setCaption('');
    setLocation('');
    setSelectedType(allowedTypes[0]);
    clearVideoState();
  };

  const removeImage = (index: number) => {
    const updated = [...selectedImages];
    const removed = updated.splice(index, 1)[0];
    setSelectedImages(updated);
    if (removed?.type.startsWith('video')) clearVideoState();
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <LinearGradient
            colors={['rgba(241, 143, 52, 0.1)', 'transparent']}
            style={[styles.header, { paddingTop: 20 + insets.top }]}
          >
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelButton}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{TITLE_BY_TYPE[selectedType]}</Text>
            <TouchableOpacity onPress={handlePost} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#F18F34" />
              ) : (
                <Text style={styles.postButton}>Compartir</Text>
              )}
            </TouchableOpacity>
          </LinearGradient>

          {allowedTypes.length > 1 && (
            <View style={styles.typeSelector}>
              {allowedTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeTab, selectedType === type && styles.activeTypeTab]}
                  onPress={() => setSelectedType(type)}
                >
                  <Text style={[styles.typeTabText, selectedType === type && styles.activeTypeTabText]}>
                    {TAB_LABEL_BY_TYPE[type]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.scrollContent}>
            <View style={styles.mediaSection}>
              <FlatList
                // Tipos de una sola pieza (story/reel): ocultamos "Añadir" cuando ya hay una.
                data={!cfg.multiple && selectedImages.length >= 1 ? selectedImages : [...selectedImages, { id: 'add' }]}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, index) => (item as any).uri || 'add-btn'}
                renderItem={({ item, index }) => (
                  (item as any).uri ? (
                    <View style={styles.imageWrapper}>
                      {String((item as any).type).startsWith('video') ? (
                        <View style={styles.previewImage}>
                          {cover ? (
                            <Image source={{ uri: cover.uri }} style={styles.previewImage} />
                          ) : (
                            <View style={[styles.previewImage, styles.videoPreview]}>
                              <Ionicons name="videocam" size={32} color="rgba(255,255,255,0.5)" />
                            </View>
                          )}
                          <View style={styles.playOverlay}>
                            <Ionicons name="play-circle" size={34} color="#FFF" />
                          </View>
                        </View>
                      ) : (
                        <Image source={{ uri: (item as any).uri }} style={styles.previewImage} />
                      )}
                      <TouchableOpacity
                        style={styles.removeBadge}
                        onPress={() => removeImage(index)}
                      >
                        <Ionicons name="close" size={14} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addButton} onPress={handleAddMedia}>
                      <Ionicons name={isVideoOnly ? 'videocam' : 'camera'} size={30} color="rgba(255,255,255,0.3)" />
                      <Text style={styles.addMediaText}>Añadir</Text>
                    </TouchableOpacity>
                  )
                )}
              />
            </View>

            {hasVideo && (
              <TouchableOpacity
                style={styles.coverButton}
                onPress={() => setIsCoverSheetVisible(true)}
                disabled={busyCover}
              >
                {busyCover ? (
                  <ActivityIndicator size="small" color="#F18F34" />
                ) : (
                  <Ionicons name="image-outline" size={18} color="#F18F34" />
                )}
                <Text style={styles.coverButtonText}>Cambiar portada</Text>
              </TouchableOpacity>
            )}

            <View style={styles.formSection}>
              <TextInput
                style={styles.captionInput}
                placeholder={isVideoOnly ? 'Escribe una descripción...' : 'Escribe un pie de foto...'}
                placeholderTextColor="rgba(255,255,255,0.3)"
                multiline
                value={caption}
                onChangeText={setCaption}
              />
              
              <View style={styles.inputRow}>
                <Ionicons name="location-outline" size={20} color="#F18F34" />
                <TextInput
                  style={styles.input}
                  placeholder="Agregar ubicación"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={location}
                  onChangeText={setLocation}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Bottom sheet propio para elegir origen de la media (sustituye al Alert nativo) */}
        {isMediaSheetVisible && (
          <View style={styles.sheetBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setIsMediaSheetVisible(false)}
            />
            <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>
                {isVideoOnly ? 'AÑADIR VÍDEO' : allowsVideo ? 'AÑADIR IMAGEN O VÍDEO' : 'AÑADIR IMAGEN'}
              </Text>

              <TouchableOpacity style={styles.sheetOption} onPress={() => pickFrom('camera')}>
                <Ionicons name={isVideoOnly ? 'videocam-outline' : 'camera-outline'} size={22} color="#F18F34" />
                <Text style={styles.sheetOptionText}>{isVideoOnly ? 'Grabar vídeo' : 'Cámara'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetOption} onPress={() => pickFrom('gallery')}>
                <Ionicons name="images-outline" size={22} color="#F18F34" />
                <Text style={styles.sheetOptionText}>Galería</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setIsMediaSheetVisible(false)}>
                <Text style={styles.sheetCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bottom sheet de portada del Clip */}
        {isCoverSheetVisible && (
          <View style={styles.sheetBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setIsCoverSheetVisible(false)}
            />
            <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>PORTADA DEL CLIP</Text>

              <TouchableOpacity style={styles.sheetOption} onPress={pickCoverImage}>
                <Ionicons name="image-outline" size={22} color="#F18F34" />
                <Text style={styles.sheetOptionText}>Subir imagen</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetOption} onPress={openFrameChooser}>
                <Ionicons name="film-outline" size={22} color="#F18F34" />
                <Text style={styles.sheetOptionText}>Elegir fotograma</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetOption} onPress={restoreAutoCover}>
                <Ionicons name="refresh-outline" size={22} color="#F18F34" />
                <Text style={styles.sheetOptionText}>Restaurar automática</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setIsCoverSheetVisible(false)}>
                <Text style={styles.sheetCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Selector de fotograma (5 opciones repartidas por el vídeo) */}
        {frameOptions && (
          <View style={styles.sheetBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setFrameOptions(null)}
            />
            <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>ELIGE UN FOTOGRAMA</Text>

              <FlatList
                data={frameOptions}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(f, i) => `${f.timeMs}-${i}`}
                contentContainerStyle={{ paddingVertical: 12 }}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => chooseFrame(item)} style={styles.frameOption}>
                    <Image source={{ uri: item.uri }} style={styles.frameImage} />
                  </TouchableOpacity>
                )}
              />

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setFrameOptions(null)}>
                <Text style={styles.sheetCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  cancelButton: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Outfit_400Regular',
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  postButton: {
    color: '#F18F34',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  typeSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  typeTab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
  },
  activeTypeTab: {
    backgroundColor: 'rgba(241, 143, 52, 0.2)',
  },
  typeTabText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
  activeTypeTabText: {
    color: '#F18F34',
  },
  scrollContent: {
    flex: 1,
  },
  mediaSection: {
    padding: 20,
    height: 150,
  },
  imageWrapper: {
    marginRight: 12,
    position: 'relative',
  },
  previewImage: {
    width: 110,
    height: 110,
    borderRadius: 12,
  },
  videoPreview: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPreviewText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Outfit_400Regular',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginTop: -8,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(241, 143, 52, 0.12)',
  },
  coverButtonText: {
    color: '#F18F34',
    fontSize: 14,
    marginLeft: 8,
    fontFamily: 'Outfit_600SemiBold',
  },
  frameOption: {
    marginRight: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  frameImage: {
    width: 80,
    height: 120,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  removeBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF3B30',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0F0F0F',
  },
  addButton: {
    width: 110,
    height: 110,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMediaText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Outfit_400Regular',
  },
  formSection: {
    padding: 20,
  },
  captionInput: {
    color: '#FFF',
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
    fontFamily: 'Outfit_400Regular',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 12,
  },
  input: {
    flex: 1,
    color: '#FFF',
    marginLeft: 10,
    fontSize: 14,
    fontFamily: 'Outfit_400Regular',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  sheetTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: 4,
    fontFamily: 'Outfit_600SemiBold',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetOptionText: {
    color: '#FFF',
    fontSize: 16,
    marginLeft: 14,
    fontFamily: 'Outfit_400Regular',
  },
  sheetCancel: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  sheetCancelText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
  },
});
