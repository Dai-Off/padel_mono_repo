import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

export function AuthFooter() {
  const year = new Date().getFullYear();
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>© {year} WeMatch. Todos los derechos reservados.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  text: {
    fontSize: theme.fontSize.xs,
    color: theme.auth.textSecondary,
  },
});
