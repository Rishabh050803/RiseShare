import {DriverStatus, TripStatus} from './enums';
import {domainLogger} from './eventBus';
import {Location} from './location';
import type {Trip} from './trip';
import {User} from './user';
import {Vehicle} from './vehicle';

export class Driver extends User {
  private _vehicle: Vehicle;
  private _currentLocation: Location;
  private _status: DriverStatus;

  constructor(name: string, contact: string, vehicle: Vehicle, initialLocation: Location) {
    super(name, contact);
    this._vehicle = vehicle;
    this._currentLocation = initialLocation;
    this._status = DriverStatus.OFFLINE; // Default status matching driver.py
  }

  public getVehicle(): Vehicle {
    return this._vehicle;
  }

  public getStatus(): DriverStatus {
    return this._status;
  }

  public setStatus(status: DriverStatus): void {
    this._status = status;
    domainLogger.emit('DRIVER', `Driver ${this.getName()} status changed`, [
      `Driver ${this.getName()} is now ${status}`,
    ]);
  }

  public getCurrentLocation(): Location {
    return this._currentLocation;
  }

  public setCurrentLocation(currentLocation: Location): void {
    this._currentLocation = currentLocation;
  }

  public onUpdate(trip: Trip): void {
    const lines = [`Trip ${trip.getId().slice(0, 8)} status: ${trip.getStatus()}.`];
    if (trip.getStatus() === TripStatus.REQUESTED) {
      lines.push('A new ride is available for you to accept.');
    }
    domainLogger.emit('DRIVER', `Notification for Driver ${this.getName()}`, lines, trip.getId());
  }
}
