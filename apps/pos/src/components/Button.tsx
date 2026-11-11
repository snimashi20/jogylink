import { Pressable, Text, View } from 'react-native';
import { theme } from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  /** A disabled button must say why. */
  disabledReason?: string | null;
  busy?: boolean;
}

export function Button({ label, onPress, disabledReason, busy }: Props) {
  const disabled = Boolean(disabledReason) || busy;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled), busy }}
        onPress={disabled ? undefined : onPress}
        style={{
          minHeight: theme.minTarget,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          backgroundColor: disabled ? theme.colors.disabled : theme.colors.primary,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            fontWeight: '700',
            color: disabled ? theme.colors.muted : theme.colors.onPrimary,
          }}
        >
          {busy ? 'Please wait…' : label}
        </Text>
      </Pressable>
      {disabledReason ? (
        <Text style={{ fontSize: theme.minText, color: theme.colors.muted, marginTop: 8 }}>
          {disabledReason}
        </Text>
      ) : null}
    </View>
  );
}
