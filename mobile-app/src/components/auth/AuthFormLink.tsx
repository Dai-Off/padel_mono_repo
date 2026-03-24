import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

type AuthFormLinkProps = {
  prompt: string;
  action: string;
  onPress: () => void;
  disabled?: boolean;
};

export function AuthFormLink({ prompt, action, onPress, disabled }: AuthFormLinkProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.prompt}>{prompt}{' '}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <Text style={styles.linkText}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  prompt: {
    fontSize: theme.fontSize.sm,
    color: theme.auth.textSecondary,
  },
  link: {
    paddingVertical: 4,
  },
  linkText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.auth.accent,
  },
  pressed: {
    opacity: 0.9,
  },
});
