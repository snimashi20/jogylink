import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { OfflineBanner } from '../components/Banner';
import { QuantityStepper } from '../components/QuantityStepper';
import { theme } from '../theme';

/** Display data prepared by the future M4 stock and loading services. */
export interface LoadVanSuggestionItem {
  productId: string;
  code: string;
  name: string;
  /** Existing sellable quantity in the van; shown separately from the additional load. */
  currentVanQuantity: number;
  /** Sellable quantity currently available in the store. */
  storeAvailableQuantity: number;
  /** Additional quantity suggested by the loading service. */
  suggestedLoadQuantity: number;
}

/** Local presentation callback shape. This is not an API or M6 repository contract. */
export interface LoadVanSelection {
  productId: string;
  quantity: number;
}

export interface LoadVanScreenProps {
  state: 'loading' | 'ready' | 'unavailable';
  items: readonly LoadVanSuggestionItem[];
  onConfirm: (selection: LoadVanSelection[]) => void | Promise<void>;
  saving?: boolean;
  unavailableReason?: string;
  offlineMessage?: string;
  error?: string;
}

/** POS Load Van presentation. Parent supplies data and persists confirmed quantities. */
export function LoadVanScreen({
  state,
  items,
  onConfirm,
  saving = false,
  unavailableReason,
  offlineMessage,
  error,
}: LoadVanScreenProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    setQuantities(
      Object.fromEntries(items.map((item) => [item.productId, item.suggestedLoadQuantity])),
    );
  }, [items]);

  const selection = useMemo(
    () =>
      items
        .map((item) => ({ productId: item.productId, quantity: quantities[item.productId] ?? 0 }))
        .filter((item) => item.quantity > 0),
    [items, quantities],
  );

  const hasInvalidItem = items.some(
    (item) =>
      !Number.isInteger(item.currentVanQuantity) ||
      item.currentVanQuantity < 0 ||
      !Number.isInteger(item.storeAvailableQuantity) ||
      item.storeAvailableQuantity < 0 ||
      !Number.isInteger(item.suggestedLoadQuantity) ||
      item.suggestedLoadQuantity < 0 ||
      item.suggestedLoadQuantity > item.storeAvailableQuantity,
  );

  const disabledReason = saving
    ? 'Please wait while the van load is saved.'
    : state !== 'ready'
      ? 'Van load data is not ready.'
      : hasInvalidItem
        ? 'Some loading quantities are unavailable. Refresh the loading data.'
        : selection.length === 0
          ? 'Enter a quantity to load for at least one product.'
          : undefined;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 24,
        gap: 20,
        backgroundColor: theme.colors.bg,
        flexGrow: 1,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 6 }}>
        <Text
          accessibilityRole="header"
          style={{ fontSize: 30, fontWeight: '800', color: theme.colors.text }}
        >
          Load van
        </Text>
        <Text style={{ fontSize: theme.minText, color: theme.colors.muted }}>
          Review suggested quantities, then confirm the products to load.
        </Text>
      </View>

      {offlineMessage ? <OfflineBanner>{offlineMessage}</OfflineBanner> : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ fontSize: theme.minText, color: theme.colors.error }}
        >
          {error}
        </Text>
      ) : null}

      {state === 'loading' ? (
        <Text
          accessibilityRole="progressbar"
          style={{ fontSize: theme.minText, color: theme.colors.muted }}
        >
          Loading van suggestions…
        </Text>
      ) : state === 'unavailable' ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 12,
            padding: 20,
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.text }}>
            Loading data is not available
          </Text>
          <Text style={{ fontSize: theme.minText, color: theme.colors.muted }}>
            {unavailableReason ?? 'Refresh the route and stock data before preparing a load.'}
          </Text>
        </View>
      ) : hasInvalidItem ? (
        <Text
          accessibilityRole="alert"
          style={{ fontSize: theme.minText, color: theme.colors.error }}
        >
          Loading data contains invalid quantities. Refresh it before confirming.
        </Text>
      ) : items.length === 0 ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <Text style={{ fontSize: theme.minText, color: theme.colors.muted }}>
            There are no products to load for this route.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {items.map((item) => (
            <View
              key={item.productId}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 12,
                padding: 16,
                gap: 14,
                backgroundColor: '#FFFFFF',
              }}
            >
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.text }}>
                  {item.name}
                </Text>
                <Text style={{ fontSize: theme.minText, color: theme.colors.muted }}>
                  {item.code}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
                <Text style={{ fontSize: theme.minText, color: theme.colors.text }}>
                  In van: <Text style={{ fontWeight: '700' }}>{item.currentVanQuantity}</Text>
                </Text>
                <Text style={{ fontSize: theme.minText, color: theme.colors.text }}>
                  Available in store:{' '}
                  <Text style={{ fontWeight: '700' }}>{item.storeAvailableQuantity}</Text>
                </Text>
                <Text style={{ fontSize: theme.minText, color: theme.colors.muted }}>
                  Suggested load: {item.suggestedLoadQuantity}
                </Text>
              </View>
              <QuantityStepper
                label={`Load quantity for ${item.name}`}
                value={quantities[item.productId] ?? 0}
                min={0}
                max={item.storeAvailableQuantity}
                onChange={(quantity) =>
                  setQuantities((current) => ({ ...current, [item.productId]: quantity }))
                }
              />
            </View>
          ))}
        </View>
      )}

      {state === 'ready' && items.length > 0 && !hasInvalidItem ? (
        <Button
          label="Confirm van load"
          onPress={() => void onConfirm(selection)}
          busy={saving}
          disabledReason={disabledReason}
        />
      ) : null}
    </ScrollView>
  );
}
