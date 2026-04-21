import React, { useState } from 'react';
import { View, FlatList, Image, Dimensions, StyleSheet, Text } from 'react-native';
import { CommunityPostImage } from '../../api/community';

const { width } = Dimensions.get('window');

interface PostImageCarouselProps {
  images: CommunityPostImage[];
}

export const PostImageCarousel: React.FC<PostImageCarouselProps> = ({ images }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const onScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    setActiveIndex(Math.round(index));
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Image 
            source={{ uri: item.image_url }} 
            style={styles.image} 
            resizeMode="cover"
          />
        )}
      />
      
      {images.length > 1 && (
        <View style={styles.pagination}>
          <Text style={styles.paginationText}>
            {activeIndex + 1}/{images.length}
          </Text>
        </View>
      )}

      {images.length > 1 && (
        <View style={styles.dotsContainer}>
          {images.map((_, i) => (
            <View 
              key={i} 
              style={[
                styles.dot, 
                i === activeIndex && styles.activeDot
              ]} 
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: width,
    height: width, // Square aspect ratio like Instagram
    backgroundColor: '#1A1A1A',
  },
  image: {
    width: width,
    height: width,
  },
  pagination: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  paginationText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  dotsContainer: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: -20, // To sit outside the image if wanted, or align within
    alignSelf: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 3,
  },
  activeDot: {
    backgroundColor: '#F18F34',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
