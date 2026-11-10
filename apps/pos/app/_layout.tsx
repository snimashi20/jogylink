import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { theme } from '../src/theme';

/** Sends the person to the right side of the sign-in wall whenever the state changes. */
function Gate() {
  const { state } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const inApp = segments[0] === '(app)';

  useEffect(() => {
    if (state.status === 'loading') return;
    if (state.status === 'signed-out' && inApp) router.replace('/login');
    if (state.status === 'signed-in' && !inApp) router.replace('/');
  }, [state.status, inApp, router]);

  if (state.status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.bg,
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} accessibilityLabel="Loading" />
      </View>
    );
  }
  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Gate />
    </AuthProvider>
  );
}
