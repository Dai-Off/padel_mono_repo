import { AppFilterBar } from '../filters/AppFilterBar';

type ClubFilterBarProps = {
  sportLabel: string;
  cerramientoLabel: string;
  sportActive: boolean;
  cerramientoActive: boolean;
  onSportPress: () => void;
  onCerramientoPress: () => void;
};

export function ClubFilterBar({
  sportLabel,
  cerramientoLabel,
  sportActive,
  cerramientoActive,
  onSportPress,
  onCerramientoPress,
}: ClubFilterBarProps) {
  return (
    <AppFilterBar
      showAdvancedButton={false}
      chips={[
        {
          id: 'sport',
          label: sportLabel,
          active: sportActive,
          onPress: onSportPress,
        },
        {
          id: 'cerramiento',
          label: cerramientoLabel,
          active: cerramientoActive,
          onPress: onCerramientoPress,
        },
      ]}
    />
  );
}
