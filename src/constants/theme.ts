import { MD3LightTheme, configureFonts } from 'react-native-paper';
import { COLORS } from './index';

const fontConfig = {
  displayLarge: { fontFamily: 'System', fontSize: 57 },
  displayMedium: { fontFamily: 'System', fontSize: 45 },
  displaySmall: { fontFamily: 'System', fontSize: 36 },
  headlineLarge: { fontFamily: 'System', fontSize: 32 },
  headlineMedium: { fontFamily: 'System', fontSize: 28 },
  headlineSmall: { fontFamily: 'System', fontSize: 24 },
  titleLarge: { fontFamily: 'System', fontSize: 22 },
  titleMedium: { fontFamily: 'System', fontSize: 16, fontWeight: '600' as const },
  titleSmall: { fontFamily: 'System', fontSize: 14, fontWeight: '600' as const },
  bodyLarge: { fontFamily: 'System', fontSize: 16 },
  bodyMedium: { fontFamily: 'System', fontSize: 14 },
  bodySmall: { fontFamily: 'System', fontSize: 12 },
  labelLarge: { fontFamily: 'System', fontSize: 14, fontWeight: '500' as const },
  labelMedium: { fontFamily: 'System', fontSize: 12, fontWeight: '500' as const },
  labelSmall: { fontFamily: 'System', fontSize: 11 },
};

export const theme = {
  ...MD3LightTheme,
  roundness: 8,
  colors: {
    ...MD3LightTheme.colors,

    // Brand primary — teal
    primary: COLORS.primary,
    onPrimary: COLORS.white,
    primaryContainer: COLORS.primaryLight,
    onPrimaryContainer: COLORS.white,

    // Secondary — neutral gray
    secondary: COLORS.secondary,
    onSecondary: COLORS.white,
    secondaryContainer: COLORS.accent,
    onSecondaryContainer: COLORS.secondaryForeground,

    // Tertiary — can reuse primary dark
    tertiary: COLORS.primaryDark,
    onTertiary: COLORS.white,

    // Error / destructive
    error: COLORS.error,
    onError: COLORS.white,
    errorContainer: '#FEE2E2',
    onErrorContainer: '#991B1B',

    // Background & surface
    background: COLORS.background,
    onBackground: COLORS.foreground,
    surface: COLORS.surface,
    onSurface: COLORS.foreground,
    surfaceVariant: COLORS.surfaceMuted,
    onSurfaceVariant: COLORS.textSecondary,
    surfaceDisabled: COLORS.disabled,

    // Outline
    outline: COLORS.border,
    outlineVariant: COLORS.border,

    // Elevation overlay
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: COLORS.surface,
      level1: COLORS.surface,
      level2: COLORS.surfaceMuted,
      level3: COLORS.surfaceMuted,
      level4: COLORS.accent,
      level5: COLORS.accent,
    },
  },
  fonts: configureFonts({ config: fontConfig }),
};
