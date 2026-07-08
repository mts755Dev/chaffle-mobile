import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AdminRole, RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** Keeps MainTabs under admin home so iOS renders the native back pill. */
export function resetToAdminHome(navigation: NavigationProp, role: AdminRole) {
  const adminRoute = role === 'worker' ? 'WorkerDashboard' : 'AdminDashboard';
  navigation.reset({
    index: 1,
    routes: [{ name: 'MainTabs' }, { name: adminRoute }],
  });
}
