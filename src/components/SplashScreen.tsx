import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing, Image } from 'react-native';
import { COLORS } from '../constants';

const chaffleLogo = require('../../assets/chaffle-logo.png');
const { width } = Dimensions.get('window');

const SAFETY_TIMEOUT_MS = 5000;

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(12)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);

  useEffect(() => {
    const safeFinish = () => {
      if (!finished.current) {
        finished.current = true;
        onFinish();
      }
    };

    const timeout = setTimeout(safeFinish, SAFETY_TIMEOUT_MS);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
      ]),

      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslateY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),

      Animated.delay(800),

      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start(() => {
      clearTimeout(timeout);
      safeFinish();
    });

    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <View style={styles.content}>
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={chaffleLogo}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.Text
          style={[
            styles.tagline,
            {
              opacity: taglineOpacity,
              transform: [{ translateY: taglineTranslateY }],
            },
          ]}
        >
          Smarter raffles. Bigger impact.
        </Animated.Text>
      </View>

      <Animated.Text style={[styles.footer, { opacity: taglineOpacity }]}>
        Powered by Chaffle
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: width * 0.55,
    height: width * 0.25,
  },
  tagline: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 48,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.5,
  },
});
