import { Alert } from 'react-native';
import { ClubMultiSelectBody } from '../../components/clubs/ClubMultiSelectPicker';
import { useFavoriteClubsSelection } from '../../hooks/useFavoriteClubsSelection';

type MisClubesFavoritosActividadScreenProps = {
  onBack: () => void;
};

export function MisClubesFavoritosActividadScreen({ onBack }: MisClubesFavoritosActividadScreenProps) {
  const {
    selectedIds,
    setSelectedIds,
    clubCatalog,
    catalogLoading,
    catalogError,
    reload,
    saving,
    persistSelection,
  } = useFavoriteClubsSelection();

  const handleDone = async () => {
    const res = await persistSelection(selectedIds);
    if (!res.ok) {
      Alert.alert('Clubes favoritos', res.error);
      return;
    }
    onBack();
  };

  return (
    <ClubMultiSelectBody
      selectedIds={selectedIds}
      onChange={setSelectedIds}
      onClose={onBack}
      onDone={() => void handleDone()}
      title="Clubes favoritos"
      subtitle="Se usan también en matchmaking competitivo"
      clubs={clubCatalog}
      loading={catalogLoading}
      error={catalogError}
      onRetry={reload}
      doneLabel={saving ? 'Guardando…' : 'Guardar'}
      doneDisabled={saving}
    />
  );
}
