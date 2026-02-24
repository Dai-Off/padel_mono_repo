import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppBackground } from './AppBackground';

type ScreenLayoutProps = {
  children: ReactNode;
  withBottomNav?: boolean;
  withHeader?: boolean;
};

export function ScreenLayout({
  children,
  withBottomNav = true,
  withHeader = true,
}: ScreenLayoutProps) {
  return (
    <View
      style={[
        styles.container,
        withHeader && styles.withHeader,
        withBottomNav && styles.withBottomNav,
      ]}
    >
      <LinearGradient
        colors={['#000', '#18181b', '#000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <AppBackground />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  withHeader: {
    paddingTop: 64,
  },
  withBottomNav: {
    paddingBottom: 80,
  },
  content: {
    flex: 1,
  },
});
