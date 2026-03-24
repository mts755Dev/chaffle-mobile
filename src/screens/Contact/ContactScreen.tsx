import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { Text, TextInput, Button, Snackbar, Card, Icon } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { COLORS, SOCIAL_LINKS } from '../../constants';
import { contactApi } from '../../services/api/raffleApi';

const contactSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
  subject: z.string().min(3, 'Subject is required'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

type ContactFormData = z.infer<typeof contactSchema>;

export default function ContactScreen() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [snackMessage, setSnackMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    setIsSubmitting(true);
    try {
      await contactApi.sendContactEmail(data);
      setIsSuccess(true);
      setSnackMessage('Message sent successfully!');
      reset();
    } catch {
      // Fallback: try to open email client
      const mailUrl = `mailto:support@chaffle.org?subject=${encodeURIComponent(
        data.subject
      )}&body=${encodeURIComponent(
        `From: ${data.name} (${data.email})\n\n${data.message}`
      )}`;
      try {
        await Linking.openURL(mailUrl);
        setSnackMessage('Opening email client...');
        setIsSuccess(true);
      } catch {
        setSnackMessage('Failed to send message. Please email support@chaffle.org directly.');
        setIsSuccess(false);
      }
    } finally {
      setIsSubmitting(false);
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
        <Text style={styles.title}>Tell Us What's On Your Mind</Text>
        <Text style={styles.description}>
          Have a question or need help? Send us a message and we'll get back to you.
        </Text>

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <TextInput
              mode="outlined"
              label="Name"
              value={value}
              onChangeText={onChange}
              error={!!errors.name}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
            />
          )}
        />
        {errors.name && <Text style={styles.errorText}>{errors.name.message}</Text>}

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
            />
          )}
        />
        {errors.email && <Text style={styles.errorText}>{errors.email.message}</Text>}

        <Controller
          control={control}
          name="subject"
          render={({ field: { onChange, value } }) => (
            <TextInput
              mode="outlined"
              label="Subject"
              value={value}
              onChangeText={onChange}
              error={!!errors.subject}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
            />
          )}
        />
        {errors.subject && <Text style={styles.errorText}>{errors.subject.message}</Text>}

        <Controller
          control={control}
          name="message"
          render={({ field: { onChange, value } }) => (
            <TextInput
              mode="outlined"
              label="Message"
              value={value}
              onChangeText={onChange}
              multiline
              numberOfLines={5}
              error={!!errors.message}
              style={[styles.input, styles.textArea]}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
            />
          )}
        />
        {errors.message && <Text style={styles.errorText}>{errors.message.message}</Text>}

        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={isSubmitting}
          style={styles.submitButton}
          contentStyle={styles.submitContent}
          icon="send"
        >
          Send Message
        </Button>

        {/* Social Links */}
        <Card style={styles.socialCard}>
          <Card.Content>
            <Text style={styles.socialTitle}>Follow Us</Text>
            <View style={styles.socialRow}>
              {[
                { name: 'Facebook', icon: 'facebook', url: SOCIAL_LINKS.facebook },
                { name: 'Instagram', icon: 'instagram', url: SOCIAL_LINKS.instagram },
                { name: 'Twitter', icon: 'twitter', url: SOCIAL_LINKS.twitter },
              ].map((social) => (
                <Button
                  key={social.name}
                  mode="outlined"
                  icon={social.icon}
                  onPress={() => Linking.openURL(social.url)}
                  style={styles.socialButton}
                  compact
                >
                  {social.name}
                </Button>
              ))}
            </View>
          </Card.Content>
        </Card>
      </ScrollView>

      <Snackbar
        visible={!!snackMessage}
        onDismiss={() => setSnackMessage('')}
        duration={3000}
        style={isSuccess ? styles.successSnackbar : styles.errorSnackbar}
      >
        {snackMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 4,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  input: {
    backgroundColor: COLORS.surface,
    marginBottom: 4,
  },
  textArea: {
    minHeight: 100,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 4,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    marginTop: 16,
  },
  submitContent: {
    paddingVertical: 8,
  },
  socialCard: {
    marginTop: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  },
  socialTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.foreground,
    marginBottom: 12,
    textAlign: 'center',
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  socialButton: {
    borderColor: COLORS.border,
  },
  successSnackbar: {
    backgroundColor: COLORS.success,
  },
  errorSnackbar: {
    backgroundColor: COLORS.error,
  },
});
