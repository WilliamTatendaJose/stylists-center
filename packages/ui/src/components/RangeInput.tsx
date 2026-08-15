import Slider from '@react-native-community/slider';
import { useTheme } from '../theme.js';

export interface RangeInputProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}

/** The budget slider (New request's "Up to $NN" panel) — accent thumb, 10-120 step 5. */
export function RangeInput({
  min,
  max,
  step,
  value,
  onChange,
  accessibilityLabel,
}: RangeInputProps) {
  const { colors } = useTheme();
  return (
    <Slider
      accessibilityLabel={accessibilityLabel}
      minimumValue={min}
      maximumValue={max}
      step={step}
      value={value}
      onValueChange={onChange}
      minimumTrackTintColor={colors.accent}
      maximumTrackTintColor={colors.divider}
      thumbTintColor={colors.accent}
    />
  );
}
