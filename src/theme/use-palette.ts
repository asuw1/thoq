import { useColorScheme } from 'react-native';

import { palettes, type Palette } from './tokens';

export function usePalette(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? palettes.dark : palettes.light;
}
