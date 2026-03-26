import { StyleSheet, View as RNView } from 'react-native';
import { AuthBrand } from './auth';

/** Workaround: React 19 + RN types incompatibility ("View cannot be used as a JSX component") */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const View = RNView as any;

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <AuthBrand variant="splash" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
