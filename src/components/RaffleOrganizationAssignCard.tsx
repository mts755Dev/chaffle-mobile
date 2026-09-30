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

function orgHasStripe(org: OrganizationRecord | null): boolean {
  if (!org) return false;
  const id = (org as { stripe_account_id?: string | null }).stripe_account_id;
  const json = (org as { stripe_account_json?: { id?: string } | null })
    .stripe_account_json;
  return !!(id || json?.id);
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

  const isLinked = !!form.organization_id;
  const selectedOrg = organizations.find((org) => org.id === selectedOrgId) ?? null;
  const selectedOrgReady = orgHasStripe(selectedOrg);

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

  const handleAssign = () => {
    if (!selectedOrgId || !selectedOrg) {
      Alert.alert('Select organization', 'Choose an approved organization to link this raffle.');
      return;
    }
    if (!selectedOrgReady) {
      Alert.alert(
        'Organization Stripe required',
        'This organization has no Stripe Connect account yet. Ask the org admin to connect Stripe, then try again.',
      );
      return;
    }

    const orgName = selectedOrg.name;
    Alert.alert(
      'Assign to organization',
      `Link this raffle to ${orgName}? The organization's Stripe account will be connected to this raffle for ticket sales.`,
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
                stripeAccount:
                  result.raffle.stripeAccount ??
                  (result.stripeAccountId
                    ? { id: result.stripeAccountId }
                    : form.stripeAccount),
              });
              Alert.alert(
                'Assigned',
                `Raffle linked to ${orgName}. This raffle now uses that organization's Stripe account.`,
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
      'Remove this raffle from its organization? The organization keeps its Stripe account; this raffle will no longer be linked.',
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
          Super admin only. Assign an approved organization and this raffle will use
          that organization&apos;s Stripe Connect account for ticket sales.
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
                      title={
                        orgHasStripe(org)
                          ? org.name
                          : `${org.name} (no Stripe)`
                      }
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

            {selectedOrg && !selectedOrgReady ? (
              <Text style={styles.warningText}>
                This organization has no Stripe Connect account yet. The org admin must
                connect Stripe before you can assign this raffle.
              </Text>
            ) : null}

            <Divider style={styles.divider} />

            <Button
              mode="contained"
              onPress={handleAssign}
              loading={isSubmitting}
              disabled={
                isSubmitting || !selectedOrgId || !selectedOrgReady || isLoadingOrgs
              }
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
    marginTop: 10,
    marginBottom: 0,
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
