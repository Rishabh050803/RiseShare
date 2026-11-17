import type {Trip} from './trip';

export type LogCategory = 'SERVICE' | 'RIDER' | 'DRIVER' | 'STATE' | 'STRATEGY' | 'WARNING';

export interface ObserverLogEntry {
  id: string;
  timestamp: string;
  category: LogCategory;
  title: string;
  lines: string[];
  tripId?: string;
}

export interface TripObserver {
  onUpdate(trip: Trip): void;
}
