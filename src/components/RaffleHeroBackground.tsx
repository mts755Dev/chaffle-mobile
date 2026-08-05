/**
 * Full-bleed raffle background — edge-to-edge cover, no letterboxing.
 */

import React from 'react';
import { View, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { COLORS } from '../constants';
import { resolveImageUrl } from '../utils';

type RaffleHeroBackgroundProps = {
  imagePath?: string | null;
  /** Height as a fraction of screen width (default 0.72). */
  heightRatio?: number;
  children?: React.ReactNode;
};

export default function RaffleHeroBackground({
  imagePath,
  heightRatio = 0.72,
  children,
}: RaffleHeroBackgroundProps) {
  const { width: screenWidth } = useWindowDimensions();
  const height = Math.round(screenWidth * heightRatio);
  const uri = resolveImageUrl(imagePath);

  return (
    <View style={[styles.hero, { width: screenWidth, height }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.placeholder} />
      )}
      {children}
    </View>
  );
}

/** Fitted cover image inside a fixed-size container (edit preview / thumbnails). */
export function RaffleCoverImage({
  imagePath,
  style,
}: {
  imagePath?: string | null;
  style?: object;
}) {
  const uri = resolveImageUrl(imagePath);
  if (!uri) return null;

  return (
    <View style={[styles.coverBox, style]}>
      <Image source={{ uri }} style={styles.image} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: COLORS.primary,
    position: 'relative',
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  coverBox: {
    overflow: 'hidden',
    backgroundColor: COLORS.primary,
    position: 'relative',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.primary,
  },
});
