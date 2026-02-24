import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type SuggestedPlayer = {
  id: string;
  name: string;
  imageUrl: string;
  tag?: string;
};

const SUGGESTED: SuggestedPlayer[] = [
  {
    id: '1',
    name: 'Jeronimo De Mesa',
    imageUrl: 'https://images.unsplash.com/photo-1701503098048-671c0a40d458?w=400&q=80',
    tag: 'Contacto de tu agenda',
  },
  {
    id: '2',
    name: 'Carlos Jimenez',
    imageUrl: 'https://images.unsplash.com/photo-1715333150757-9cd259d723c5?w=400&q=80',
    tag: 'Contacto de tu agenda',
  },
  {
    id: '3',
    name: 'Andrea Alvarez',
    imageUrl: 'https://images.unsplash.com/photo-1677368738958-d402319331dc?w=400&q=80',
    tag: 'Contacto de tu agenda',
  },
  {
    id: '4',
    name: 'Cristina Gomez',
    imageUrl: 'https://images.unsplash.com/photo-1649589244330-09ca58e4fa64?w=400&q=80',
    tag: 'Contacto de tu agenda',
  },
];

const CARD_WIDTH = 180;

function PlayerCard({ item }: { item: SuggestedPlayer }) {
  return (
    <View style={styles.card}>
      <Pressable style={styles.dismiss} onPress={() => {}}>
        <Ionicons name="close" size={16} color="#22d3ee" />
      </Pressable>
      <Image source={{ uri: item.imageUrl }} style={styles.img} resizeMode="cover" />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.tag}>{item.tag}</Text>
        <Pressable style={styles.btn}>
          <Text style={styles.btnText}>Seguir</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SuggestedPlayers() {
  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Jugadores Elite</Text>
          <Text style={styles.subtitle}>Cerca de tu zona</Text>
        </View>
        <Pressable style={styles.verTodos}>
          <Text style={styles.verTodosText}>Ver todos</Text>
        </Pressable>
      </View>
      <FlatList
        data={SUGGESTED}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PlayerCard item={item} />}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        snapToInterval={CARD_WIDTH + 12}
        decelerationRate="fast"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
  },
  subtitle: { fontSize: 14, color: '#22d3ee', marginTop: 2 },
  verTodos: {
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.5)',
  },
  verTodosText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#67e8f9',
  },
  list: {
    paddingHorizontal: 20,
    paddingRight: 32,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    backgroundColor: '#18181b',
    overflow: 'hidden',
  },
  dismiss: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: '100%',
    height: 192,
    backgroundColor: '#27272a',
  },
  info: { padding: 16 },
  name: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 4,
  },
  tag: {
    fontSize: 12,
    color: '#22d3ee',
    fontWeight: '600',
    marginBottom: 16,
  },
  btn: {
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(34, 211, 238, 0.5)',
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  btnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
    textTransform: 'uppercase',
  },
});
