import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text,
  TouchableOpacity,
  StyleSheet, 
  FlatList, 
  ActivityIndicator, 
  RefreshControl,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { CommunityTabs, CommunityTab } from '../components/community/CommunityTabs';
import { StoriesRow } from '../components/community/StoriesRow';
import { PostCard } from '../components/community/PostCard';
import { CommentSheet } from '../components/community/CommentSheet';
import { CreatePostModal } from '../components/community/CreatePostModal';
import { 
  fetchFeed, 
  fetchStories, 
  CommunityPost, 
  StoryGroup 
} from '../api/community';
import { StoryViewer } from '../components/community/StoryViewer';

interface CommunityScreenProps {
  onBack: () => void;
}

export const CommunityScreen: React.FC<CommunityScreenProps> = ({ onBack }) => {
  const { session } = useAuth();
  const token = session?.access_token;
  
  const [activeTab, setActiveTab] = useState<CommunityTab>('feed');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedPostForComments, setSelectedPostForComments] = useState<CommunityPost | null>(null);
  const [isCommentsVisible, setIsCommentsVisible] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [selectedStoryGroup, setSelectedStoryGroup] = useState<StoryGroup | null>(null);
  const [isStoryViewerVisible, setIsStoryViewerVisible] = useState(false);

  const loadData = useCallback(async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    const [feedRes, storiesRes] = await Promise.all([
      fetchFeed(token),
      fetchStories(token)
    ]);

    if (feedRes.ok) {
      setPosts(feedRes.posts);
      setNextCursor(feedRes.next_cursor);
    }

    if (storiesRes.ok) {
      setStoryGroups(storiesRes.groups);
    }

    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [loadData, token]);

  const loadMore = async () => {
    if (loadingMore || !nextCursor || !token) return;

    setLoadingMore(true);
    const res = await fetchFeed(token, nextCursor);
    if (res.ok) {
      setPosts([...posts, ...res.posts]);
      setNextCursor(res.next_cursor);
    }
    setLoadingMore(false);
  };

  const handleOpenComments = (post: CommunityPost) => {
    setSelectedPostForComments(post);
    setIsCommentsVisible(true);
  };

  const handleStoryPress = (group: StoryGroup) => {
    setSelectedStoryGroup(group);
    setIsStoryViewerVisible(true);
  };

  const renderHeader = () => (
    <View>
      <StoriesRow 
        groups={storyGroups} 
        onPressStory={handleStoryPress}
        onPressAdd={() => setIsCreateModalVisible(true)}
      />
      <CommunityTabs 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Comunidad</Text>
        <View style={{ width: 24 }} />
      </View>
      
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F18F34" />
        </View>
      ) : (
        <FlatList
          data={activeTab === 'feed' ? posts : []} // Placeholder for other tabs
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PostCard 
              post={item} 
              onPressComments={handleOpenComments} 
            />
          )}
          ListHeaderComponent={renderHeader}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={() => loadData(true)} 
              tintColor="#F18F34"
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ padding: 20 }} color="#F18F34" />
            ) : null
          }
        />
      )}

      <CommentSheet
        isVisible={isCommentsVisible}
        onClose={() => setIsCommentsVisible(false)}
        post={selectedPostForComments}
      />

      <CreatePostModal
        isVisible={isCreateModalVisible}
        onClose={() => setIsCreateModalVisible(false)}
        onSuccess={() => loadData(true)}
      />

      <StoryViewer 
        isVisible={isStoryViewerVisible}
        onClose={() => setIsStoryViewerVisible(false)}
        group={selectedStoryGroup}
      />

      {/* Floating Action Button */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => setIsCreateModalVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  backBtn: {
    padding: 4,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: '#F18F34',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
