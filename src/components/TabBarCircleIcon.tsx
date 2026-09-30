import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Icon } from 'react-native-paper';
import { COLORS } from '../constants';

type TabBarCircleIconProps = {
  source: string;
  focused: boolean;
  color: string;
};

/** Circular icon chip for bottom tabs — filled when active. */
export default function TabBarCircleIcon({
  source,
  focused,
  color,
}: TabBarCircleIconProps) {
  return (
    <View style={[styles.circle, focused && styles.circleActive]}>
      <Icon
        source={source as any}
        size={20}
        color={focused ? COLORS.white : color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    marginBottom: 6,
  },
  circleActive: {
    backgroundColor: COLORS.primary,
  },
});
