import {domainLogger} from './eventBus';
import {Location} from './location';
import type {Trip} from './trip';
import {User} from './user';

export class Rider extends User {
  private _currentLocation: Location;

  constructor(name: string, contact: string, initialLocation?: Location) {
    super(name, contact);
    this._currentLocation = initialLocation ?? new Location(0, 0);
  }

  public getCurrentLocation(): Location {
    return this._currentLocation;
  }

  public setCurrentLocation(location: Location): void {
    this._currentLocation = location;
  }

  public onUpdate(trip: Trip): void {
    const driver = trip.getDriver();
    const lines = [`Trip ${trip.getId().slice(0, 8)} is now ${trip.getStatus()}.`];
    if (driver !== null) {
      lines.push(
        `Driver: ${driver.getName()} in a ${driver.getVehicle().getModel()} (${driver.getVehicle().getLicenseNumber()})`
      );
    }
    domainLogger.emit('RIDER', `Notification for Rider ${this.getName()}`, lines, trip.getId());
  }
}
