import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  MapPin,
  Merge,
  Milestone,
  Navigation,
  RotateCcw,
  Ship,
  Split
} from 'lucide-react';
import { ManeuverKind } from '@/types/map';

const ICONS: Record<ManeuverKind, typeof ArrowUp> = {
  start: Navigation,
  destination: Flag,
  continue: ArrowUp,
  'slight-left': CornerUpLeft,
  left: CornerUpLeft,
  'sharp-left': CornerDownLeft,
  'slight-right': CornerUpRight,
  right: CornerUpRight,
  'sharp-right': CornerDownRight,
  uturn: RotateCcw,
  'ramp-left': Split,
  'ramp-right': Split,
  'ramp-straight': ArrowUp,
  'exit-left': Milestone,
  'exit-right': Milestone,
  merge: Merge,
  roundabout: RotateCcw,
  ferry: Ship
};

/**
 * Lucide has no dedicated turn set, so mirror the right-hand icons for
 * left turns instead of shipping a near-duplicate icon per direction.
 */
const MIRRORED: ManeuverKind[] = ['slight-left', 'left', 'sharp-left', 'ramp-left', 'exit-left'];

export function ManeuverIcon({ kind, className }: { kind: ManeuverKind; className?: string }) {
  const Icon = ICONS[kind] ?? MapPin;
  const flip = MIRRORED.includes(kind);
  return <Icon className={className} style={flip ? { transform: 'scaleX(-1)' } : undefined} aria-hidden />;
}

export { ArrowDown };
