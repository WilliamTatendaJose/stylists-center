import { create } from 'zustand';

export interface PickedLocation {
  lat: number;
  lng: number;
  /** Best-effort reverse-geocoded label for the tapped point. Null when the geocoder had nothing or failed. */
  areaName: string | null;
}

/**
 * Hands a map-picked point back to whichever screen pushed `/map/pick-location`.
 *
 * A store rather than route params for the same reason as the payment
 * pending stores: the picker screen leaves via `router.back()`, and the
 * caller's already-mounted screen (still underneath on the stack) reads the
 * result from here rather than from params that never arrive on a pop.
 */
interface LocationPickerState {
  result: PickedLocation | null;
  setResult: (result: PickedLocation) => void;
  clearResult: () => void;
}

export const useLocationPickerStore = create<LocationPickerState>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  clearResult: () => set({ result: null }),
}));
