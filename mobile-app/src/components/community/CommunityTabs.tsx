import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type CommunityTab = 'feed' | 'reels' | 'noticias';

interface CommunityTabsProps {
  activeTab: CommunityTab;
  onTabChange: (tab: CommunityTab) => void;
}

export const CommunityTabs: React.FC<CommunityTabsProps> = ({ activeTab, onTabChange }) => {
  const tabs: { id: CommunityTab; label: string }[] = [
    { id: 'feed', label: 'Feed' },
    { id: 'reels', label: 'Reels' },
    { id: 'noticias', label: 'Noticias' },
  ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.id}
          onPress={() => onTabChange(tab.id)}
          style={styles.tab}
        >
          <Text style={[
            styles.tabText,
            activeTab === tab.id && styles.activeTabText
          ]}>
            {tab.label}
          </Text>
          {activeTab === tab.id && <View style={styles.indicator} />}
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    backgroundColor: '#0F0F0F',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  tab: {
    paddingVertical: 12,
    marginRight: 24,
    alignItems: 'center',
    position: 'relative',
  },
  tabText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 2,
    backgroundColor: '#F18F34',
    borderRadius: 1,
  },
});
