import type {Trip} from './trip';
import type {TripObserver} from './tripObserver';

export abstract class User implements TripObserver {
  protected _id: string;
  protected _name: string;
  protected _contact: string;
  protected _tripHistory: Trip[];

  constructor(name: string, contact: string) {
    this._id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `usr-${Math.random().toString(36).slice(2, 10)}`;
    this._name = name;
    this._contact = contact;
    this._tripHistory = [];
  }

  public addTripToHistory(trip: Trip): void {
    this._tripHistory.push(trip);
  }

  public getTripHistory(): Trip[] {
    return this._tripHistory;
  }

  public getId(): string {
    return this._id;
  }

  public getName(): string {
    return this._name;
  }

  public getContact(): string {
    return this._contact;
  }

  public abstract onUpdate(trip: Trip): void;
}
