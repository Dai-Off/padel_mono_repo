import { AppFilterBar } from '../filters/AppFilterBar';

type PartidosFilterBarProps = {
  sportLabel: string;
  clubsLabel: string;
  whenLabel: string;
  sportActive: boolean;
  clubsActive: boolean;
  whenActive: boolean;
  advancedCount: number;
  onFiltersPress: () => void;
  onSportPress: () => void;
  onClubsPress: () => void;
  onWhenPress: () => void;
};

export function PartidosFilterBar(props: PartidosFilterBarProps) {
  return (
    <AppFilterBar
      advancedCount={props.advancedCount}
      onAdvancedPress={props.onFiltersPress}
      chips={[
        {
          id: 'sport',
          label: props.sportLabel,
          active: props.sportActive,
          onPress: props.onSportPress,
        },
        {
          id: 'clubs',
          label: props.clubsLabel,
          active: props.clubsActive,
          onPress: props.onClubsPress,
        },
        {
          id: 'when',
          label: props.whenLabel,
          active: props.whenActive,
          onPress: props.onWhenPress,
        },
      ]}
    />
  );
}
