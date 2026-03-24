import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

interface LocationState {
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  isLoading: boolean;
  error: string | null;
  hasPermission: boolean;
}

export function useLocation() {
  const [locationState, setLocationState] = useState<LocationState>({
    state: null,
    latitude: null,
    longitude: null,
    isLoading: true,
    error: null,
    hasPermission: false,
  });

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'Location permission denied',
            hasPermission: false,
          }));
          return;
        }

        setLocationState((prev) => ({ ...prev, hasPermission: true }));

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const { latitude, longitude } = location.coords;

        // Reverse geocode to get state
        const [geocode] = await Location.reverseGeocodeAsync({ latitude, longitude });
        const stateName = geocode?.region || null;

        setLocationState({
          state: stateName,
          latitude,
          longitude,
          isLoading: false,
          error: null,
          hasPermission: true,
        });
      } catch (err: any) {
        setLocationState((prev) => ({
          ...prev,
          isLoading: false,
          error: err.message || 'Failed to get location',
        }));
      }
    })();
  }, []);

  return locationState;
}
