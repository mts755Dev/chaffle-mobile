import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Text, Button, Snackbar, Icon } from 'react-native-paper';
import TextInput from '../../components/AppTextInput';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { COLORS, PASSWORD_REGEX } from '../../constants';
import { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { resetToAdminHome } from '../../navigation/resetToAdminHome';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().regex(
    PASSWORD_REGEX,
    'Password must contain: uppercase, lowercase, number, special character, and be at least 8 characters'
  ),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function AdminLoginScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useFocusEffect(
    useCallback(() => {
      const { isAdmin, role, error: authError } = useAuthStore.getState();
      if (isAdmin && role && !authError) {
        resetToAdminHome(navigation, role);
      } else if (!isAdmin) {
        reset();
        setShowPassword(false);
      }
    }, [navigation, reset]),
  );

  const onSubmit = async (data: LoginFormData) => {
    await login(data.email, data.password);
    const { isAdmin, role, error: authError } = useAuthStore.getState();
    if (!authError && isAdmin && role) {
      resetToAdminHome(navigation, role);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Icon source="shield-account" size={64} color={COLORS.primary} />
          <Text style={styles.title}>Login</Text>
          <Text style={styles.subtitle}>
            Sign in to manage raffles and tickets
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
              error={!!errors.email}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              left={<TextInput.Icon icon="email" />}
            />
          )}
        />
        {errors.email && <Text style={styles.errorText}>{errors.email.message}</Text>}

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
              error={!!errors.password}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              left={<TextInput.Icon icon="lock" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
            />
          )}
        />
        {errors.password && (
          <Text style={styles.errorText}>{errors.password.message}</Text>
        )}

        {/* Password requirements hint */}
        <View style={styles.requirements}>
          <Text style={styles.requirementsTitle}>Password must contain:</Text>
          {[
            'At least 8 characters',
            'Uppercase letter (A-Z)',
            'Lowercase letter (a-z)',
            'Number (0-9)',
            'Special character (@$!%*?&)',
          ].map((req) => (
            <Text key={req} style={styles.requirementItem}>
              • {req}
            </Text>
          ))}
        </View>

        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={isLoading}
          disabled={isLoading}
          style={styles.loginButton}
          contentStyle={styles.loginContent}
          icon="login"
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>

        <Button
          mode="text"
          onPress={() => navigation.navigate('AdminSignup')}
          style={styles.signupLink}
          textColor={COLORS.primary}
          icon="domain"
        >
          Sign Up as Organization
        </Button>

      </ScrollView>

      <Snackbar
        visible={!!error}
        onDismiss={clearError}
        duration={3000}
        style={styles.snackbar}
      >
        {error}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  content: {
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  input: {
    backgroundColor: COLORS.surface,
    marginBottom: 4,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 4,
  },
  requirements: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  requirementsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  requirementItem: {
    fontSize: 11,
    color: COLORS.textLight,
    marginLeft: 8,
    lineHeight: 18,
  },
  loginButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  loginContent: {
    paddingVertical: 8,
  },
  signupLink: {
    marginTop: 12,
  },
  snackbar: {
    backgroundColor: COLORS.error,
  },
});
