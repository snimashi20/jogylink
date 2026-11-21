import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { theme } from '../theme';

export interface QuantityStepperProps {
  /** Current committed quantity. */
  value: number;
  /** Called only with a whole number inside the configured bounds. */
  onChange: (value: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Supply a short visible explanation when the whole control is unavailable. */
  disabledReason?: string;
}

const controlStyle = {
  minWidth: theme.minTarget,
  minHeight: theme.minTarget,
  borderRadius: 12,
  borderWidth: 2,
  borderColor: theme.colors.border,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: '#FFFFFF',
};

/** C20 — large touch targets plus validated direct quantity entry for the offline POS. */
export function QuantityStepper({
  value,
  onChange,
  label = 'Quantity',
  min = 0,
  max,
  step = 1,
  disabledReason,
}: QuantityStepperProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const boundsError = useMemo(() => {
    if (!Number.isInteger(min) || (max !== undefined && !Number.isInteger(max))) {
      return 'Quantity limits must be whole numbers.';
    }
    if (max !== undefined && max < min) return 'Maximum quantity must be at least the minimum.';
    if (!Number.isInteger(step) || step <= 0)
      return 'Quantity step must be a positive whole number.';
    return null;
  }, [max, min, step]);

  const parsedDraft = draft.trim() === '' ? Number.NaN : Number(draft);
  const draftError =
    draft.trim() === '' || !Number.isInteger(parsedDraft)
      ? 'Enter a whole-number quantity.'
      : parsedDraft < min
        ? `Quantity cannot be less than ${min}.`
        : max !== undefined && parsedDraft > max
          ? `Quantity cannot be greater than ${max}.`
          : null;
  const error = boundsError ?? draftError;
  const disabled = Boolean(disabledReason) || Boolean(boundsError);
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  const limitHint = atMin
    ? `Minimum quantity is ${min}.`
    : atMax
      ? `Maximum quantity is ${max}.`
      : null;

  function adjust(amount: number) {
    if (disabled || (amount < 0 && atMin) || (amount > 0 && atMax)) return;
    const next = value + amount;
    if (next < min || (max !== undefined && next > max)) return;
    setDraft(String(next));
    onChange(next);
  }

  function commitDraft() {
    if (!error && parsedDraft !== value) onChange(parsedDraft);
    setDraft(String(error ? value : parsedDraft));
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: theme.minText, fontWeight: '600', color: theme.colors.text }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          accessibilityHint={atMin ? `Minimum quantity is ${min}.` : undefined}
          accessibilityState={{ disabled: disabled || atMin }}
          disabled={disabled || atMin}
          onPress={() => adjust(-step)}
          style={({ pressed }) => ({
            ...controlStyle,
            opacity: disabled || atMin ? 0.55 : pressed ? 0.75 : 1,
          })}
        >
          <Text
            style={{ fontSize: 32, lineHeight: 36, fontWeight: '700', color: theme.colors.text }}
          >
            −
          </Text>
        </Pressable>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? undefined}
          accessibilityState={{ disabled }}
          editable={!disabled}
          value={draft}
          onChangeText={setDraft}
          onBlur={commitDraft}
          onSubmitEditing={commitDraft}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          style={{
            minWidth: 88,
            minHeight: theme.minTarget,
            borderWidth: 2,
            borderColor: error ? theme.colors.error : theme.colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            fontSize: 22,
            fontWeight: '700',
            textAlign: 'center',
            color: theme.colors.text,
            backgroundColor: disabled ? theme.colors.disabled : '#FFFFFF',
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          accessibilityHint={atMax ? `Maximum quantity is ${max}.` : undefined}
          accessibilityState={{ disabled: disabled || Boolean(atMax) }}
          disabled={disabled || Boolean(atMax)}
          onPress={() => adjust(step)}
          style={({ pressed }) => ({
            ...controlStyle,
            opacity: disabled || atMax ? 0.55 : pressed ? 0.75 : 1,
          })}
        >
          <Text
            style={{ fontSize: 32, lineHeight: 36, fontWeight: '700', color: theme.colors.text }}
          >
            +
          </Text>
        </Pressable>
      </View>
      {disabledReason ? (
        <Text style={{ fontSize: theme.minText, color: theme.colors.muted }}>{disabledReason}</Text>
      ) : error ? (
        <Text
          accessibilityRole="alert"
          style={{ fontSize: theme.minText, color: theme.colors.error }}
        >
          {error}
        </Text>
      ) : limitHint ? (
        <Text style={{ fontSize: theme.minText, color: theme.colors.muted }}>{limitHint}</Text>
      ) : null}
    </View>
  );
}
