import {RideType} from './enums';
import {Location} from './location';

export interface PricingStrategy {
  readonly id: 'vehicle' | 'flat';
  readonly name: string;
  readonly summary: string;
  calculateFare(pickup: Location, dropoff: Location, rideType: RideType, overrideDistanceKm?: number): number;
}

export class FlatRatePricingStrategy implements PricingStrategy {
  public static readonly BASE_FARE = 5.0;
  public static readonly FLAT_RATE = 1.5;

  public readonly id = 'flat' as const;
  public readonly name = 'FlatRatePricingStrategy';
  public readonly summary = '$5.00 base + $1.50/km across all vehicle types';

  public calculateFare(
    pickup: Location,
    dropoff: Location,
    _rideType: RideType,
    overrideDistanceKm?: number
  ): number {
    const distance = overrideDistanceKm ?? pickup.distanceTo(dropoff);
    return FlatRatePricingStrategy.BASE_FARE + distance * FlatRatePricingStrategy.FLAT_RATE;
  }
}

export class VehicleBasedPricingStrategy implements PricingStrategy {
  public static readonly BASE_FARE = 2.5;
  public static readonly RATE_PER_KM: Record<RideType, number> = {
    [RideType.SEDAN]: 1.5,
    [RideType.SUV]: 2.0,
    [RideType.AUTO]: 1.0,
  };

  public readonly id = 'vehicle' as const;
  public readonly name = 'VehicleBasedPricingStrategy';
  public readonly summary = '$2.50 base + $1.00 (Auto) / $1.50 (Sedan) / $2.00 (SUV) per km';

  public calculateFare(
    pickup: Location,
    dropoff: Location,
    rideType: RideType,
    overrideDistanceKm?: number
  ): number {
    const distance = overrideDistanceKm ?? pickup.distanceTo(dropoff);
    return VehicleBasedPricingStrategy.BASE_FARE + VehicleBasedPricingStrategy.RATE_PER_KM[rideType] * distance;
  }
}
