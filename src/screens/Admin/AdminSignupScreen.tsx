import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Text, TextInput, Button, Snackbar, Icon } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { COLORS, PASSWORD_REGEX } from '../../constants';
import { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/authStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const signupSchema = z.object({
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().regex(
    PASSWORD_REGEX,
    'Password must contain: uppercase, lowercase, number, special character, and be at least 8 characters'
  ),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type SignupFormData = z.infer<typeof signupSchema>;

export default function AdminSignupScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { signup, isAdmin, isLoading, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { organizationName: '', email: '', password: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (isAdmin) {
      navigation.navigate('AdminDashboard');
    }
  }, [isAdmin]);

  const onSubmit = async (data: SignupFormData) => {
    await signup(data.email, data.password, data.organizationName);
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
          <Icon source="domain" size={64} color={COLORS.primary} />
          <Text style={styles.title}>Organization Signup</Text>
          <Text style={styles.subtitle}>
            Create an account to manage your raffles. A super admin must approve your organization before you can create raffles.
          </Text>
        </View>

        <Controller
          control={control}
          name="organizationName"
          render={({ field: { onChange, value } }) => (
            <TextInput
              mode="outlined"
              label="Organization Name"
              value={value}
              onChangeText={onChange}
              autoCapitalize="words"
              error={!!errors.organizationName}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              left={<TextInput.Icon icon="domain" />}
            />
          )}
        />
        {errors.organizationName && (
          <Text style={styles.errorText}>{errors.organizationName.message}</Text>
        )}

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

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, value } }) => (
            <TextInput
              mode="outlined"
              label="Confirm Password"
              value={value}
              onChangeText={onChange}
              secureTextEntry={!showPassword}
              error={!!errors.confirmPassword}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              left={<TextInput.Icon icon="lock-check" />}
            />
          )}
        />
        {errors.confirmPassword && (
          <Text style={styles.errorText}>{errors.confirmPassword.message}</Text>
        )}

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
          style={styles.signupButton}
          contentStyle={styles.signupContent}
          icon="account-plus"
        >
          {isLoading ? 'Creating Account...' : 'Sign Up'}
        </Button>

        <Button
          mode="text"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          textColor={COLORS.primary}
        >
          Already have an account? Sign In
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
    marginBottom: 24,
    marginTop: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
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
  signupButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  signupContent: {
    paddingVertical: 8,
  },
  backButton: {
    marginTop: 12,
  },
  snackbar: {
    backgroundColor: COLORS.error,
  },
});
