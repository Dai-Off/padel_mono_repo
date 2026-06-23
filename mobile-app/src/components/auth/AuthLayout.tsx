import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAvoidingView,
} from 'react-native-keyboard-controller';
import { theme } from '../../theme';

type AuthLayoutProps = {
  children: ReactNode;
  /** Cuando true, usa ScrollView para contenido largo (p. ej. registro) */
  scrollable?: boolean;
};

export function AuthLayout({ children, scrollable }: AuthLayoutProps) {
  if (scrollable) {
    return (
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
      >
        {children}
      </KeyboardAwareScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <View style={styles.content}>{children}</View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.auth.bg,
  },
  content: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    paddingHorizontal: theme.spacing.lg,
  },
  scroll: {
    flex: 1,
    backgroundColor: theme.auth.bg,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
  },
});
