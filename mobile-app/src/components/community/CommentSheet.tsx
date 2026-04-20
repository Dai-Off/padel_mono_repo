import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  FlatList, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  Image,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommunityPost, CommunityComment, fetchComments, addComment } from '../../api/community';
import { formatTimeAgo } from '../../utils/timeAgo';
import { useAuth } from '../../contexts/AuthContext';

interface CommentSheetProps {
  isVisible: boolean;
  onClose: () => void;
  post: CommunityPost | null;
}

export const CommentSheet: React.FC<CommentSheetProps> = ({ isVisible, onClose, post }) => {
  const { session } = useAuth();
  const token = session?.access_token;
  
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isVisible && post && token) {
      loadComments();
    }
  }, [isVisible, post, token]);

  const loadComments = async () => {
    if (!post || !token) return;
    setLoading(true);
    const res = await fetchComments(token, post.id);
    if (res.ok) {
      setComments(res.comments);
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!post || !newComment.trim() || submitting || !token) return;
    
    setSubmitting(true);
    const res = await addComment(token, post.id, newComment.trim());
    if (res.ok && res.comment) {
      setComments([ ...comments, res.comment]);
      setNewComment('');
    }
    setSubmitting(false);
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.content}
        >
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>Comentarios</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator style={{ flex: 1 }} color="#F18F34" />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <Image 
                    source={{ uri: item.player.avatar_url || 'https://via.placeholder.com/150' }} 
                    style={styles.commentAvatar} 
                  />
                  <View style={styles.commentTextContainer}>
                    <Text style={styles.commentAuthor}>
                      {item.player.first_name} {item.player.last_name}
                      <Text style={styles.commentTime}>  {formatTimeAgo(item.created_at)}</Text>
                    </Text>
                    <Text style={styles.commentContent}>{item.content}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No hay comentarios aún. ¡Sé el primero!</Text>
                </View>
              }
            />
          )}

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Escribe un comentario..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={newComment}
              onChangeText={setNewComment}
              multiline
            />
            <TouchableOpacity 
              onPress={handleSend}
              disabled={!newComment.trim() || submitting}
            >
              <Text style={[
                styles.sendText,
                (!newComment.trim() || submitting) && styles.sendDisabled
              ]}>
                Publicar
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginBottom: 8,
  },
  title: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 12,
  },
  list: {
    padding: 16,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  commentTextContainer: {
    flex: 1,
  },
  commentAuthor: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
    marginBottom: 2,
  },
  commentTime: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Outfit_400Regular',
  },
  commentContent: {
    color: '#FFF',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Outfit_400Regular',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontFamily: 'Outfit_400Regular',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
    maxHeight: 100,
    marginRight: 12,
    fontFamily: 'Outfit_400Regular',
  },
  sendText: {
    color: '#F18F34',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: 'Outfit_700Bold',
  },
  sendDisabled: {
    opacity: 0.5,
  },
});
