import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';

type ProductFavoriteButtonProps = {
  productId: string;
  isFavorite: boolean;
  onToggle: (productId: string) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function ProductFavoriteButton({
  productId,
  isFavorite,
  onToggle,
  size = 14,
  style,
}: ProductFavoriteButtonProps) {
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={() => onToggle(productId)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? t('common.favorite') : t('common.addToFavorites')}
      style={style}
    >
      <Ionicons
        name={isFavorite ? 'heart' : 'heart-outline'}
        size={size}
        color={isFavorite ? '#f43f5e' : 'rgba(255,255,255,0.65)'}
      />
    </Pressable>
  );
}
