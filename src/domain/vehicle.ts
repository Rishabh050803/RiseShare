import {RideType} from './enums';

export class Vehicle {
  private _licenseNumber: string;
  private _model: string;
  private _type: RideType;

  constructor(licenseNumber: string, model: string, vehicleType: RideType) {
    this._licenseNumber = licenseNumber;
    this._model = model;
    this._type = vehicleType;
  }

  public getLicenseNumber(): string {
    return this._licenseNumber;
  }

  public getModel(): string {
    return this._model;
  }

  public getType(): RideType {
    return this._type;
  }
}
