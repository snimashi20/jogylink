import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Button } from '../../src/components/Button';
import { OfflineBanner } from '../../src/components/Banner';
import { theme } from '../../src/theme';

/** Placeholder home. M2 replaces this with the order screen. */
export default function Home() {
  const { state, signOut, verify } = useAuth();
  const [blocked, setBlocked] = useState<string | null>(null);
  if (state.status !== 'signed-in') return null;

  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        gap: 20,
        justifyContent: 'center',
        backgroundColor: theme.colors.bg,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: 28, fontWeight: '800', color: theme.colors.text }}
      >
        Hello, {state.user.name}
      </Text>
      <Text style={{ fontSize: theme.minText, color: theme.colors.muted }}>
        Signed in as {state.user.role === 'owner' ? 'owner' : 'worker'}.
      </Text>

      {state.verification === 'offline' ? (
        <OfflineBanner>
          No signal right now. You can keep working. Your sign-in is checked again when you are back
          online.
        </OfflineBanner>
      ) : null}
      {state.verification === 'offline' ? (
        <Button label="Check again" onPress={() => void verify()} />
      ) : null}

      {blocked ? <OfflineBanner>{blocked}</OfflineBanner> : null}
      <Button label="Sign out" onPress={async () => setBlocked(await signOut())} />
    </View>
  );
}
