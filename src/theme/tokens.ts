/**
 * Thoq design tokens.
 *
 * Paper and ink, one accent. The accent (roasted clay) is reserved for
 * the active state, scores worth noticing and links — never decoration.
 */

export type Palette = {
  paper: string; // app background
  raised: string; // inputs, pressed rows
  ink: string; // primary text, primary button fill
  ink2: string; // secondary text
  ink3: string; // tertiary text, metadata
  rule: string; // hairlines
  accent: string; // the one accent
  onInk: string; // text on ink-filled surfaces
};

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    paper: '#F5F2EC',
    raised: '#ECE7DD',
    ink: '#1A1814',
    ink2: '#57524A',
    ink3: '#8A8478',
    rule: '#DAD4C8',
    accent: '#A8401B',
    onInk: '#F5F2EC',
  },
  dark: {
    paper: '#151411',
    raised: '#211F1B',
    ink: '#ECE7DD',
    ink2: '#AAA396',
    ink3: '#777165',
    rule: '#2E2B25',
    accent: '#E0784A',
    onInk: '#151411',
  },
};

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Horizontal page gutter. Everything aligns to this edge. */
export const GUTTER = 20;

export const radius = 2;

/** Text inputs draw their own ink underline; drop the browser focus ring that would box it in on web. */
export const inputReset = { outlineWidth: 0 } as const;

export const font = {
  display: 'Newsreader_500Medium',
  displayItalic: 'Newsreader_400Regular_Italic',
  body: 'IBMPlexSans_400Regular',
  bodyMedium: 'IBMPlexSans_500Medium',
  bodySemi: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const type = {
  display: { fontFamily: font.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.6 },
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.3 },
  heading: { fontFamily: font.display, fontSize: 21, lineHeight: 26, letterSpacing: -0.1 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: font.bodySemi, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' as const },
  meta: { fontFamily: font.mono, fontSize: 12, lineHeight: 16 },
  numeral: { fontFamily: font.monoMedium, fontSize: 15, lineHeight: 20 },
} as const;

export type TypeVariant = keyof typeof type;
