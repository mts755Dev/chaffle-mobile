import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Text, Button, Divider, Chip } from 'react-native-paper';
import TextInput from '../../../components/AppTextInput';
import { COLORS, PASSWORD_REGEX } from '../../../constants';
import { useAuthStore } from '../../../store/authStore';

function roleLabel(role: string | null): string {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'org_admin':
      return 'Organization Admin';
    case 'worker':
      return 'Worker';
    default:
      return 'Admin';
  }
}

export default function AdminSettingsScreen() {
  const {
    user,
    role,
    organizationName,
    organizationId,
    orgApprovalStatus,
    updateOrganizationProfile,
    updatePassword,
    logout,
  } = useAuthStore();

  const isOrgAdmin = role === 'org_admin';

  const [orgName, setOrgName] = useState(organizationName ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setOrgName(organizationName ?? '');
  }, [organizationName]);

  const profileDirty = useMemo(() => {
    return orgName.trim() !== (organizationName ?? '').trim();
  }, [orgName, organizationName]);

  const onSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateOrganizationProfile({ name: orgName });
      Alert.alert('Saved', 'Organization profile updated.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const onUpdatePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Missing password', 'Enter your current password.');
      return;
    }
    if (!PASSWORD_REGEX.test(newPassword)) {
      Alert.alert(
        'Weak password',
        'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character (@$!%*?&).',
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      await updatePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Updated', 'Your password has been changed.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update password');
    } finally {
      setSavingPassword(false);
    }
  };

  const onSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value} selectable>
            {user?.email || '—'}
          </Text>

          <Divider style={styles.divider} />

          <Text style={styles.label}>Role</Text>
          <Chip compact style={styles.roleChip} textStyle={styles.roleChipText}>
            {roleLabel(role)}
          </Chip>

          {isOrgAdmin && organizationId ? (
            <>
              <Divider style={styles.divider} />
              <Text style={styles.label}>Organization status</Text>
              <Text style={styles.value}>
                {(orgApprovalStatus || 'pending').replace(/^\w/, (c: string) =>
                  c.toUpperCase(),
                )}
              </Text>
            </>
          ) : null}
        </View>

        {isOrgAdmin ? (
          <>
            <Text style={styles.sectionTitle}>Organization</Text>
            <View style={styles.card}>
              <TextInput
                mode="outlined"
                label="Organization name"
                value={orgName}
                onChangeText={setOrgName}
                autoCapitalize="words"
                style={styles.input}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
                left={<TextInput.Icon icon="domain" />}
              />
              <Button
                mode="contained"
                onPress={onSaveProfile}
                loading={savingProfile}
                disabled={savingProfile || !profileDirty}
                buttonColor={COLORS.primary}
                style={styles.button}
              >
                Save profile
              </Button>
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Password</Text>
        <View style={styles.card}>
          <TextInput
            mode="outlined"
            label="Current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry={!showCurrent}
            style={styles.input}
            outlineColor={COLORS.border}
            activeOutlineColor={COLORS.primary}
            left={<TextInput.Icon icon="lock-outline" />}
            right={
              <TextInput.Icon
                icon={showCurrent ? 'eye-off' : 'eye'}
                onPress={() => setShowCurrent((v) => !v)}
              />
            }
          />
          <TextInput
            mode="outlined"
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showNew}
            style={styles.input}
            outlineColor={COLORS.border}
            activeOutlineColor={COLORS.primary}
            left={<TextInput.Icon icon="lock" />}
            right={
              <TextInput.Icon
                icon={showNew ? 'eye-off' : 'eye'}
                onPress={() => setShowNew((v) => !v)}
              />
            }
          />
          <TextInput
            mode="outlined"
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showNew}
            style={styles.input}
            outlineColor={COLORS.border}
            activeOutlineColor={COLORS.primary}
            left={<TextInput.Icon icon="lock-check" />}
          />
          <Button
            mode="contained"
            onPress={onUpdatePassword}
            loading={savingPassword}
            disabled={savingPassword}
            buttonColor={COLORS.primary}
            style={styles.button}
          >
            Update password
          </Button>
        </View>

        <Button
          mode="outlined"
          icon="logout"
          onPress={onSignOut}
          textColor={COLORS.error}
          style={styles.signOutBtn}
        >
          Sign out
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 110,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  label: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.foreground,
  },
  divider: {
    marginVertical: 12,
  },
  roleChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE',
  },
  roleChipText: {
    color: COLORS.primaryDark,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.white,
    marginBottom: 10,
  },
  button: {
    marginTop: 4,
    borderRadius: 8,
  },
  signOutBtn: {
    borderColor: COLORS.error,
    borderRadius: 8,
    marginTop: 8,
  },
});
