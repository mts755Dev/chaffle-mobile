import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AdminRole, RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function adminHomeRoute(role: AdminRole): 'WorkerTabs' | 'AdminTabs' {
  return role === 'worker' ? 'WorkerTabs' : 'AdminTabs';
}

/** Land on staff tab shell after sign-in. */
export function resetToAdminHome(navigation: NavigationProp, role: AdminRole) {
  navigation.reset({
    index: 0,
    routes: [{ name: adminHomeRoute(role) }],
  });
}
