import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { loginMessages, missingFieldsReason } from '../src/auth/messages';
import { Button } from '../src/components/Button';
import { OfflineBanner } from '../src/components/Banner';
import { theme } from '../src/theme';

const inputStyle = {
  minHeight: theme.minTarget,
  fontSize: 20,
  color: theme.colors.text,
  borderWidth: 2,
  borderColor: theme.colors.border,
  borderRadius: 12,
  paddingHorizontal: 16,
  backgroundColor: '#FFFFFF',
} as const;

export default function Login() {
  const { state, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null);

  const notice = state.status === 'signed-out' ? state.notice : undefined;
  const reason = missingFieldsReason(username, password);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await signIn(username, password);
    setBusy(false);
    if (!result.ok)
      setError({ text: loginMessages[result.reason], offline: result.reason === 'offline' });
    // On success the sign-in wall in _layout moves us into the app.
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: 32, fontWeight: '800', color: theme.colors.text }}
        >
          JogyLink POS
        </Text>
        <Text style={{ fontSize: theme.minText, color: theme.colors.muted }}>
          Sign in to start selling.
        </Text>

        {notice ? <OfflineBanner>{notice}</OfflineBanner> : null}

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: theme.minText, fontWeight: '600', color: theme.colors.text }}>
            Username
          </Text>
          <TextInput
            accessibilityLabel="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            returnKeyType="next"
            style={inputStyle}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: theme.minText, fontWeight: '600', color: theme.colors.text }}>
            Password
          </Text>
          <TextInput
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={() => !reason && !busy && void submit()}
            style={inputStyle}
          />
        </View>

        {error ? (
          error.offline ? (
            <OfflineBanner>{error.text}</OfflineBanner>
          ) : (
            <Text
              accessibilityRole="alert"
              style={{ fontSize: theme.minText, color: theme.colors.error, fontWeight: '600' }}
            >
              {error.text}
            </Text>
          )
        ) : null}

        <Button label="Sign in" onPress={() => void submit()} busy={busy} disabledReason={reason} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
