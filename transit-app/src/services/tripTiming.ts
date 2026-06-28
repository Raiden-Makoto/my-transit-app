import type { TripLeg } from '../types/location';

/** OTP plan timing for a leg; omitted entirely means "leave now". */
export type TripTiming = { date?: string; time?: string; arriveBy?: boolean };

/** Convert a leg's timing UI fields into OTP plan timing (undefined = now). */
export function legTiming(leg: TripLeg): TripTiming | undefined {
  if (!leg.whenMode || leg.whenMode === 'now' || !leg.whenValue) return undefined;
  const [date, hm] = leg.whenValue.split('T');
  return { date, time: `${hm}:00`, arriveBy: leg.whenMode === 'arrive' };
}
