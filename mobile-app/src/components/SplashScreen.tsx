import { StyleSheet, Text, View } from 'react-native';

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        <Text style={styles.logo}>W</Text>
      </View>
      <Text style={styles.brand}>WeMatch</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E31E24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    marginBottom: 12,
  },
  logo: {
    fontSize: 72,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -2,
  },
  brand: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: 1,
  },
});
