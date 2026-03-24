import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { COLORS } from '../constants';
import { stripHtml } from '../utils';

interface HtmlContentProps {
  html: string | null;
  style?: object;
}

/**
 * Simple HTML content renderer that strips tags and displays as text.
 * For a production app, consider using react-native-render-html.
 */
export default function HtmlContent({ html, style }: HtmlContentProps) {
  if (!html) return null;

  // Split by common HTML block elements for paragraph breaks
  const paragraphs = html
    .split(/<\/p>|<br\s*\/?>|<\/div>|<\/li>/gi)
    .map((p) => stripHtml(p))
    .filter((p) => p.trim().length > 0);

  return (
    <View style={[styles.container, style]}>
      {paragraphs.map((paragraph, index) => (
        <Text key={index} style={styles.text}>
          {paragraph}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  text: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 8,
  },
});
