import {
  ArrowRight,
  Car,
  CheckCircle2,
  Crosshair,
  Locate,
  Navigation,
  Plus,
  Shuffle,
  Sliders,
  UserPlus,
  XCircle,
} from 'lucide-react';
import React, {useState} from 'react';
import type {Driver} from '../domain/driver';
import {NearestDriverMatchingStrategy} from '../domain/driverMatchingStrategy';
import {DriverStatus, RideType, TripStatus} from '../domain/enums';
import {Location} from '../domain/location';
import {
  FlatRatePricingStrategy,
  type PricingStrategy,
  VehicleBasedPricingStrategy,
} from '../domain/pricingStrategy';
import type {Rider} from '../domain/rider';
import {randomNearbyLocation, type RideSharingService} from '../domain/rideSharingService';
import type {Trip} from '../domain/trip';
import {Vehicle} from '../domain/vehicle';
import {PlaceSearchInput, type SelectedPlaceResult} from './PlaceSearchInput';
import type {ComputedRouteData} from './RouteLayer';
import type {MapPickMode} from './SimulationMap';

interface DispatchPanelProps {
  service: RideSharingService;
  mapCenter: google.maps.LatLngLiteral;
  riders: Rider[];
  drivers: Driver[];
  selectedRiderId: string;
  onSelectRiderId: (id: string) => void;
  pickupLocation: Location | null;
  pickupLabel: string;
  dropoffLocation: Location | null;
  dropoffLabel: string;
  onSetPickup: (loc: Location, label: string) => void;
  onSetDropoff: (loc: Location, label: string) => void;
  pickMode: MapPickMode;
  onSetPickMode: (mode: MapPickMode) => void;
  selectedRideType: RideType;
  onSelectRideType: (type: RideType) => void;
  tripRouteData: ComputedRouteData | null;
  onUseGpsPickup: () => void;
  activeTrip: Trip | null;
  onActiveTripChange: (trip: Trip | null) => void;
  autoAnimate: boolean;
  onToggleAutoAnimate: (val: boolean) => void;
  autoProgress: boolean;
  onToggleAutoProgress: (val: boolean) => void;
  pricingStrategy: PricingStrategy;
  matchingStrategyRadius: number;
  onSpawnExtraFleet: () => void;
}

type LeftTab = 'dispatch' | 'fleet' | 'strategies';

const RIDE_OPTIONS: {type: RideType; title: string; subtitle: string}[] = [
  {type: RideType.AUTO, title: 'Auto', subtitle: 'Open 3-wheeler · Compact city hops'},
  {type: RideType.SEDAN, title: 'Sedan', subtitle: '4-seat comfort · Everyday rides'},
  {type: RideType.SUV, title: 'SUV', subtitle: '6-seat spacious · Extra luggage'},
];

export const DispatchPanel: React.FC<DispatchPanelProps> = ({
  service,
  mapCenter,
  riders,
  drivers,
  selectedRiderId,
  onSelectRiderId,
  pickupLocation,
  pickupLabel,
  dropoffLocation,
  dropoffLabel,
  onSetPickup,
  onSetDropoff,
  pickMode,
  onSetPickMode,
  selectedRideType,
  onSelectRideType,
  tripRouteData,
  onUseGpsPickup,
  activeTrip,
  onActiveTripChange,
  autoAnimate,
  onToggleAutoAnimate,
  autoProgress,
  onToggleAutoProgress,
  pricingStrategy,
  matchingStrategyRadius,
  onSpawnExtraFleet,
}) => {
  const [activeTab, setActiveTab] = useState<LeftTab>('dispatch');
  const [requestError, setRequestError] = useState<string | null>(null);

  // Quick Add Rider inline state
  const [showAddRider, setShowAddRider] = useState(false);
  const [newRiderName, setNewRiderName] = useState('');
  const [newRiderContact, setNewRiderContact] = useState('');

  // Custom Driver registration state
  const [drvName, setDrvName] = useState('');
  const [drvContact, setDrvContact] = useState('');
  const [drvModel, setDrvModel] = useState('Toyota Camry');
  const [drvPlate, setDrvPlate] = useState('KA01-9921');
  const [drvType, setDrvType] = useState<RideType>(RideType.SEDAN);
  const [drvOnline, setDrvOnline] = useState(true);

  const selectedRider = riders.find((r) => r.getId() === selectedRiderId) ?? riders[0] ?? null;

  const estimatedDistanceKm =
    tripRouteData && tripRouteData.distanceKm > 0
      ? tripRouteData.distanceKm
      : pickupLocation && dropoffLocation
        ? pickupLocation.distanceTo(dropoffLocation)
        : 0;

  const matchedDriversPreview =
    pickupLocation ? service.previewMatchingDrivers(pickupLocation, selectedRideType) : [];

  const handlePlacePickup = (res: SelectedPlaceResult) => {
    onSetPickup(new Location(res.lat, res.lng), res.label);
    setRequestError(null);
  };

  const handlePlaceDropoff = (res: SelectedPlaceResult) => {
    onSetDropoff(new Location(res.lat, res.lng), res.label);
    setRequestError(null);
  };

  const handleRandomRoutePair = () => {
    const centerLoc = new Location(mapCenter.lat, mapCenter.lng);
    const pLoc = selectedRider
      ? selectedRider.getCurrentLocation()
      : randomNearbyLocation(centerLoc, 0.3, 1.8);
    const dLoc = randomNearbyLocation(centerLoc, 1.5, 4.2);
    onSetPickup(pLoc, `Locality Pt (${pLoc.getLatitude().toFixed(3)}, ${pLoc.getLongitude().toFixed(3)})`);
    onSetDropoff(dLoc, `Dest Pt (${dLoc.getLatitude().toFixed(3)}, ${dLoc.getLongitude().toFixed(3)})`);
    setRequestError(null);
  };

  const handleRequestRide = () => {
    if (!selectedRider) {
      setRequestError('Please register or select a rider first.');
      return;
    }
    if (!pickupLocation || !dropoffLocation) {
      setRequestError('Select both pickup and dropoff locations.');
      return;
    }

    const trip = service.requestRide(
      selectedRider.getId(),
      pickupLocation,
      dropoffLocation,
      selectedRideType,
      {
        pickupLabel,
        dropoffLabel,
        roadDistanceKm: tripRouteData?.distanceKm,
      }
    );

    if (!trip) {
      setRequestError(
        `No ONLINE ${selectedRideType} drivers within ${matchingStrategyRadius.toFixed(1)} km. Try spawning more drivers or increasing the matching radius.`
      );
      return;
    }

    setRequestError(null);
    onActiveTripChange(trip);
  };

  const handleAddRider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRiderName.trim()) return;
    const centerLoc = new Location(mapCenter.lat, mapCenter.lng);
    const riderLoc = randomNearbyLocation(centerLoc, 0.2, 2.0);
    const created = service.registerRider(
      newRiderName.trim(),
      newRiderContact.trim() || '555-0199',
      riderLoc
    );
    onSelectRiderId(created.getId());
    setNewRiderName('');
    setNewRiderContact('');
    setShowAddRider(false);
  };

  const handleAddDriver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!drvName.trim()) return;
    const centerLoc = new Location(mapCenter.lat, mapCenter.lng);
    const loc = randomNearbyLocation(centerLoc, 0.25, 2.2);
    service.registerDriver(
      drvName.trim(),
      drvContact.trim() || '555-0142',
      new Vehicle(drvPlate.trim() || 'KA01-1010', drvModel.trim() || 'Sedan', drvType),
      loc,
      drvOnline ? DriverStatus.ONLINE : DriverStatus.OFFLINE
    );
    setDrvName('');
    setDrvContact('');
  };

  const handleSpawnMatchingDriver = () => {
    const anchor = pickupLocation ?? new Location(mapCenter.lat, mapCenter.lng);
    const loc = randomNearbyLocation(anchor, 0.2, Math.max(0.8, matchingStrategyRadius * 0.6));
    const models: Record<RideType, string> = {
      [RideType.SEDAN]: 'Toyota Prius',
      [RideType.SUV]: 'Honda CR-V',
      [RideType.AUTO]: 'Bajaj RE Compact',
    };
    service.registerDriver(
      `Dispatch ${selectedRideType} ${drivers.length + 1}`,
      '555-8821',
      new Vehicle(`KA09-${Math.floor(1000 + Math.random() * 8999)}`, models[selectedRideType], selectedRideType),
      loc,
      DriverStatus.ONLINE
    );
    setRequestError(null);
  };

  const notifiedDriversForActiveTrip =
    activeTrip && activeTrip.getStatus() === TripStatus.REQUESTED
      ? activeTrip
          .getNotifiedDriverIds()
          .map((id) => service.getDriverById(id))
          .filter((d): d is Driver => Boolean(d))
      : [];

  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-800/90 bg-[#0D1320]">
      {/* Segmented Control */}
      <div className="border-b border-slate-800/90 p-3">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#080C15] p-1 border border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('dispatch')}
            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'dispatch'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ride Dispatch
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('fleet')}
            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'fleet'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Driver & Fleet
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('strategies')}
            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'strategies'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Strategies
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'dispatch' && (
          <>
            {/* Rider Selection */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">Active Rider</label>
                <button
                  type="button"
                  onClick={() => setShowAddRider((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <UserPlus className="h-3 w-3" />
                  {showAddRider ? 'Close' : 'New Rider'}
                </button>
              </div>

              <select
                value={selectedRider?.getId() ?? ''}
                onChange={(e) => onSelectRiderId(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-700/80 bg-[#0B111E] px-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                {riders.length === 0 && <option value="">No riders spawned</option>}
                {riders.map((rider) => (
                  <option key={rider.getId()} value={rider.getId()}>
                    {rider.getName()} ({rider.getTripHistory().length} trips)
                  </option>
                ))}
              </select>

              {showAddRider && (
                <form
                  onSubmit={handleAddRider}
                  className="space-y-2 rounded-lg border border-slate-800 bg-[#0B111E] p-2.5"
                >
                  <input
                    type="text"
                    placeholder="Rider full name"
                    value={newRiderName}
                    onChange={(e) => setNewRiderName(e.target.value)}
                    className="h-8 w-full rounded border border-slate-700 bg-[#0F172A] px-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Contact (optional)"
                      value={newRiderContact}
                      onChange={(e) => setNewRiderContact(e.target.value)}
                      className="h-8 flex-1 rounded border border-slate-700 bg-[#0F172A] px-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded bg-sky-500 px-3 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap"
                    >
                      Register
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* Pickup & Dropoff Coordinates */}
            <section className="space-y-2.5 border-t border-slate-800/80 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Route Coordinates</span>
                <button
                  type="button"
                  onClick={handleRandomRoutePair}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-sky-400 transition-colors"
                >
                  <Shuffle className="h-3 w-3" />
                  Random Local Pair
                </button>
              </div>

              {/* Pickup Input */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    <PlaceSearchInput
                      placeholder="Search pickup address..."
                      valueLabel={pickupLabel}
                      locationBias={mapCenter}
                      onSelect={handlePlacePickup}
                      compact
                      accentIcon="pickup"
                    />
                  </div>
                  <button
                    type="button"
                    title="Use my current GPS location as pickup"
                    onClick={onUseGpsPickup}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-[#0B111E] text-cyan-400 hover:border-cyan-400/60 hover:text-cyan-300 transition-colors"
                  >
                    <Locate className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Pick pickup on map"
                    onClick={() => onSetPickMode(pickMode === 'pickup' ? 'none' : 'pickup')}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      pickMode === 'pickup'
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                        : 'border-slate-700/80 bg-[#0B111E] text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </button>
                </div>
                {pickupLocation && (
                  <p className="font-mono text-[10px] text-slate-500 pl-1">
                    A · {pickupLocation.getLatitude().toFixed(5)}, {pickupLocation.getLongitude().toFixed(5)}
                  </p>
                )}
              </div>

              {/* Dropoff Input */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    <PlaceSearchInput
                      placeholder="Search dropoff address..."
                      valueLabel={dropoffLabel}
                      locationBias={mapCenter}
                      onSelect={handlePlaceDropoff}
                      compact
                      accentIcon="dropoff"
                    />
                  </div>
                  <button
                    type="button"
                    title="Pick dropoff on map"
                    onClick={() => onSetPickMode(pickMode === 'dropoff' ? 'none' : 'dropoff')}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      pickMode === 'dropoff'
                        ? 'border-sky-400 bg-sky-500/20 text-sky-300'
                        : 'border-slate-700/80 bg-[#0B111E] text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </button>
                </div>
                {dropoffLocation && (
                  <p className="font-mono text-[10px] text-slate-500 pl-1">
                    B · {dropoffLocation.getLatitude().toFixed(5)}, {dropoffLocation.getLongitude().toFixed(5)}
                  </p>
                )}
              </div>
            </section>

            {/* Vehicle Class & Live Pricing Quote */}
            <section className="space-y-2 border-t border-slate-800/80 pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Vehicle Class</span>
                {estimatedDistanceKm > 0 && (
                  <span className="font-mono text-[11px] text-slate-400">
                    {estimatedDistanceKm.toFixed(2)} km
                    {tripRouteData?.durationMinutes
                      ? ` · ~${Math.max(1, Math.round(tripRouteData.durationMinutes))} min`
                      : ''}
                    {tripRouteData && !tripRouteData.isRoadRoute ? ' · Straight-line' : ''}
                  </span>
                )}
              </div>
              {tripRouteData && !tripRouteData.isRoadRoute && (
                <p className="rounded border border-amber-500/30 bg-amber-950/25 px-2.5 py-1.5 text-[11px] text-amber-200">
                  Road path unavailable ({tripRouteData.errorMessage ?? 'enable Routes API on your Google Cloud project'}). Animating direct fallback.
                </p>
              )}

              <div className="space-y-1.5">
                {RIDE_OPTIONS.map((opt) => {
                  const isSelected = selectedRideType === opt.type;
                  const fare =
                    pickupLocation && dropoffLocation
                      ? service.estimateFare(
                          pickupLocation,
                          dropoffLocation,
                          opt.type,
                          tripRouteData?.distanceKm
                        )
                      : null;
                  const nearbyCount = pickupLocation
                    ? service.previewMatchingDrivers(pickupLocation, opt.type).length
                    : drivers.filter(
                        (d) =>
                          d.getStatus() === DriverStatus.ONLINE &&
                          d.getVehicle().getType() === opt.type
                      ).length;

                  return (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => {
                        onSelectRideType(opt.type);
                        setRequestError(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? 'border-sky-500/80 bg-sky-500/10 text-white'
                          : 'border-slate-800 bg-[#0B111E] text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Car className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                          <span className="text-xs font-semibold">{opt.title}</span>
                          <span className="text-[11px] text-slate-400">·</span>
                          <span className="font-mono text-[11px] text-emerald-400">
                            {nearbyCount} nearby
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{opt.subtitle}</p>
                      </div>
                      <div className="pl-2 text-right font-mono text-xs font-semibold text-slate-100 shrink-0">
                        {fare !== null ? `$${fare.toFixed(2)}` : '—'}
                      </div>
                    </button>
                  );
                })}
              </div>

              {requestError && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-[11px] text-amber-200 space-y-2">
                  <p>{requestError}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSpawnMatchingDriver}
                      className="rounded border border-amber-400/50 bg-amber-500/20 px-2 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-500/30 transition-colors"
                    >
                      Spawn Nearby {selectedRideType}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        service.setDriverMatchingStrategy(new NearestDriverMatchingStrategy(12.0));
                        setRequestError(null);
                      }}
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      Expand Radius to 12 km
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleRequestRide}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors"
              >
                <Navigation className="h-3.5 w-3.5" />
                Request {selectedRideType} Ride
                {pickupLocation && matchedDriversPreview.length > 0
                  ? ` (${matchedDriversPreview.length} match${matchedDriversPreview.length === 1 ? '' : 'es'})`
                  : ''}
              </button>
            </section>

            {/* Active Trip State Lifecycle */}
            {activeTrip && (
              <section className="space-y-3 border-t border-slate-800/80 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-white">
                      Active Trip · <span className="font-mono">{activeTrip.getId().slice(0, 8)}</span>
                    </h3>
                    <p className="font-mono text-[11px] text-sky-400">{activeTrip.getStateLabel()}</p>
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-100">
                    ${activeTrip.getFare().toFixed(2)}
                  </span>
                </div>

                {/* 4-Step TripState Progress */}
                <div className="grid grid-cols-4 gap-1 text-[10px]">
                  {[
                    {status: TripStatus.REQUESTED, label: 'Requested'},
                    {status: TripStatus.ASSIGNED, label: 'Assigned'},
                    {status: TripStatus.IN_PROGRESS, label: 'In Trip'},
                    {status: TripStatus.COMPLETED, label: 'Done'},
                  ].map((step, idx) => {
                    const order = [
                      TripStatus.REQUESTED,
                      TripStatus.ASSIGNED,
                      TripStatus.IN_PROGRESS,
                      TripStatus.COMPLETED,
                    ];
                    const currentIdx = order.indexOf(activeTrip.getStatus());
                    const isCancelled = activeTrip.getStatus() === TripStatus.CANCELLED;
                    const reached = !isCancelled && currentIdx >= idx;
                    return (
                      <div key={step.status} className="space-y-1">
                        <div
                          className={`h-1.5 w-full rounded-sm ${
                            isCancelled
                              ? 'bg-rose-500/40'
                              : reached
                                ? 'bg-sky-400'
                                : 'bg-slate-800'
                          }`}
                        />
                        <span
                          className={`block truncate ${
                            reached ? 'text-slate-200 font-medium' : 'text-slate-500'
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1 rounded-lg border border-slate-800 bg-[#0B111E] p-2.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Rider</span>
                    <span className="text-slate-200 font-medium">{activeTrip.getRider().getName()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Driver</span>
                    <span className="text-slate-200 font-medium">
                      {activeTrip.getDriver()
                        ? `${activeTrip.getDriver()!.getName()} (${activeTrip.getDriver()!.getVehicle().getLicenseNumber()})`
                        : 'Awaiting acceptance'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status / Observers</span>
                    <span className="font-mono text-slate-200">
                      {activeTrip.getStatus()} · {activeTrip.getObserversCount()} obs
                    </span>
                  </div>
                </div>

                {/* Simulation Movement Controls */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoAnimate}
                      onChange={(e) => onToggleAutoAnimate(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-sky-500"
                    />
                    <span>Animate on road</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoProgress}
                      onChange={(e) => onToggleAutoProgress(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-sky-500"
                    />
                    <span>Auto-step arrival</span>
                  </label>
                </div>

                {/* State Action Buttons */}
                {activeTrip.getStatus() === TripStatus.REQUESTED && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-slate-400">
                      Notified Nearby Drivers (Accept to assign):
                    </p>
                    <div className="max-h-36 space-y-1.5 overflow-y-auto pr-0.5">
                      {notifiedDriversForActiveTrip.map((drv) => (
                        <div
                          key={drv.getId()}
                          className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-[#0B111E] px-2.5 py-1.5 text-[11px]"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-100">{drv.getName()}</p>
                            <p className="font-mono text-[10px] text-slate-400">
                              {activeTrip
                                .getPickupLocation()
                                .distanceTo(drv.getCurrentLocation())
                                .toFixed(2)}{' '}
                              km away · {drv.getVehicle().getModel()}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => service.acceptRide(drv.getId(), activeTrip.getId())}
                            className="shrink-0 rounded bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
                          >
                            Accept
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => service.cancelTrip(activeTrip.getId())}
                      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 text-xs font-medium text-rose-300 hover:bg-rose-950/40 transition-colors"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel Request
                    </button>
                  </div>
                )}

                {activeTrip.getStatus() === TripStatus.ASSIGNED && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => service.startTrip(activeTrip.getId())}
                      className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      Start Trip
                    </button>
                    <button
                      type="button"
                      onClick={() => service.cancelTrip(activeTrip.getId())}
                      className="flex h-9 items-center justify-center rounded-lg border border-rose-500/40 px-3 text-xs font-medium text-rose-300 hover:bg-rose-950/40 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {activeTrip.getStatus() === TripStatus.IN_PROGRESS && (
                  <button
                    type="button"
                    onClick={() => service.endTrip(activeTrip.getId())}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    End Trip & Complete Fare
                  </button>
                )}
              </section>
            )}
          </>
        )}

        {activeTab === 'fleet' && (
          <>
            <section className="space-y-2.5">
              <h3 className="text-xs font-semibold text-slate-200">Locality Fleet Simulation</h3>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Spawn randomized <span className="font-mono text-slate-200">Driver</span> and{' '}
                <span className="font-mono text-slate-200">Rider</span> instances around the current
                map center.
              </p>
              <button
                type="button"
                onClick={onSpawnExtraFleet}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-sky-500/50 bg-sky-500/15 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Spawn +6 Drivers & +3 Riders Here
              </button>
            </section>

            <section className="space-y-2.5 border-t border-slate-800/80 pt-4">
              <h3 className="text-xs font-semibold text-slate-200">Register Custom Driver</h3>
              <form onSubmit={handleAddDriver} className="space-y-2">
                <input
                  type="text"
                  placeholder="Driver name (e.g., Arjun Mehta)"
                  value={drvName}
                  onChange={(e) => setDrvName(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-700/80 bg-[#0B111E] px-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Vehicle model"
                    value={drvModel}
                    onChange={(e) => setDrvModel(e.target.value)}
                    className="h-9 rounded-lg border border-slate-700/80 bg-[#0B111E] px-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="License plate"
                    value={drvPlate}
                    onChange={(e) => setDrvPlate(e.target.value)}
                    className="h-9 rounded-lg border border-slate-700/80 bg-[#0B111E] px-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={drvType}
                    onChange={(e) => setDrvType(e.target.value as RideType)}
                    className="h-9 rounded-lg border border-slate-700/80 bg-[#0B111E] px-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  >
                    <option value={RideType.SEDAN}>SEDAN</option>
                    <option value={RideType.SUV}>SUV</option>
                    <option value={RideType.AUTO}>AUTO</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Contact phone"
                    value={drvContact}
                    onChange={(e) => setDrvContact(e.target.value)}
                    className="h-9 rounded-lg border border-slate-700/80 bg-[#0B111E] px-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={drvOnline}
                    onChange={(e) => setDrvOnline(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-sky-500"
                  />
                  <span>Go ONLINE immediately</span>
                </label>
                <button
                  type="submit"
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-950 hover:bg-white transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Register Driver
                </button>
              </form>
            </section>
          </>
        )}

        {activeTab === 'strategies' && (
          <>
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-3.5 w-3.5 text-sky-400" />
                <h3 className="text-xs font-semibold text-slate-200">Runtime PricingStrategy</h3>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => service.setPricingStrategy(new VehicleBasedPricingStrategy())}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    pricingStrategy.id === 'vehicle'
                      ? 'border-sky-500/80 bg-sky-500/10 text-white'
                      : 'border-slate-800 bg-[#0B111E] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="font-mono text-xs font-semibold">VehicleBasedPricingStrategy</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    $2.50 base · Auto $1.00/km · Sedan $1.50/km · SUV $2.00/km
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => service.setPricingStrategy(new FlatRatePricingStrategy())}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    pricingStrategy.id === 'flat'
                      ? 'border-sky-500/80 bg-sky-500/10 text-white'
                      : 'border-slate-800 bg-[#0B111E] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="font-mono text-xs font-semibold">FlatRatePricingStrategy</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    $5.00 base · Flat $1.50/km across all vehicle types
                  </p>
                </button>
              </div>
            </section>

            <section className="space-y-3 border-t border-slate-800/80 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200">
                  NearestDriverMatchingStrategy
                </h3>
                <span className="font-mono text-xs font-semibold text-sky-400">
                  {matchingStrategyRadius.toFixed(1)} km
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={15}
                step={0.5}
                value={matchingStrategyRadius}
                onChange={(e) =>
                  service.setDriverMatchingStrategy(
                    new NearestDriverMatchingStrategy(Number(e.target.value))
                  )
                }
                className="w-full accent-sky-400"
              />
              <p className="text-[11px] text-slate-400">
                Filters <span className="font-mono text-slate-200">ONLINE</span> drivers matching the
                requested <span className="font-mono text-slate-200">RideType</span> within{' '}
                <span className="font-mono text-slate-200">MAX_DISTANCE_KM</span> and sorts nearest
                first.
              </p>
            </section>
          </>
        )}
      </div>
    </aside>
  );
};
