import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Animated,
  Pressable,
  StatusBar,
} from 'react-native';
import { Text, Snackbar } from 'react-native-paper';
import TextInput from '../../components/AppTextInput';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants';
import { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/authStore';

const chaffleLogo = require('../../../assets/chaffle-logo.png');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function AdminLoginScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const brandAnim = useRef(new Animated.Value(0)).current;
  const formAnim = useRef(new Animated.Value(0)).current;

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    Animated.stagger(120, [
      Animated.timing(brandAnim, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.timing(formAnim, {
        toValue: 1,
        duration: 480,
        useNativeDriver: true,
      }),
    ]).start();
  }, [brandAnim, formAnim]);

  const onSubmit = async (data: LoginFormData) => {
    await login(data.email, data.password);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      {/* Atmosphere — brand field */}
      <View style={[styles.brandField, { paddingTop: insets.top + 12 }]}>
        <View style={styles.orbA} />
        <View style={styles.orbB} />
        <View style={styles.orbC} />

        <Animated.View
          style={[
            styles.brandInner,
            {
              opacity: brandAnim,
              transform: [
                {
                  translateY: brandAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Image
            source={chaffleLogo}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Chaffle"
          />
          <Text style={styles.brandTagline}>Smarter raffles. Bigger impact.</Text>
          <Text style={styles.brandEyebrow}>STAFF ACCESS</Text>
        </Animated.View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View
          style={[
            styles.formShell,
            {
              paddingBottom: Math.max(insets.bottom, 20),
              opacity: formAnim,
              transform: [
                {
                  translateY: formAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [28, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.formScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Sign in</Text>
              <Text style={styles.formSubtitle}>
                Admins, organizations, and workers
              </Text>
            </View>

            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Email"
                  value={value}
                  onChangeText={onChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  error={!!errors.email}
                  style={styles.input}
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.primary}
                  outlineStyle={styles.inputOutline}
                  left={<TextInput.Icon icon="email-outline" />}
                  returnKeyType="next"
                />
              )}
            />
            {errors.email ? (
              <Text style={styles.errorText}>{errors.email.message}</Text>
            ) : null}

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Password"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  textContentType="password"
                  error={!!errors.password}
                  style={styles.input}
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.primary}
                  outlineStyle={styles.inputOutline}
                  left={<TextInput.Icon icon="lock-outline" />}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      onPress={() => setShowPassword(!showPassword)}
                    />
                  }
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit(onSubmit)}
                />
              )}
            />
            {errors.password ? (
              <Text style={styles.errorText}>{errors.password.message}</Text>
            ) : null}

            <Pressable
              onPress={handleSubmit(onSubmit)}
              disabled={isLoading}
              style={({ pressed }) => [
                styles.cta,
                pressed && styles.ctaPressed,
                isLoading && styles.ctaDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              <Text style={styles.ctaLabel}>
                {isLoading ? 'Signing in…' : 'Sign in'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate('AdminSignup')}
              style={styles.signupRow}
              accessibilityRole="button"
            >
              <Text style={styles.signupMuted}>New organization?</Text>
              <Text style={styles.signupLink}>Create an account</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      <Snackbar
        visible={!!error}
        onDismiss={clearError}
        duration={3000}
        style={styles.snackbar}
      >
        {error}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
  },
  flex: { flex: 1 },

  brandField: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingBottom: 48,
    overflow: 'hidden',
  },
  orbA: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -60,
    right: -40,
  },
  orbB: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0,0,0,0.08)',
    bottom: 20,
    left: -36,
  },
  orbC: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    top: 72,
    left: 28,
  },
  brandInner: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 8,
  },
  logo: {
    width: 176,
    height: 78,
    marginBottom: 14,
  },
  brandTagline: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  brandEyebrow: {
    marginTop: 14,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.4,
    color: 'rgba(255,255,255,0.72)',
  },

  formShell: {
    flex: 1,
    marginTop: -28,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
  },
  formScroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    justifyContent: 'flex-start',
  },
  formHeader: {
    marginBottom: 22,
  },
  formTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.foreground,
    letterSpacing: -0.5,
  },
  formSubtitle: {
    marginTop: 6,
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 21,
  },
  input: {
    backgroundColor: COLORS.surface,
    marginBottom: 4,
  },
  inputOutline: {
    borderRadius: 12,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginBottom: 10,
    marginLeft: 4,
  },
  cta: {
    marginTop: 18,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    backgroundColor: COLORS.primaryDark,
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaLabel: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  signupRow: {
    marginTop: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 8,
  },
  signupMuted: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  signupLink: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  snackbar: {
    backgroundColor: COLORS.error,
  },
});
