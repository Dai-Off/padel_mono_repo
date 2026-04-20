import React, { useState } from 'react';
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
import { createPost } from '../../api/community';
import { useAuth } from '../../contexts/AuthContext';

const { width } = Dimensions.get('window');

interface CreatePostModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type PostType = 'post' | 'story' | 'reel';

export const CreatePostModal: React.FC<CreatePostModalProps> = ({ isVisible, onClose, onSuccess }) => {
  const { session } = useAuth();
  const token = session?.access_token;

  const [selectedType, setSelectedType] = useState<PostType>('post');
  const [selectedImages, setSelectedImages] = useState<{ uri: string; name: string; type: string }[]>([]);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería para publicar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newImages = result.assets.map(asset => ({
        uri: asset.uri,
        name: asset.fileName || `image-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      }));
      setSelectedImages([...selectedImages, ...newImages]);
    }
  };

  const handlePost = async () => {
    if (selectedImages.length === 0) {
      Alert.alert('Error', 'Selecciona al menos una imagen');
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
    setSelectedType('post');
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
            style={styles.header}
          >
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelButton}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Nueva publicación</Text>
            <TouchableOpacity onPress={handlePost} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#F18F34" />
              ) : (
                <Text style={styles.postButton}>Compartir</Text>
              )}
            </TouchableOpacity>
          </LinearGradient>

          <View style={styles.typeSelector}>
            {(['post', 'story', 'reel'] as PostType[]).map((type) => (
              <TouchableOpacity 
                key={type}
                style={[styles.typeTab, selectedType === type && styles.activeTypeTab]}
                onPress={() => setSelectedType(type)}
              >
                <Text style={[styles.typeTabText, selectedType === type && styles.activeTypeTabText]}>
                  {type === 'post' ? 'Imagen' : type === 'story' ? 'Historia' : 'Reel'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.scrollContent}>
            <View style={styles.mediaSection}>
              <FlatList
                data={[...selectedImages, { id: 'add' }]}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, index) => (item as any).uri || 'add-btn'}
                renderItem={({ item, index }) => (
                  (item as any).uri ? (
                    <View style={styles.imageWrapper}>
                      <Image source={{ uri: (item as any).uri }} style={styles.previewImage} />
                      <TouchableOpacity 
                        style={styles.removeBadge} 
                        onPress={() => removeImage(index)}
                      >
                        <Ionicons name="close" size={14} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addButton} onPress={pickImage}>
                      <Ionicons name="camera" size={30} color="rgba(255,255,255,0.3)" />
                      <Text style={styles.addMediaText}>Galería</Text>
                    </TouchableOpacity>
                  )
                )}
              />
            </View>

            <View style={styles.formSection}>
              <TextInput
                style={styles.captionInput}
                placeholder="Escribe un pie de foto..."
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
    paddingTop: 20,
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
});
