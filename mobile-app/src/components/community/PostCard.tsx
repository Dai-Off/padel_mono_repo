import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommunityPost, toggleLike, toggleBookmark } from '../../api/community';
import { PostImageCarousel } from './PostImageCarousel';
import { formatTimeAgo } from '../../utils/timeAgo';
import { useAuth } from '../../contexts/AuthContext';

interface PostCardProps {
  post: CommunityPost;
  onPressComments: (post: CommunityPost) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, onPressComments }) => {
  const { session } = useAuth();
  const token = session?.access_token;
  
  const [isLiked, setIsLiked] = useState(post.has_liked);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [isBookmarked, setIsBookmarked] = useState(post.has_bookmarked);

  const handleLike = async () => {
    if (!token) return;
    const originalLiked = isLiked;
    const originalCount = likesCount;
    
    // Optimistic UI
    setIsLiked(!originalLiked);
    setLikesCount(originalLiked ? originalCount - 1 : originalCount + 1);

    const res = await toggleLike(token, post.id);
    if (!res.ok) {
      setIsLiked(originalLiked);
      setLikesCount(originalCount);
    }
  };

  const handleBookmark = async () => {
    if (!token) return;
    const original = isBookmarked;
    setIsBookmarked(!original);
    
    const res = await toggleBookmark(token, post.id);
    if (!res.ok) {
      setIsBookmarked(original);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Image 
            source={{ uri: post.player.avatar_url || 'https://via.placeholder.com/150' }} 
            style={styles.avatar} 
          />
          <View style={styles.textInfo}>
            <Text style={styles.username}>
              {post.player.first_name} {post.player.last_name}
            </Text>
            {post.location && (
              <Text style={styles.location}>{post.location}</Text>
            )}
          </View>
        </View>
        <TouchableOpacity>
          <Ionicons name="ellipsis-horizontal" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <PostImageCarousel images={post.images} />

      {/* Actions */}
      <View style={styles.actions}>
        <View style={styles.leftActions}>
          <TouchableOpacity onPress={handleLike} style={styles.actionButton}>
            <Ionicons 
              name={isLiked ? "heart" : "heart-outline"} 
              size={26} 
              color={isLiked ? "#FF3B30" : "#FFF"} 
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onPressComments(post)} style={styles.actionButton}>
            <Ionicons name="chatbubble-outline" size={24} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="paper-plane-outline" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleBookmark}>
          <Ionicons 
            name={isBookmarked ? "bookmark" : "bookmark-outline"} 
            size={24} 
            color="#FFF" 
          />
        </TouchableOpacity>
      </View>

      {/* Details */}
      <View style={styles.details}>
        <Text style={styles.likesText}>
          {likesCount.toLocaleString()} {likesCount === 1 ? 'Me gusta' : 'Me gustas'}
        </Text>
        
        {post.caption && (
          <View style={styles.captionContainer}>
            <Text style={styles.captionText}>
              <Text style={styles.captionUser}>{post.player.first_name}: </Text>
              {post.caption}
            </Text>
          </View>
        )}

        {post.comments_count > 0 && (
          <TouchableOpacity onPress={() => onPressComments(post)}>
            <Text style={styles.viewComments}>
              Ver los {post.comments_count} comentarios
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.timeAgo}>
          {formatTimeAgo(post.created_at)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F0F0F',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  textInfo: {
    justifyContent: 'center',
  },
  username: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
  location: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontFamily: 'Outfit_400Regular',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    marginRight: 16,
  },
  details: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  likesText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    fontFamily: 'Outfit_600SemiBold',
  },
  captionContainer: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  captionText: {
    color: '#FFF',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Outfit_400Regular',
  },
  captionUser: {
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  viewComments: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    marginTop: 4,
    fontFamily: 'Outfit_400Regular',
  },
  timeAgo: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 11,
    marginTop: 6,
    textTransform: 'uppercase',
    fontFamily: 'Outfit_400Regular',
  },
});
