import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Icon } from 'react-native-paper';

interface TapToPayIconProps {
  size?: number;
  color?: string;
  /** Use wave.3.right.circle.fill for primary actions (Apple HIG). */
  filled?: boolean;
}

/** Last-resort fallback when SF Symbol native view is unavailable. */
function ContactlessFallback({ size = 24, color = '#000000' }: TapToPayIconProps) {
  return <Icon source="contactless-payment" size={size} color={color} />;
}

function hasIosSymbolModule(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return requireOptionalNativeModule('SymbolModule') != null;
  } catch {
    return false;
  }
}

type SymbolViewProps = {
  name: string;
  size?: number;
  type?: string;
  tintColor?: string;
  style?: { width: number; height: number };
  fallback?: React.ReactNode;
};

function loadSymbolView(): React.ComponentType<SymbolViewProps> | null {
  if (!hasIosSymbolModule()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-symbols').SymbolView as React.ComponentType<SymbolViewProps>;
  } catch {
    return null;
  }
}

/**
 * Apple-required SF Symbol for Tap to Pay on iPhone (Human Interface Guidelines).
 * wave.3.right.circle / wave.3.right.circle.fill — requires ExpoSymbols in the iOS binary.
 */
export default function TapToPayIcon({
  size = 24,
  color = '#000000',
  filled = false,
}: TapToPayIconProps) {
  const symbolName = filled ? 'wave.3.right.circle.fill' : 'wave.3.right.circle';

  if (Platform.OS === 'ios') {
    const SymbolView = loadSymbolView();
    if (SymbolView) {
      return (
        <SymbolView
          name={symbolName}
          size={size}
          type="monochrome"
          tintColor={color}
          style={{ width: size, height: size }}
          fallback={<ContactlessFallback size={size} color={color} />}
        />
      );
    }

    // Dev client missing ExpoSymbols — rebuild with npm run ios
    return (
      <View
        style={[
          styles.missingNative,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
          },
        ]}
      />
    );
  }

  return <ContactlessFallback size={size} color={color} />;
}

const styles = StyleSheet.create({
  missingNative: {
    borderWidth: 1.5,
    opacity: 0.45,
  },
});
