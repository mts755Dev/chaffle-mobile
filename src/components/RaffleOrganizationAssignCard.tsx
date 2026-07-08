import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Text, Button, Card, Menu, Icon, Divider } from 'react-native-paper';
import { COLORS } from '../constants';
import type { DonationForm, OrganizationRecord } from '../types';
import { organizationApi } from '../services/api/organizationApi';
import { raffleOrganizationApi } from '../services/api/raffleOrganizationApi';
import { formatOrganizationLabel } from '../utils/orgDisplay';

interface RaffleOrganizationAssignCardProps {
  raffleId: string;
  form: DonationForm;
  onUpdated: (patch: Partial<DonationForm>) => void;
}

export default function RaffleOrganizationAssignCard({
  raffleId,
  form,
  onUpdated,
}: RaffleOrganizationAssignCardProps) {
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasStripe = !!(form.stripeAccount as { id?: string } | null)?.id;
  const isLinked = !!form.organization_id;

  const loadOrganizations = useCallback(async () => {
    setIsLoadingOrgs(true);
    try {
      const rows = await organizationApi.listOrganizations('approved');
      setOrganizations(rows);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load organizations');
    } finally {
      setIsLoadingOrgs(false);
    }
  }, []);

  useEffect(() => {
    if (!isLinked) {
      void loadOrganizations();
    }
  }, [isLinked, loadOrganizations]);

  const selectedOrg = organizations.find((org) => org.id === selectedOrgId) ?? null;

  const handleAssign = () => {
    if (!selectedOrgId) {
      Alert.alert('Select organization', 'Choose an approved organization to link this raffle.');
      return;
    }
    if (!hasStripe) {
      Alert.alert(
        'Stripe required',
        'Connect Stripe on this raffle before assigning it to an organization.',
      );
      return;
    }

    const orgName = selectedOrg?.name ?? 'this organization';
    Alert.alert(
      'Assign to organization',
      `Link this raffle to ${orgName}? The raffle's Stripe account will be used for that organization's ticket sales.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Assign',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const result = await raffleOrganizationApi.assignToOrganization(
                raffleId,
                selectedOrgId,
              );
              onUpdated({
                organization_id: result.raffle.organization_id,
                organization_name: orgName,
                organization_approval_status: 'approved',
              });
              Alert.alert(
                'Assigned',
                `Raffle linked to ${orgName}. Organization ticket sales will use this raffle's Stripe account.`,
              );
            } catch (err: any) {
              Alert.alert('Assign failed', err.message || 'Could not assign raffle');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const handleUnassign = () => {
    Alert.alert(
      'Unassign from organization',
      'Remove this raffle from its organization? The organization will keep any other linked raffles and Stripe will be recalculated from them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unassign',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await raffleOrganizationApi.unassignFromOrganization(raffleId);
              onUpdated({
                organization_id: null,
                organization_name: null,
                organization_approval_status: null,
              });
              setSelectedOrgId(null);
              void loadOrganizations();
              Alert.alert('Unassigned', 'This raffle is no longer linked to an organization.');
            } catch (err: any) {
              Alert.alert('Unassign failed', err.message || 'Could not unassign raffle');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.cardTitle}>Organization Assignment</Text>
        <Text style={styles.helperText}>
          Super admin only. A raffle can belong to one organization. When assigned, this
          raffle&apos;s Stripe account is used for that organization&apos;s ticket sales.
        </Text>

        {isLinked ? (
          <>
            <View style={styles.linkedRow}>
              <Icon source="domain" size={20} color={COLORS.primary} />
              <View style={styles.linkedText}>
                <Text style={styles.linkedLabel}>Linked organization</Text>
                <Text style={styles.linkedValue}>
                  {formatOrganizationLabel(
                    form.organization_name,
                    form.organization_approval_status,
                  )}
                </Text>
              </View>
            </View>
            <Button
              mode="outlined"
              onPress={handleUnassign}
              loading={isSubmitting}
              disabled={isSubmitting}
              icon="link-off"
              textColor={COLORS.error}
              style={styles.unassignButton}
            >
              Unassign from organization
            </Button>
          </>
        ) : (
          <>
            {!hasStripe ? (
              <Text style={styles.warningText}>
                Connect Stripe on this raffle before assigning it to an organization.
              </Text>
            ) : null}

            <Text style={styles.fieldLabel}>Approved organization</Text>
            <Menu
              visible={menuVisible}
              onDismiss={() => setMenuVisible(false)}
              anchor={
                <TouchableOpacity
                  onPress={() => setMenuVisible(true)}
                  style={styles.selectTrigger}
                  disabled={isLoadingOrgs || isSubmitting}
                >
                  <Text
                    style={[
                      styles.selectTriggerText,
                      !selectedOrg && styles.selectPlaceholder,
                    ]}
                    numberOfLines={1}
                  >
                    {isLoadingOrgs
                      ? 'Loading organizations…'
                      : selectedOrg?.name || 'Select an organization'}
                  </Text>
                  <Icon source="chevron-down" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              }
              contentStyle={styles.menuContent}
            >
              <ScrollView style={styles.menuScroll}>
                {organizations.length === 0 ? (
                  <Menu.Item title="No approved organizations" disabled />
                ) : (
                  organizations.map((org) => (
                    <Menu.Item
                      key={org.id}
                      title={org.name}
                      onPress={() => {
                        setSelectedOrgId(org.id);
                        setMenuVisible(false);
                      }}
                      titleStyle={
                        selectedOrgId === org.id
                          ? { color: COLORS.primary, fontWeight: '700' }
                          : { color: COLORS.foreground }
                      }
                    />
                  ))
                )}
              </ScrollView>
            </Menu>

            <Divider style={styles.divider} />

            <Button
              mode="contained"
              onPress={handleAssign}
              loading={isSubmitting}
              disabled={isSubmitting || !selectedOrgId || !hasStripe || isLoadingOrgs}
              icon="link-variant"
              buttonColor={COLORS.primary}
              style={styles.assignButton}
            >
              Assign to organization
            </Button>
          </>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.foreground,
    marginBottom: 6,
  },
  helperText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 13,
    color: COLORS.warning,
    marginBottom: 12,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.foreground,
    marginBottom: 6,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: COLORS.white,
  },
  selectTriggerText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.foreground,
    marginRight: 8,
  },
  selectPlaceholder: {
    color: COLORS.textSecondary,
  },
  menuContent: {
    maxHeight: 280,
    backgroundColor: COLORS.white,
  },
  menuScroll: {
    maxHeight: 260,
  },
  divider: {
    marginVertical: 12,
  },
  assignButton: {
    borderRadius: 8,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
  },
  linkedText: {
    flex: 1,
  },
  linkedLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  linkedValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.foreground,
  },
  unassignButton: {
    borderRadius: 8,
    borderColor: COLORS.error,
  },
});
