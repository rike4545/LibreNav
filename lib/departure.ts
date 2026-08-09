/**
 * Departure planning — "leave by" for a target arrival time.
 *
 * The inverse of an ETA: instead of "when will I get there", answer "when do I
 * have to go". Worth its own module because the clock arithmetic has more edge
 * cases than it looks (a time that has already passed today, a departure that
 * is already in the past, and DST).
 */

export type DeparturePlan = {
  /** Epoch ms of the target arrival. */
  arrivalMs: number;
  /** Epoch ms the driver has to leave by to make it. */
  leaveByMs: number;
  /** Seconds until departure. Negative once that moment has gone. */
  secondsUntilDeparture: number;
  /** False when even leaving this instant arrives late. */
  achievable: boolean;
  /** How late leaving now would be, in seconds. Zero when achievable. */
  lateSeconds: number;
  /** True when the target rolled over to the following day. */
  tomorrow: boolean;
};

/**
 * Plan a departure for a "HH:MM" target.
 *
 * A time that has already passed today is taken to mean tomorrow — picking
 * 08:00 in the afternoon means tomorrow morning, not an arrival in the past.
 * The roll-over uses setDate rather than adding 86_400_000 ms so it stays
 * correct across a daylight-saving boundary.
 */
export function planDeparture(targetClock: string, travelSeconds: number, now = Date.now()): DeparturePlan | null {
  const match = targetClock.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const arrival = new Date(now);
  arrival.setHours(hours, minutes, 0, 0);

  const tomorrow = arrival.getTime() <= now;
  if (tomorrow) arrival.setDate(arrival.getDate() + 1);

  const arrivalMs = arrival.getTime();
  const leaveByMs = arrivalMs - travelSeconds * 1000;
  const secondsUntilDeparture = Math.round((leaveByMs - now) / 1000);
  const achievable = leaveByMs >= now;

  return {
    arrivalMs,
    leaveByMs,
    secondsUntilDeparture,
    achievable,
    lateSeconds: achievable ? 0 : Math.round((now + travelSeconds * 1000 - arrivalMs) / 1000),
    tomorrow
  };
}

/** "14:05" for a given moment, in the device's own locale and timezone. */
export function clockAt(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "in 2h 30m" / "in 12 min" / "now". Countdown to the departure moment. */
export function describeLeadTime(seconds: number): string {
  if (seconds <= 60) return 'now';

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `in ${minutes} min`;
  if (minutes === 0) return `in ${hours}h`;
  return `in ${hours}h ${minutes}m`;
}

/** "22 min" / "1h 05m". Used for how late an unachievable plan arrives. */
export function describeShortfall(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
