// Declaración de tipos para imports de SVG vía react-native-svg-transformer.
// Permite: import Player from './player.svg' → componente React.
declare module '*.svg' {
  import type { SvgProps } from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}
