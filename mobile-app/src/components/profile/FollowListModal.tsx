import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { AvatarWithFrame } from './AvatarWithFrame';
import { fetchFollowers, fetchFollowing, toggleFollow, FollowerPlayer } from '../../api/playerFollows';

interface FollowListModalProps {
  isVisible: boolean;
  onClose: () => void;
  playerId: string;
  token: string | null | undefined;
  initialTab?: 'followers' | 'following';
  currentUserId?: string | null;
  onOpenPlayer?: (playerId: string) => void;
}

export const FollowListModal: React.FC<FollowListModalProps> = ({
  isVisible,
  onClose,
  playerId,
  token,
  initialTab = 'followers',
  currentUserId,
  onOpenPlayer,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialTab);
  const [list, setList] = useState<FollowerPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setActiveTab(initialTab);
      loadData(false, initialTab);
    }
  }, [isVisible, initialTab, playerId]);

  const loadData = useCallback(
    async (isRefresh = false, tab = activeTab) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      if (tab === 'followers') {
        const res = await fetchFollowers(token, playerId);
        if (res.ok) {
          setList(res.followers);
          setNextCursor(res.next_cursor);
        }
      } else {
        const res = await fetchFollowing(token, playerId);
        if (res.ok) {
          setList(res.following);
          setNextCursor(res.next_cursor);
        }
      }

      setLoading(false);
      setRefreshing(false);
    },
    [token, playerId, activeTab]
  );

  const handleTabChange = (tab: 'followers' | 'following') => {
    setActiveTab(tab);
    loadData(false, tab);
  };

  const loadMore = async () => {
    if (loadingMore || !nextCursor) return;
    setLoadingMore(true);

    if (activeTab === 'followers') {
      const res = await fetchFollowers(token, playerId, nextCursor);
      if (res.ok) {
        setList(prev => [...prev, ...res.followers]);
        setNextCursor(res.next_cursor);
      }
    } else {
      const res = await fetchFollowing(token, playerId, nextCursor);
      if (res.ok) {
        setList(prev => [...prev, ...res.following]);
        setNextCursor(res.next_cursor);
      }
    }
    setLoadingMore(false);
  };

  const handleFollowAction = async (item: FollowerPlayer) => {
    if (!token || !currentUserId) return;
    if (item.id === currentUserId) return;

    // UI optimista
    const prevStatus = item.is_following;
    setList(prev =>
      prev.map(p => (p.id === item.id ? { ...p, is_following: !prevStatus } : p))
    );

    const res = await toggleFollow(token, item.id);
    if (!res.ok) {
      // Revertir si hay error
      setList(prev =>
        prev.map(p => (p.id === item.id ? { ...p, is_following: prevStatus } : p))
      );
    }
  };

  const renderItem = ({ item }: { item: FollowerPlayer }) => {
    const isSelf = item.id === currentUserId;
    const displayName = `${item.first_name ?? ''} ${item.last_name ?? ''}`.trim() || t('profile.playerFallback');

    return (
      <View style={styles.row}>
        <Pressable
          style={styles.playerInfo}
          onPress={() => {
            onClose();
            onOpenPlayer?.(item.id);
          }}
        >
          <AvatarWithFrame
            avatarUrl={item.avatar_url}
            initials={(item.first_name?.[0] ?? item.username?.[0] ?? '?').toUpperCase()}
            size={40}
            frame={item.frame}
          />
          <View style={styles.names}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            {item.username ? (
              <Text style={styles.username} numberOfLines={1}>
                @{item.username}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {!isSelf && token ? (
          <TouchableOpacity
            style={[
              styles.followButton,
              item.is_following ? styles.followingButton : styles.followButtonActive,
            ]}
            onPress={() => handleFollowAction(item)}
          >
            <Text
              style={[
                styles.followButtonText,
                item.is_following ? styles.followingButtonText : styles.followButtonActiveText,
              ]}
            >
              {item.is_following ? t('profile.unfollowBtn') : t('profile.followBtn')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ width: 24 }} />
            <Text style={styles.headerTitle}>
              {activeTab === 'followers' ? t('profile.followersTitle') : t('profile.followingTitle')}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'followers' && styles.activeTab]}
              onPress={() => handleTabChange('followers')}
            >
              <Text style={[styles.tabText, activeTab === 'followers' && styles.activeTabText]}>
                {t('profile.followersTitle')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'following' && styles.activeTab]}
              onPress={() => handleTabChange('following')}
            >
              <Text style={[styles.tabText, activeTab === 'following' && styles.activeTabText]}>
                {t('profile.followingTitle')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#F18F34" />
            </View>
          ) : (
            <FlatList
              data={list}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              onEndReached={loadMore}
              onEndReachedThreshold={0.3}
              ListEmptyComponent={() => (
                <View style={styles.emptyContainer}>
                  <Ionicons
                    name="people-outline"
                    size={48}
                    color="rgba(255, 255, 255, 0.15)"
                  />
                  <Text style={styles.emptyText}>
                    {activeTab === 'followers' ? t('profile.followersEmpty') : t('profile.followingEmpty')}
                  </Text>
                </View>
              )}
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator style={{ padding: 20 }} color="#F18F34" />
                ) : null
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#161616',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '75%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  closeBtn: {
    padding: 4,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#F18F34',
  },
  tabText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
  activeTabText: {
    color: '#F18F34',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  names: {
    marginLeft: 12,
    flex: 1,
  },
  name: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
  username: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontFamily: 'Outfit_400Regular',
    marginTop: 2,
  },
  followButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  followButtonActive: {
    backgroundColor: '#F18F34',
  },
  followingButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  followButtonText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  followButtonActiveText: {
    color: '#FFF',
  },
  followingButtonText: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
    fontFamily: 'Outfit_400Regular',
    marginTop: 12,
  },
});
