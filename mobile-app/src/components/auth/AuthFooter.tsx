import { View } from 'react-native';
import { authFooterTextStyle, authFooterWrap } from '../../styles/authScreenStyles';
import { SafeText } from '../ui/SafeText';
import { useTranslation } from '../../i18n';

export function AuthFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <View style={authFooterWrap}>
      <SafeText style={authFooterTextStyle}>
        {t('common.copyright', { year })}
      </SafeText>
    </View>
  );
}
