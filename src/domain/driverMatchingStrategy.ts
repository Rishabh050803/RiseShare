import type {Driver} from './driver';
import {DriverStatus, RideType} from './enums';
import {domainLogger} from './eventBus';
import {Location} from './location';

export interface DriverMatchingStrategy {
  readonly name: string;
  readonly maxDistanceKm: number;
  findDrivers(allDrivers: Driver[], pickupLocation: Location, rideType: RideType): Driver[];
}

export class NearestDriverMatchingStrategy implements DriverMatchingStrategy {
  public readonly name = 'NearestDriverMatchingStrategy';
  public maxDistanceKm: number;

  constructor(maxDistanceKm = 5.0) {
    this.maxDistanceKm = maxDistanceKm;
  }

  public findDrivers(allDrivers: Driver[], pickupLocation: Location, rideType: RideType): Driver[] {
    domainLogger.emit('STRATEGY', `NearestDriverMatchingStrategy`, [
      `Finding nearest drivers for ride type: ${rideType} within ${this.maxDistanceKm.toFixed(1)} km`,
    ]);

    const availableDrivers = allDrivers.filter(
      (driver) =>
        driver.getStatus() === DriverStatus.ONLINE &&
        driver.getVehicle().getType() === rideType &&
        pickupLocation.distanceTo(driver.getCurrentLocation()) <= this.maxDistanceKm
    );

    availableDrivers.sort(
      (a, b) =>
        pickupLocation.distanceTo(a.getCurrentLocation()) -
        pickupLocation.distanceTo(b.getCurrentLocation())
    );

    return availableDrivers;
  }
}
