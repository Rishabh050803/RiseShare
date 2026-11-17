import type {Driver} from './driver';
import {TripStatus} from './enums';
import {domainLogger} from './eventBus';
import type {Trip} from './trip';

export interface TripState {
  readonly label: string;
  request(trip: Trip): void;
  assign(trip: Trip, driver: Driver): void;
  start(trip: Trip): void;
  end(trip: Trip): void;
  cancel(trip: Trip): void;
}

export class RequestedState implements TripState {
  public readonly label = 'RequestedState';

  public request(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Trip is already in requested state.'], trip.getId());
  }

  public assign(trip: Trip, driver: Driver): void {
    trip.setDriver(driver);
    trip.setStatus(TripStatus.ASSIGNED);
    trip.setState(new AssignedState());
    domainLogger.emit(
      'STATE',
      'State Transition: Requested -> Assigned',
      [`Assigned driver ${driver.getName()} (${driver.getVehicle().getLicenseNumber()})`],
      trip.getId()
    );
  }

  public start(trip: Trip): void {
    domainLogger.emit(
      'WARNING',
      'Invalid State Transition',
      ['Cannot start a trip that has not been assigned a driver.'],
      trip.getId()
    );
  }

  public end(trip: Trip): void {
    domainLogger.emit(
      'WARNING',
      'Invalid State Transition',
      ['Cannot end a trip that has not been assigned a driver.'],
      trip.getId()
    );
  }

  public cancel(trip: Trip): void {
    trip.setStatus(TripStatus.CANCELLED);
    trip.setState(new CancelledState());
    domainLogger.emit('STATE', 'State Transition: Requested -> Cancelled', ['Trip request cancelled by dispatch.'], trip.getId());
  }
}

export class AssignedState implements TripState {
  public readonly label = 'AssignedState';

  public request(trip: Trip): void {
    domainLogger.emit(
      'WARNING',
      'Invalid State Transition',
      ['Trip has already been requested and assigned.'],
      trip.getId()
    );
  }

  public assign(trip: Trip): void {
    domainLogger.emit(
      'WARNING',
      'Invalid State Transition',
      ['Trip is already assigned. To re-assign, cancel first.'],
      trip.getId()
    );
  }

  public start(trip: Trip): void {
    trip.setStatus(TripStatus.IN_PROGRESS);
    trip.setState(new InProgressState());
    domainLogger.emit('STATE', 'State Transition: Assigned -> InProgress', ['Rider picked up; trip is now in progress.'], trip.getId());
  }

  public end(trip: Trip): void {
    domainLogger.emit(
      'WARNING',
      'Invalid State Transition',
      ['Cannot end a trip that has not started.'],
      trip.getId()
    );
  }

  public cancel(trip: Trip): void {
    trip.setStatus(TripStatus.CANCELLED);
    trip.setState(new CancelledState());
    domainLogger.emit('STATE', 'State Transition: Assigned -> Cancelled', ['Assigned trip was cancelled.'], trip.getId());
  }
}

export class InProgressState implements TripState {
  public readonly label = 'InProgressState';

  public request(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Trip is already in progress.'], trip.getId());
  }

  public assign(trip: Trip): void {
    domainLogger.emit(
      'WARNING',
      'Invalid State Transition',
      ['Cannot assign a new driver while trip is in progress.'],
      trip.getId()
    );
  }

  public start(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Trip is already in progress.'], trip.getId());
  }

  public end(trip: Trip): void {
    trip.setStatus(TripStatus.COMPLETED);
    trip.setState(new CompletedState());
    domainLogger.emit('STATE', 'State Transition: InProgress -> Completed', ['Arrived at dropoff; trip completed.'], trip.getId());
  }

  public cancel(trip: Trip): void {
    domainLogger.emit(
      'WARNING',
      'Invalid State Transition',
      ['Cannot cancel a trip that is already in progress. End the trip instead.'],
      trip.getId()
    );
  }
}

export class CompletedState implements TripState {
  public readonly label = 'CompletedState';

  public request(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Cannot request a trip that is already completed.'], trip.getId());
  }

  public assign(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Cannot assign a driver to a completed trip.'], trip.getId());
  }

  public start(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Cannot start a completed trip.'], trip.getId());
  }

  public end(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Trip is already completed.'], trip.getId());
  }

  public cancel(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Cannot cancel a completed trip.'], trip.getId());
  }
}

export class CancelledState implements TripState {
  public readonly label = 'CancelledState';

  public request(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Trip is already cancelled.'], trip.getId());
  }

  public assign(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Cannot assign a driver to a cancelled trip.'], trip.getId());
  }

  public start(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Cannot start a cancelled trip.'], trip.getId());
  }

  public end(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Cannot end a cancelled trip.'], trip.getId());
  }

  public cancel(trip: Trip): void {
    domainLogger.emit('WARNING', 'Invalid State Transition', ['Trip is already cancelled.'], trip.getId());
  }
}
