import {Driver} from './driver';
import {
  type DriverMatchingStrategy,
  NearestDriverMatchingStrategy,
} from './driverMatchingStrategy';
import {DriverStatus, RideType, TripStatus} from './enums';
import {domainLogger} from './eventBus';
import {Location} from './location';
import {type PricingStrategy, VehicleBasedPricingStrategy} from './pricingStrategy';
import {Rider} from './rider';
import {Trip} from './trip';
import {Vehicle} from './vehicle';

const DRIVER_NAMES = [
  'Bob Vance',
  'Charlie Rao',
  'David Chen',
  'Elena Vance',
  'Farhan Ali',
  'Grace Kim',
  'Hector Silva',
  'Isha Patel',
  'Jonas Berg',
  'Kavya Nair',
  'Liam O’Connor',
  'Maya Lin',
  'Nikhil Verma',
  'Omar Farooq',
  'Priya Menon',
];

const RIDER_NAMES = [
  'Alice Mercer',
  'Harry Potter',
  'Sophia Gupta',
  'Marcus Cole',
  'Zara Khan',
  'Lucas Meyer',
  'Ananya Roy',
  'Devon Brooks',
  'Clara Novak',
  'Rohan Das',
];

const VEHICLE_CATALOG: Record<RideType, string[]> = {
  [RideType.SEDAN]: ['Toyota Prius', 'Honda City', 'Hyundai Verna', 'Skoda Octavia'],
  [RideType.SUV]: ['Honda CR-V', 'Toyota Fortuner', 'Kia Telluride', 'Volvo XC60'],
  [RideType.AUTO]: ['Bajaj RE Compact', 'TVS King Deluxe', 'Piaggio Ape City'],
};

function randomPhone(): string {
  const a = Math.floor(100 + Math.random() * 900);
  const b = Math.floor(100 + Math.random() * 900);
  const c = Math.floor(1000 + Math.random() * 9000);
  return `${a}-${b}-${c}`;
}

function randomPlate(index: number): string {
  const series = ['KA01', 'KA02', 'KA03', 'KA05', 'DL04', 'MH12', 'CA09'];
  const prefix = series[index % series.length];
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const l1 = letters[Math.floor(Math.random() * letters.length)];
  const l2 = letters[Math.floor(Math.random() * letters.length)];
  const num = Math.floor(1000 + Math.random() * 8999);
  return `${prefix}-${l1}${l2}-${num}`;
}

/**
 * Generates a realistic random coordinate within minKm..maxKm of center.
 */
export function randomNearbyLocation(center: Location, minKm = 0.35, maxKm = 3.8): Location {
  const distanceKm = minKm + Math.random() * (maxKm - minKm);
  const bearing = Math.random() * 2 * Math.PI;
  const latDegPerKm = 1 / 110.574;
  const lngDegPerKm = 1 / (111.32 * Math.max(0.2, Math.cos((center.getLatitude() * Math.PI) / 180)));

  const dLat = distanceKm * Math.cos(bearing) * latDegPerKm;
  const dLng = distanceKm * Math.sin(bearing) * lngDegPerKm;

  return new Location(center.getLatitude() + dLat, center.getLongitude() + dLng);
}

type ChangeListener = () => void;

export class RideSharingService {
  private static _instance: RideSharingService | null = null;

  private _riders: Record<string, Rider> = {};
  private _drivers: Record<string, Driver> = {};
  private _trips: Record<string, Trip> = {};
  private _pricingStrategy: PricingStrategy;
  private _driverMatchingStrategy: DriverMatchingStrategy;
  private _listeners: Set<ChangeListener> = new Set();
  private _spawnCounter = 0;

  private constructor() {
    this._pricingStrategy = new VehicleBasedPricingStrategy();
    this._driverMatchingStrategy = new NearestDriverMatchingStrategy(5.0);
  }

  public static getInstance(): RideSharingService {
    if (RideSharingService._instance === null) {
      RideSharingService._instance = new RideSharingService();
    }
    return RideSharingService._instance;
  }

  public subscribe(listener: ChangeListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private _emitChange(): void {
    this._listeners.forEach((listener) => listener());
  }

  public notifyUiRefresh(): void {
    this._emitChange();
  }

  public setPricingStrategy(pricingStrategy: PricingStrategy): void {
    this._pricingStrategy = pricingStrategy;
    domainLogger.emit('STRATEGY', 'Pricing Strategy Updated', [
      `Active strategy: ${pricingStrategy.name}`,
      pricingStrategy.summary,
    ]);
    this._emitChange();
  }

  public getPricingStrategy(): PricingStrategy {
    return this._pricingStrategy;
  }

  public setDriverMatchingStrategy(driverMatchingStrategy: DriverMatchingStrategy): void {
    this._driverMatchingStrategy = driverMatchingStrategy;
    domainLogger.emit('STRATEGY', 'Driver Matching Strategy Updated', [
      `Active strategy: ${driverMatchingStrategy.name} (max radius ${driverMatchingStrategy.maxDistanceKm.toFixed(1)} km)`,
    ]);
    this._emitChange();
  }

  public getDriverMatchingStrategy(): DriverMatchingStrategy {
    return this._driverMatchingStrategy;
  }

  public registerRider(name: string, contact: string, initialLocation?: Location): Rider {
    const rider = new Rider(name, contact, initialLocation);
    this._riders[rider.getId()] = rider;
    this._emitChange();
    return rider;
  }

  public registerDriver(
    name: string,
    contact: string,
    vehicle: Vehicle,
    initialLocation: Location,
    initialStatus: DriverStatus = DriverStatus.OFFLINE
  ): Driver {
    const driver = new Driver(name, contact, vehicle, initialLocation);
    this._drivers[driver.getId()] = driver;
    if (initialStatus !== DriverStatus.OFFLINE) {
      driver.setStatus(initialStatus);
    }
    this._emitChange();
    return driver;
  }

  public setDriverStatus(driverId: string, status: DriverStatus): void {
    const driver = this._drivers[driverId];
    if (!driver) return;
    if (driver.getStatus() === DriverStatus.IN_TRIP && status !== DriverStatus.IN_TRIP) {
      domainLogger.emit('WARNING', 'Driver Busy', [
        `${driver.getName()} is currently IN_TRIP and cannot switch to ${status} until trip ends.`,
      ]);
      return;
    }
    driver.setStatus(status);
    this._emitChange();
  }

  public estimateFare(
    pickup: Location,
    dropoff: Location,
    rideType: RideType,
    roadDistanceKm?: number
  ): number {
    return this._pricingStrategy.calculateFare(pickup, dropoff, rideType, roadDistanceKm);
  }

  public previewMatchingDrivers(pickup: Location, rideType: RideType): Driver[] {
    const allDrivers = Object.values(this._drivers);
    const matches = allDrivers.filter(
      (driver) =>
        driver.getStatus() === DriverStatus.ONLINE &&
        driver.getVehicle().getType() === rideType &&
        pickup.distanceTo(driver.getCurrentLocation()) <= this._driverMatchingStrategy.maxDistanceKm
    );
    matches.sort(
      (a, b) => pickup.distanceTo(a.getCurrentLocation()) - pickup.distanceTo(b.getCurrentLocation())
    );
    return matches;
  }

  public requestRide(
    riderId: string,
    pickup: Location,
    dropoff: Location,
    rideType: RideType,
    options?: {
      pickupLabel?: string;
      dropoffLabel?: string;
      roadDistanceKm?: number;
    }
  ): Trip | null {
    const rider = this._riders[riderId];
    if (!rider) {
      throw new Error('Rider not found');
    }

    rider.setCurrentLocation(pickup);

    domainLogger.emit('SERVICE', `New Ride Request from ${rider.getName()}`, [
      `Type: ${rideType} · Pickup: ${options?.pickupLabel ?? pickup.toString()}`,
    ]);

    // 1. Find available drivers using active matching strategy
    const availableDrivers = this._driverMatchingStrategy.findDrivers(
      Object.values(this._drivers),
      pickup,
      rideType
    );

    if (availableDrivers.length === 0) {
      domainLogger.emit('WARNING', 'No Drivers Available', [
        `No ONLINE ${rideType} drivers found within ${this._driverMatchingStrategy.maxDistanceKm.toFixed(1)} km. Try increasing radius or spawning more drivers.`,
      ]);
      this._emitChange();
      return null;
    }

    const distanceKm = options?.roadDistanceKm ?? pickup.distanceTo(dropoff);
    // 2. Calculate fare using active pricing strategy
    const fare = this._pricingStrategy.calculateFare(pickup, dropoff, rideType, distanceKm);

    domainLogger.emit('SERVICE', `Matched ${availableDrivers.length} Available Driver(s)`, [
      `Estimated fare (${this._pricingStrategy.name}): $${fare.toFixed(2)} for ${distanceKm.toFixed(2)} km`,
    ]);

    // 3. Build trip using Trip.TripBuilder
    const trip = new Trip.TripBuilder()
      .withRider(rider)
      .withPickupLocation(pickup, options?.pickupLabel)
      .withDropoffLocation(dropoff, options?.dropoffLabel)
      .withRideType(rideType)
      .withDistanceKm(distanceKm)
      .withFare(fare)
      .build();

    trip.setNotifiedDriverIds(availableDrivers.map((d) => d.getId()));
    this._trips[trip.getId()] = trip;

    // 4. Notify nearby drivers
    for (const driver of availableDrivers) {
      driver.onUpdate(trip);
    }

    this._emitChange();
    return trip;
  }

  public acceptRide(driverId: string, tripId: string): boolean {
    const driver = this._drivers[driverId];
    const trip = this._trips[tripId];
    if (!driver || !trip) {
      throw new Error('Driver or Trip not found');
    }

    if (trip.getStatus() !== TripStatus.REQUESTED) {
      trip.assignDriver(driver); // triggers state error log cleanly
      this._emitChange();
      return false;
    }

    if (driver.getStatus() !== DriverStatus.ONLINE) {
      domainLogger.emit('WARNING', 'Driver Unavailable', [
        `${driver.getName()} is ${driver.getStatus()} and cannot accept trip ${tripId.slice(0, 8)}.`,
      ]);
      this._emitChange();
      return false;
    }

    domainLogger.emit('SERVICE', `Driver ${driver.getName()} Accepted Ride`, [
      `Vehicle: ${driver.getVehicle().getModel()} (${driver.getVehicle().getLicenseNumber()})`,
    ], tripId);

    driver.setStatus(DriverStatus.IN_TRIP);
    trip.assignDriver(driver);
    this._emitChange();
    return true;
  }

  public startTrip(tripId: string): void {
    const trip = this._trips[tripId];
    if (!trip) {
      throw new Error('Trip not found');
    }
    domainLogger.emit('SERVICE', `Trip ${trip.getId().slice(0, 8)} Starting`, [
      `Rider ${trip.getRider().getName()} onboard with ${trip.getDriver()?.getName() ?? 'driver'}.`,
    ], tripId);
    trip.startTrip();
    this._emitChange();
  }

  public endTrip(tripId: string): void {
    const trip = this._trips[tripId];
    if (!trip) {
      throw new Error('Trip not found');
    }

    const wasInProgress = trip.getStatus() === TripStatus.IN_PROGRESS;
    domainLogger.emit('SERVICE', `Trip ${trip.getId().slice(0, 8)} Ending`, [
      `Final fare: $${trip.getFare().toFixed(2)}`,
    ], tripId);

    trip.endTrip();

    if (wasInProgress) {
      const driver = trip.getDriver();
      const rider = trip.getRider();
      if (driver) {
        driver.setStatus(DriverStatus.ONLINE);
        driver.setCurrentLocation(trip.getDropoffLocation());
        driver.addTripToHistory(trip);
        domainLogger.emit(
          'SERVICE',
          `Driver ${driver.getName()} Back Online`,
          [`Now available at ${driver.getCurrentLocation().toString()}`],
          tripId
        );
      }
      rider.setCurrentLocation(trip.getDropoffLocation());
      rider.addTripToHistory(trip);
    }

    this._emitChange();
  }

  public cancelTrip(tripId: string): void {
    const trip = this._trips[tripId];
    if (!trip) {
      throw new Error('Trip not found');
    }
    const prevStatus = trip.getStatus();
    const driver = trip.getDriver();
    trip.cancelTrip();

    if ((prevStatus === TripStatus.ASSIGNED || prevStatus === TripStatus.REQUESTED) && driver) {
      driver.setStatus(DriverStatus.ONLINE);
    }
    this._emitChange();
  }

  public spawnRandomFleet(center: Location, driverCount = 9, riderCount = 5): void {
    const rideTypes = [RideType.SEDAN, RideType.SUV, RideType.AUTO];
    const baseIdx = this._spawnCounter;

    for (let i = 0; i < driverCount; i++) {
      const idx = baseIdx + i;
      const rideType = rideTypes[idx % rideTypes.length];
      const models = VEHICLE_CATALOG[rideType];
      const model = models[idx % models.length];
      const name = DRIVER_NAMES[idx % DRIVER_NAMES.length];
      const suffix = idx >= DRIVER_NAMES.length ? ` #${Math.floor(idx / DRIVER_NAMES.length) + 1}` : '';
      const vehicle = new Vehicle(randomPlate(idx), model, rideType);
      const loc = randomNearbyLocation(center, 0.3, 3.6);
      // Ensure most spawned drivers start ONLINE so matching works immediately, with ~20% OFFLINE
      const status = i % 5 === 4 ? DriverStatus.OFFLINE : DriverStatus.ONLINE;
      const driver = new Driver(`${name}${suffix}`, randomPhone(), vehicle, loc);
      driver.setStatus(status);
      this._drivers[driver.getId()] = driver;
    }

    for (let j = 0; j < riderCount; j++) {
      const rIdx = baseIdx + j;
      const rName = RIDER_NAMES[rIdx % RIDER_NAMES.length];
      const suffix = rIdx >= RIDER_NAMES.length ? ` #${Math.floor(rIdx / RIDER_NAMES.length) + 1}` : '';
      const loc = randomNearbyLocation(center, 0.2, 2.8);
      const rider = new Rider(`${rName}${suffix}`, randomPhone(), loc);
      this._riders[rider.getId()] = rider;
    }

    this._spawnCounter += Math.max(driverCount, riderCount);

    domainLogger.emit('SERVICE', `Spawned Fleet in Locality`, [
      `Added ${driverCount} drivers (Sedan/SUV/Auto) and ${riderCount} riders around ${center.toString()}.`,
    ]);
    this._emitChange();
  }

  public resetFleet(center: Location): void {
    this._riders = {};
    this._drivers = {};
    this._trips = {};
    this._spawnCounter = 0;
    domainLogger.clear();
    domainLogger.emit('SERVICE', 'Simulation Reset', [
      `Cleared previous fleet and re-seeded locality around ${center.toString()}.`,
    ]);
    this.spawnRandomFleet(center, 9, 5);
  }

  public getRiders(): Rider[] {
    return Object.values(this._riders);
  }

  public getDrivers(): Driver[] {
    return Object.values(this._drivers);
  }

  public getTrips(): Trip[] {
    return Object.values(this._trips).reverse();
  }

  public getTripById(id: string): Trip | undefined {
    return this._trips[id];
  }

  public getRiderById(id: string): Rider | undefined {
    return this._riders[id];
  }

  public getDriverById(id: string): Driver | undefined {
    return this._drivers[id];
  }
}
