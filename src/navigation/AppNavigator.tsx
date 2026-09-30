import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COLORS } from '../constants';
import {
  RootStackParamList,
  AdminTabParamList,
  WorkerTabParamList,
} from '../types';
import { useAuthStore } from '../store/authStore';
import LoadingScreen from '../components/LoadingScreen';
import GeoRestrictedScreen from '../components/GeoRestrictedScreen';
import TabBarCircleIcon from '../components/TabBarCircleIcon';

import RaffleScreen from '../screens/Raffle/RaffleScreen';
import BuyTicketsScreen from '../screens/BuyTickets/BuyTicketsScreen';
import PaymentSuccessScreen from '../screens/PaymentSuccess/PaymentSuccessScreen';
import FreeTicketScreen from '../screens/FreeTicket/FreeTicketScreen';

import AdminLoginScreen from '../screens/Admin/AdminLoginScreen';
import AdminSignupScreen from '../screens/Admin/AdminSignupScreen';
import AdminDashboardScreen from '../screens/Admin/Dashboard/AdminDashboardScreen';
import EditRaffleScreen from '../screens/Admin/EditRaffle/EditRaffleScreen';
import AdminTicketsScreen from '../screens/Admin/Tickets/AdminTicketsScreen';
import InPersonPaymentScreen from '../screens/Admin/InPersonPayment/InPersonPaymentScreen';
import AdminTapToPayScreen from '../screens/Admin/TapToPay/AdminTapToPayScreen';
import TapToPayEducationScreen from '../screens/Admin/TapToPay/TapToPayEducationScreen';
import PreviewRaffleScreen from '../screens/Admin/PreviewRaffle/PreviewRaffleScreen';
import TapToPayOnboardingHost from '../components/TapToPayOnboardingHost';
import ManageWorkersScreen from '../screens/Admin/Workers/ManageWorkersScreen';
import ManageOrganizationsScreen from '../screens/Admin/Organizations/ManageOrganizationsScreen';
import AdminSettingsScreen from '../screens/Admin/Settings/AdminSettingsScreen';
import WorkerDashboardScreen from '../screens/Worker/WorkerDashboardScreen';
import WorkerTicketsScreen from '../screens/Worker/WorkerTicketsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const AdminTab = createBottomTabNavigator<AdminTabParamList>();
const WorkerTab = createBottomTabNavigator<WorkerTabParamList>();

const tabScreenOptions = {
  tabBarActiveTintColor: COLORS.primary,
  tabBarInactiveTintColor: COLORS.textLight,
  tabBarShowLabel: true,
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: '600' as const,
    marginTop: 4,
  },
  tabBarItemStyle: {
    paddingTop: 6,
  },
  tabBarStyle: {
    backgroundColor: COLORS.white,
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 92 : 76,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 26 : 12,
    elevation: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    position: 'absolute' as const,
  },
  headerStyle: {
    backgroundColor: COLORS.primary,
    elevation: 0,
    shadowOpacity: 0,
  },
  headerTintColor: COLORS.white,
  headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
};

function AdminTabs() {
  const role = useAuthStore((s) => s.role);
  const isSuperAdmin = role === 'super_admin';

  return (
    <AdminTab.Navigator screenOptions={tabScreenOptions}>
      <AdminTab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <TabBarCircleIcon
              source="view-dashboard"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      {isSuperAdmin ? (
        <AdminTab.Screen
          name="ManageOrganizations"
          component={ManageOrganizationsScreen}
          options={{
            title: 'Organizations',
            tabBarLabel: 'Organizations',
            tabBarIcon: ({ color, focused }) => (
              <TabBarCircleIcon
                source="domain"
                focused={focused}
                color={color}
              />
            ),
          }}
        />
      ) : null}
      <AdminTab.Screen
        name="AdminTickets"
        component={AdminTicketsScreen}
        options={{
          title: 'Tickets',
          tabBarLabel: 'Tickets',
          tabBarIcon: ({ color, focused }) => (
            <TabBarCircleIcon
              source="ticket-confirmation-outline"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <AdminTab.Screen
        name="AdminSettings"
        component={AdminSettingsScreen}
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabBarCircleIcon
              source="cog-outline"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
    </AdminTab.Navigator>
  );
}

function WorkerTabs() {
  return (
    <WorkerTab.Navigator screenOptions={tabScreenOptions}>
      <WorkerTab.Screen
        name="WorkerDashboard"
        component={WorkerDashboardScreen}
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <TabBarCircleIcon
              source="view-dashboard"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <WorkerTab.Screen
        name="WorkerTickets"
        component={WorkerTicketsScreen}
        options={{
          title: 'Tickets',
          tabBarLabel: 'Tickets',
          tabBarIcon: ({ color, focused }) => (
            <TabBarCircleIcon
              source="ticket-confirmation-outline"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
    </WorkerTab.Navigator>
  );
}

function signedInStackScreens() {
  return (
    <>
      <Stack.Screen
        name="EditRaffle"
        component={EditRaffleScreen}
        options={{ title: 'Edit Raffle', headerBackTitle: 'Dashboard' }}
      />
      <Stack.Screen
        name="PreviewRaffle"
        component={PreviewRaffleScreen}
        options={{ title: 'Preview Raffle', headerBackTitle: 'Dashboard' }}
      />
      <Stack.Screen
        name="InPersonPayment"
        component={InPersonPaymentScreen}
        options={{ title: 'Tap to Pay on iPhone', headerBackTitle: 'Dashboard' }}
      />
      <Stack.Screen
        name="AdminTapToPay"
        component={AdminTapToPayScreen}
        options={{ title: 'Tap to Pay on iPhone', headerBackTitle: 'Dashboard' }}
      />
      <Stack.Screen
        name="TapToPayEducation"
        component={TapToPayEducationScreen}
        options={{ title: 'Tap to Pay on iPhone Guide', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="ManageWorkers"
        component={ManageWorkersScreen}
        options={{ title: 'Manage Workers', headerBackTitle: 'Dashboard' }}
      />
      <Stack.Screen
        name="Raffle"
        component={RaffleScreen}
        options={{ title: 'Raffle Details' }}
      />
      <Stack.Screen
        name="BuyTickets"
        component={BuyTicketsScreen}
        options={{ title: 'Buy Tickets' }}
      />
      <Stack.Screen
        name="PaymentSuccess"
        component={PaymentSuccessScreen}
        options={{ title: 'Payment Successful', headerBackVisible: false }}
      />
      <Stack.Screen
        name="FreeTicket"
        component={FreeTicketScreen}
        options={{ title: 'Free Ticket' }}
      />
      <Stack.Screen
        name="GeoRestricted"
        component={GeoRestrictedPlaceholder}
        options={{ title: 'Location Restricted' }}
      />
    </>
  );
}

export default function AppNavigator() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const role = useAuthStore((s) => s.role);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return <LoadingScreen message="Loading…" />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: COLORS.white,
          headerTitleStyle: { fontWeight: '600', fontSize: 18 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        {!isAdmin ? (
          <>
            <Stack.Screen
              name="AdminLogin"
              component={AdminLoginScreen}
              options={{ headerShown: false, title: 'Sign In' }}
            />
            <Stack.Screen
              name="AdminSignup"
              component={AdminSignupScreen}
              options={{ title: 'Organization Signup' }}
            />
          </>
        ) : role === 'worker' ? (
          <>
            <Stack.Screen
              name="WorkerTabs"
              component={WorkerTabs}
              options={{ headerShown: false, title: 'Dashboard' }}
            />
            {signedInStackScreens()}
          </>
        ) : (
          <>
            <Stack.Screen
              name="AdminTabs"
              component={AdminTabs}
              options={{ headerShown: false, title: 'Dashboard' }}
            />
            {signedInStackScreens()}
          </>
        )}
      </Stack.Navigator>
      <TapToPayOnboardingHost />
    </NavigationContainer>
  );
}

function GeoRestrictedPlaceholder() {
  return (
    <GeoRestrictedScreen userState={null} requiredState={null} />
  );
}
