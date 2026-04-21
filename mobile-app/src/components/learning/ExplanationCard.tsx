import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  explanation: string;
};

export function ExplanationCard({ explanation }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <Ionicons name="book-outline" size={14} color="#F18F34" />
      </View>
      <Text style={styles.text}>{explanation}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(241,143,52,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 18,
  },
});
