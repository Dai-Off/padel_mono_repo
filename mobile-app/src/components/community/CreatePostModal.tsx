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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPost } from '../../api/community';
import { useAuth } from '../../contexts/AuthContext';

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
  const [selectedImages, setSelectedImages] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMediaSheetVisible, setIsMediaSheetVisible] = useState(false);

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, typesKey]);

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
    }
  };

  const handleAddMedia = () => setIsMediaSheetVisible(true);

  const pickFrom = (source: 'camera' | 'gallery') => {
    setIsMediaSheetVisible(false);
    if (source === 'camera') takePhoto();
    else openGallery();
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
    const res = await createPost(token, {
      files: selectedImages,
      caption,
      location,
      post_type: selectedType,
    });

    setLoading(false);
    if (res.ok) {
      onSuccess();
      resetState();
      onClose();
    } else {
      Alert.alert('Error', res.error || 'No se pudo crear la publicación');
    }
  };

  const resetState = () => {
    setSelectedImages([]);
    setCaption('');
    setLocation('');
    setSelectedType(allowedTypes[0]);
  };

  const removeImage = (index: number) => {
    const updated = [...selectedImages];
    updated.splice(index, 1);
    setSelectedImages(updated);
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
                        <View style={[styles.previewImage, styles.videoPreview]}>
                          <Ionicons name="play-circle" size={36} color="#FFF" />
                          <Text style={styles.videoPreviewText}>Vídeo</Text>
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
