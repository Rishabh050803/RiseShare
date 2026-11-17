import type {Driver} from './driver';
import {RideType, TripStatus} from './enums';
import {Location} from './location';
import type {Rider} from './rider';
import type {TripObserver} from './tripObserver';
import {RequestedState, type TripState} from './tripStates';

export class TripBuilder {
  public _id: string;
  public _rider: Rider | null = null;
  public _pickupLocation: Location | null = null;
  public _dropoffLocation: Location | null = null;
  public _fare = 0.0;
  public _rideType: RideType = RideType.SEDAN;
  public _pickupLabel = 'Pinned Pickup';
  public _dropoffLabel = 'Pinned Dropoff';
  public _distanceKm = 0;

  constructor() {
    this._id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `trp-${Math.random().toString(36).slice(2, 10)}`;
  }

  public withRider(rider: Rider): TripBuilder {
    this._rider = rider;
    return this;
  }

  public withPickupLocation(pickupLocation: Location, label?: string): TripBuilder {
    this._pickupLocation = pickupLocation;
    if (label) this._pickupLabel = label;
    return this;
  }

  public withDropoffLocation(dropoffLocation: Location, label?: string): TripBuilder {
    this._dropoffLocation = dropoffLocation;
    if (label) this._dropoffLabel = label;
    return this;
  }

  public withFare(fare: number): TripBuilder {
    this._fare = fare;
    return this;
  }

  public withRideType(rideType: RideType): TripBuilder {
    this._rideType = rideType;
    return this;
  }

  public withDistanceKm(distanceKm: number): TripBuilder {
    this._distanceKm = distanceKm;
    return this;
  }

  public build(): Trip {
    if (this._rider === null || this._pickupLocation === null || this._dropoffLocation === null) {
      throw new Error('Rider, pickup, and dropoff locations are required to build a trip.');
    }
    if (this._distanceKm <= 0) {
      this._distanceKm = this._pickupLocation.distanceTo(this._dropoffLocation);
    }
    return new Trip(this);
  }
}

export class Trip {
  public static TripBuilder = TripBuilder;

  private _id: string;
  private _rider: Rider;
  private _driver: Driver | null = null;
  private _pickupLocation: Location;
  private _dropoffLocation: Location;
  private _pickupLabel: string;
  private _dropoffLabel: string;
  private _fare: number;
  private _rideType: RideType;
  private _distanceKm: number;
  private _status: TripStatus;
  private _currentState: TripState;
  private _observers: TripObserver[];
  private _notifiedDriverIds: string[] = [];
  private _createdAt: string;

  constructor(builder: TripBuilder) {
    if (!builder._rider || !builder._pickupLocation || !builder._dropoffLocation) {
      throw new Error('Invalid TripBuilder state.');
    }
    this._id = builder._id;
    this._rider = builder._rider;
    this._pickupLocation = builder._pickupLocation;
    this._dropoffLocation = builder._dropoffLocation;
    this._pickupLabel = builder._pickupLabel;
    this._dropoffLabel = builder._dropoffLabel;
    this._fare = builder._fare;
    this._rideType = builder._rideType;
    this._distanceKm = builder._distanceKm;
    this._status = TripStatus.REQUESTED;
    this._currentState = new RequestedState();
    this._observers = [];
    this._createdAt = new Date().toTimeString().slice(0, 8);
    // Register rider as an observer on trip creation so Rider.onUpdate fires on state changes
    this.addObserver(this._rider);
  }

  public addObserver(observer: TripObserver): void {
    if (!this._observers.includes(observer)) {
      this._observers.push(observer);
    }
  }

  public setNotifiedDriverIds(ids: string[]): void {
    this._notifiedDriverIds = ids;
  }

  public getNotifiedDriverIds(): string[] {
    return this._notifiedDriverIds;
  }

  private _notifyObservers(): void {
    for (const observer of this._observers) {
      observer.onUpdate(this);
    }
  }

  public assignDriver(driver: Driver): void {
    this._currentState.assign(this, driver);
    this.addObserver(driver);
    this._notifyObservers();
  }

  public startTrip(): void {
    this._currentState.start(this);
    this._notifyObservers();
  }

  public endTrip(): void {
    this._currentState.end(this);
    this._notifyObservers();
  }

  public cancelTrip(): void {
    this._currentState.cancel(this);
    this._notifyObservers();
  }

  public getId(): string {
    return this._id;
  }

  public getRider(): Rider {
    return this._rider;
  }

  public getDriver(): Driver | null {
    return this._driver;
  }

  public getPickupLocation(): Location {
    return this._pickupLocation;
  }

  public getDropoffLocation(): Location {
    return this._dropoffLocation;
  }

  public getPickupLabel(): string {
    return this._pickupLabel;
  }

  public getDropoffLabel(): string {
    return this._dropoffLabel;
  }

  public getFare(): number {
    return this._fare;
  }

  public getRideType(): RideType {
    return this._rideType;
  }

  public getDistanceKm(): number {
    return this._distanceKm;
  }

  public getStatus(): TripStatus {
    return this._status;
  }

  public getStateLabel(): string {
    return this._currentState.label;
  }

  public getCreatedAt(): string {
    return this._createdAt;
  }

  public getObserversCount(): number {
    return this._observers.length;
  }

  public setState(state: TripState): void {
    this._currentState = state;
  }

  public setStatus(status: TripStatus): void {
    this._status = status;
  }

  public setDriver(driver: Driver): void {
    this._driver = driver;
  }

  public toString(): string {
    return `Trip [id=${this._id.slice(0, 8)}, status=${this._status}, fare=$${this._fare.toFixed(2)}]`;
  }
}
