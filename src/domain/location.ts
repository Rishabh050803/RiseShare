export class Location {
  private _latitude: number;
  private _longitude: number;

  constructor(latitude: number, longitude: number) {
    this._latitude = latitude;
    this._longitude = longitude;
  }

  public getLatitude(): number {
    return this._latitude;
  }

  public getLongitude(): number {
    return this._longitude;
  }

  public toLatLng(): google.maps.LatLngLiteral {
    return {lat: this._latitude, lng: this._longitude};
  }

  /**
   * Computes real-world surface distance in kilometers (Haversine formula)
   * so NearestDriverMatchingStrategy (MAX_DISTANCE_KM) and PricingStrategy
   * behave accurately across any real-world locality.
   */
  public distanceTo(other: Location): number {
    const R = 6371.0; // Earth radius in km
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(other._latitude - this._latitude);
    const dLng = toRad(other._longitude - this._longitude);
    const lat1 = toRad(this._latitude);
    const lat2 = toRad(other._latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  public toString(): string {
    return `Location(${this._latitude.toFixed(4)}, ${this._longitude.toFixed(4)})`;
  }
}
