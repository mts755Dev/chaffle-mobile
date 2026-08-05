/**
 * Download Tickets CSV — matches web DownloadTicketsCsvButton.
 * Available to super_admin and org_admin.
 */

import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Button, IconButton } from 'react-native-paper';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { COLORS } from '../constants';
import { useAuthStore } from '../store/authStore';
import { getRaffleTicketsForExport } from '../services/api/ticketExportApi';
import { buildCsv, slugifyFilename } from '../utils/csv';

const CSV_HEADERS = [
  { key: 'referenceId', label: 'Reference ID' },
  { key: 'ticketId', label: 'Ticket Id' },
  { key: 'buyerName', label: 'Name' },
  { key: 'buyerEmail', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'amount', label: 'Paid Amount' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'isFree', label: 'Free Ticket' },
  { key: 'paid', label: 'Paid' },
  { key: 'isWinner', label: 'Winner' },
  { key: 'raffleTitle', label: 'Raffle' },
  { key: 'createdAt', label: 'Created on' },
  { key: 'updatedAt', label: 'Updated on' },
] as const;

type Props = {
  raffleId: string;
  raffleTitle?: string | null;
  /** Compact icon-only button for dashboard action rows */
  variant?: 'button' | 'icon';
};

export default function DownloadTicketsCsvButton({
  raffleId,
  raffleTitle,
  variant = 'button',
}: Props) {
  const { role, organizationId } = useAuthStore();
  const [isDownloading, setIsDownloading] = useState(false);

  if (role !== 'super_admin' && role !== 'org_admin') {
    return null;
  }

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const result = await getRaffleTicketsForExport({
        raffleId,
        role,
        organizationId,
      });

      if (!result.success) {
        Alert.alert('Export failed', result.error);
        return;
      }

      const title = raffleTitle || result.raffleTitle;
      const date = new Date().toISOString().slice(0, 10);
      const filename = `${slugifyFilename(title)}-tickets-${date}.csv`;
      const csv = buildCsv([...CSV_HEADERS], result.tickets);

      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!dir) {
        throw new Error('No writable directory available on this device');
      }

      const path = `${dir}${filename}`;
      await FileSystem.writeAsStringAsync(path, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          'Tickets exported',
          `CSV saved to ${path}. Sharing is not available on this device.`,
        );
        return;
      }

      await Sharing.shareAsync(path, {
        mimeType: 'text/csv',
        dialogTitle: 'Download Tickets CSV',
        UTI: 'public.comma-separated-values-text',
      });

      Alert.alert(
        'Tickets exported',
        result.tickets.length === 0
          ? 'No tickets found for this raffle (empty CSV downloaded).'
          : `Exported ${result.purchaseCount} purchase row${
              result.purchaseCount === 1 ? '' : 's'
            } (${result.paidEntriesSold} paid entries sold — matches Tickets Sold on the dashboard).`,
      );
    } catch (error: unknown) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'Something went wrong',
      );
    } finally {
      setIsDownloading(false);
    }
  };

  if (variant === 'icon') {
    return (
      <IconButton
        icon={isDownloading ? 'loading' : 'download'}
        iconColor={COLORS.primary}
        size={20}
        onPress={() => void handleDownload()}
        disabled={isDownloading}
        style={styles.iconAction}
        accessibilityLabel="Download tickets CSV"
      />
    );
  }

  return (
    <Button
      mode="outlined"
      icon={isDownloading ? 'loading' : 'download'}
      onPress={() => void handleDownload()}
      loading={isDownloading}
      disabled={isDownloading}
      style={styles.button}
      textColor={COLORS.primary}
      compact
    >
      Download Tickets CSV
    </Button>
  );
}

const styles = StyleSheet.create({
  iconAction: {
    margin: 0,
  },
  button: {
    borderColor: COLORS.primary,
    borderRadius: 8,
  },
});
