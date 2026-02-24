import { ScrollView, StyleSheet } from 'react-native';
import { ScreenLayout } from '../components/layout/ScreenLayout';
import { XPCard } from '../components/home/XPCard';
import { MatchNowCard } from '../components/home/MatchNowCard';
import { ActionGrid } from '../components/home/ActionGrid';
import { TournamentCard } from '../components/home/TournamentCard';
import { SuggestedPlayers } from '../components/home/SuggestedPlayers';
import { MissionCard } from '../components/home/MissionCard';
import { ClubCard } from '../components/home/ClubCard';

export function InicioScreen() {
  return (
    <ScreenLayout>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <XPCard />
        <MatchNowCard />
        <ActionGrid />
        <TournamentCard />
        <SuggestedPlayers />
        <MissionCard />
        <ClubCard />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 24 },
});
