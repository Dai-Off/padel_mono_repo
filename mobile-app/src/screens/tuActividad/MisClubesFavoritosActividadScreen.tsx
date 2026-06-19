import { Alert } from 'react-native';
import { ClubMultiSelectBody } from '../../components/clubs/ClubMultiSelectPicker';
import { useFavoriteClubsSelection } from '../../hooks/useFavoriteClubsSelection';
import { useTranslation } from '../../i18n';

type MisClubesFavoritosActividadScreenProps = {
  onBack: () => void;
};

export function MisClubesFavoritosActividadScreen({ onBack }: MisClubesFavoritosActividadScreenProps) {
  const { t } = useTranslation();
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
      Alert.alert(t('alerts.favoriteClubs.title'), res.error);
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
      title={t('activity.rowFavoriteClubs')}
      subtitle={t('activity.favoriteClubsSubtitle')}
      clubs={clubCatalog}
      loading={catalogLoading}
      error={catalogError}
      onRetry={reload}
      doneLabel={saving ? t('activity.favoriteClubsSaving') : t('activity.favoriteClubsSave')}
      doneDisabled={saving}
    />
  );
}
