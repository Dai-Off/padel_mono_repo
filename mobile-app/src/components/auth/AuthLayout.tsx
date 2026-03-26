import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { theme } from '../../theme';

type AuthLayoutProps = {
  children: ReactNode;
  /** Cuando true, usa ScrollView para contenido largo (p. ej. registro) */
  scrollable?: boolean;
};

export function AuthLayout({ children, scrollable }: AuthLayoutProps) {
  const content = scrollable ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled
    >
      {content}
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
