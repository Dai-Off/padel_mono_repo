import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTuActividadData } from '../contexts/TuActividadDataContext';
import { MenuScreenHeader } from '../components/menuScreen/MenuScreenHeader';
import { MenuScreenRow } from '../components/menuScreen/MenuScreenRow';
import { TuActividadMenuSkeleton } from '../components/tuActividad/TuActividadMenuSkeleton';
import { theme } from '../theme';
import { useTranslation } from '../i18n';

export type TuActividadDestination =
  | 'partidos'
  | 'clases'
  | 'competiciones'
  | 'grupos'
  | 'clubes-favoritos';

type TuActividadScreenProps = {
  onBack: () => void;
  onNavigate: (destination: TuActividadDestination) => void;
};

type ActivityRow = {
  id: TuActividadDestination;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof import('@expo/vector-icons').Ionicons>['name'];
  iconColors: [string, string];
  iconColor: string;
};

function formatCountSubtitle(
  count: number,
  singularKey: string,
  pluralKey: string,
  emptyKey: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (count === 0) return t(emptyKey);
  return count === 1 ? t(singularKey) : t(pluralKey, { count });
}

export function TuActividadScreen({ onBack, onNavigate }: TuActividadScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { loading, counts } = useTuActividadData();

  if (loading) {
    return <TuActividadMenuSkeleton title={t('activity.menuTitle')} onBack={onBack} />;
  }

  const rows: ActivityRow[] = [
    {
      id: 'partidos',
      title: t('activity.rowMatches'),
      subtitle:
        counts.pastPartidos > 0
          ? formatCountSubtitle(
              counts.pastPartidos,
              'activity.rowMatchesPlayedOne',
              'activity.rowMatchesPlayedMany',
              'activity.rowNoMatchesPlayed',
              t,
            )
          : t('activity.rowMatchesHistory'),
      icon: 'trophy-outline',
      iconColors: [theme.sidebar.iconVariants.orange.from, theme.sidebar.iconVariants.orange.to],
      iconColor: theme.sidebar.iconVariants.orange.color,
    },
    {
      id: 'clases',
      title: t('activity.rowClasses'),
      subtitle: formatCountSubtitle(
        counts.enrollments,
        'activity.rowEnrollmentOne',
        'activity.rowEnrollmentMany',
        'activity.rowNoEnrollmentsCount',
        t,
      ),
      icon: 'school-outline',
      iconColors: [theme.sidebar.iconVariants.purple.from, theme.sidebar.iconVariants.purple.to],
      iconColor: theme.sidebar.iconVariants.purple.color,
    },
    {
      id: 'competiciones',
      title: t('activity.rowCompetitions'),
      subtitle:
        counts.tournaments > 0
          ? formatCountSubtitle(
              counts.tournaments,
              'activity.rowEnrollmentOne',
              'activity.rowEnrollmentMany',
              'activity.rowNoEnrollmentsCount',
              t,
            )
          : t('activity.rowCompetitionsSub'),
      icon: 'shield-outline',
      iconColors: [theme.sidebar.iconVariants.sky.from, theme.sidebar.iconVariants.sky.to],
      iconColor: theme.sidebar.iconVariants.sky.color,
    },
    {
      id: 'grupos',
      title: t('activity.rowGroups'),
      subtitle: t('activity.rowGroupsSub'),
      icon: 'people-outline',
      iconColors: ['rgba(16,185,129,0.2)', 'rgba(5,150,105,0.1)'],
      iconColor: '#34d399',
    },
    {
      id: 'clubes-favoritos',
      title: t('activity.rowFavoriteClubs'),
      subtitle: formatCountSubtitle(
        counts.favoriteClubs,
        'activity.rowClubSavedOne',
        'activity.rowClubSavedMany',
        'activity.rowNoClubsSaved',
        t,
      ),
      icon: 'home-outline',
      iconColors: ['rgba(245,158,11,0.2)', 'rgba(202,138,4,0.1)'],
      iconColor: '#fbbf24',
    },
  ];

  return (
    <View style={styles.container}>
      <MenuScreenHeader title={t('activity.menuTitle')} onBack={onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + (insets.bottom ?? 0) }]}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((row) => (
          <MenuScreenRow
            key={row.id}
            title={row.title}
            subtitle={row.subtitle}
            icon={row.icon}
            iconColors={row.iconColors}
            iconColor={row.iconColor}
            onPress={() => onNavigate(row.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },
});
