import { ScrollView, type ScrollViewProps } from 'react-native';

/**
 * ScrollView que en Android no recorta hijos por error (removeClippedSubviews).
 * Usar en pantallas con texto o filas flex donde Android cortaba contenido.
 */
export function SafeScrollView(props: ScrollViewProps) {
  return <ScrollView {...props} removeClippedSubviews={false} />;
}
