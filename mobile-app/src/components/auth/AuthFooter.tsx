import { View } from 'react-native';
import { authFooterTextStyle, authFooterWrap } from '../../styles/authScreenStyles';
import { SafeText } from '../ui/SafeText';

export function AuthFooter() {
  const year = new Date().getFullYear();
  return (
    <View style={authFooterWrap}>
      <SafeText style={authFooterTextStyle}>
        © {year} WeMatch. Todos los derechos reservados.
      </SafeText>
    </View>
  );
}
