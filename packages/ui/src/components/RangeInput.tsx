import Slider from '@react-native-community/slider';
import { color } from '@sc/tokens';

export interface RangeInputProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}

/** The budget slider (New request's "Up to $NN" panel) — accent thumb, 10-120 step 5. */
export function RangeInput({ min, max, step, value, onChange, accessibilityLabel }: RangeInputProps) {
  return (
    <Slider
      accessibilityLabel={accessibilityLabel}
      minimumValue={min}
      maximumValue={max}
      step={step}
      value={value}
      onValueChange={onChange}
      minimumTrackTintColor={color.accent}
      maximumTrackTintColor={color.divider}
      thumbTintColor={color.accent}
    />
  );
}
