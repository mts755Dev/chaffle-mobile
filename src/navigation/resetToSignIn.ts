import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** After logout: back to Sign In (no tab bar). */
export function resetToSignIn(navigation: NavigationProp) {
  navigation.reset({
    index: 0,
    routes: [{ name: 'AdminLogin' }],
  });
}
