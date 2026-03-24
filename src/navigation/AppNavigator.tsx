import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Icon } from 'react-native-paper';
import { COLORS } from '../constants';
import { RootStackParamList, MainTabParamList } from '../types';

// Screens
import HomeScreen from '../screens/Home/HomeScreen';
import RaffleScreen from '../screens/Raffle/RaffleScreen';
import BuyTicketsScreen from '../screens/BuyTickets/BuyTicketsScreen';
import PaymentSuccessScreen from '../screens/PaymentSuccess/PaymentSuccessScreen';
import FreeTicketScreen from '../screens/FreeTicket/FreeTicketScreen';
import ContactScreen from '../screens/Contact/ContactScreen';
import AboutScreen from '../screens/About/AboutScreen';
import GeoRestrictedScreen from '../components/GeoRestrictedScreen';

// Admin Screens
import AdminLoginScreen from '../screens/Admin/AdminLoginScreen';
import AdminDashboardScreen from '../screens/Admin/Dashboard/AdminDashboardScreen';
import EditRaffleScreen from '../screens/Admin/EditRaffle/EditRaffleScreen';
import AdminTicketsScreen from '../screens/Admin/Tickets/AdminTicketsScreen';
import AdminWinnersScreen from '../screens/Admin/Winners/AdminWinnersScreen';
import InPersonPaymentScreen from '../screens/Admin/InPersonPayment/InPersonPaymentScreen';
import PreviewRaffleScreen from '../screens/Admin/PreviewRaffle/PreviewRaffleScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: {
          backgroundColor: COLORS.surfaceMuted,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          paddingTop: 4,
          height: 60,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerStyle: {
          backgroundColor: COLORS.primary,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Icon source="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="About"
        component={AboutScreen}
        options={{
          title: 'About',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Icon source="information-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Contact"
        component={ContactScreen}
        options={{
          title: 'Contact',
          tabBarIcon: ({ color, size }) => (
            <Icon source="email-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminLogin"
        component={AdminLoginScreen}
        options={{
          title: 'Admin',
          tabBarIcon: ({ color, size }) => (
            <Icon source="shield-account" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: COLORS.primary,
          },
          headerTintColor: COLORS.white,
          headerTitleStyle: { fontWeight: '600', fontSize: 18 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
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
        {/* Admin Screens */}
        <Stack.Screen
          name="AdminDashboard"
          component={AdminDashboardScreen}
          options={{ title: 'Admin Dashboard' }}
        />
        <Stack.Screen
          name="EditRaffle"
          component={EditRaffleScreen}
          options={{ title: 'Edit Raffle' }}
        />
        <Stack.Screen
          name="PreviewRaffle"
          component={PreviewRaffleScreen}
          options={{ title: 'Preview Raffle' }}
        />
        <Stack.Screen
          name="AdminTickets"
          component={AdminTicketsScreen}
          options={{ title: 'All Tickets' }}
        />
        <Stack.Screen
          name="AdminWinners"
          component={AdminWinnersScreen}
          options={{ title: 'Winners' }}
        />
        <Stack.Screen
          name="InPersonPayment"
          component={InPersonPaymentScreen}
          options={{ title: 'In-Person Payment' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// Placeholder for geo restricted route
function GeoRestrictedPlaceholder() {
  return (
    <GeoRestrictedScreen
      userState={null}
      requiredState={null}
    />
  );
}
