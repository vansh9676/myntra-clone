import React from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { RecentlyViewedItem } from '../utils/recentlyViewed';

interface Props {
  items: RecentlyViewedItem[];
}

const RecentlyViewedList: React.FC<Props> = ({ items }) => {
  if (!items.length) return null;

  const renderItem = ({ item }: { item: RecentlyViewedItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/product/${item.productId}`)}
    >
      {item.productSnapshot?.image ? (
        <Image source={{ uri: item.productSnapshot.image }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]} />
      )}
      <Text style={styles.name} numberOfLines={1}>
        {item.productSnapshot?.name || 'Product'}
      </Text>
      <Text style={styles.price}>₹{item.productSnapshot?.price || '0'}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RECENTLY VIEWED</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={(item) => item.productId}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 16,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 16,
  },
  card: {
    width: 120,
    marginRight: 12,
  },
  image: {
    width: 120,
    height: 160,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    backgroundColor: '#ccc',
  },
  name: {
    fontSize: 14,
    marginTop: 4,
  },
  price: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff3e6c',
  },
});

export default RecentlyViewedList;