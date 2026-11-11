import { Text, View } from 'react-native';
import { theme } from '../theme';

/** Amber, with words. Offline is normal on the road, so it is never red or alarming. */
export function OfflineBanner({ children }: { children: string }) {
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: theme.colors.amberBg, padding: 16, borderRadius: 12 }}
    >
      <Text style={{ fontSize: theme.minText, color: theme.colors.amberText }}>{children}</Text>
    </View>
  );
}
