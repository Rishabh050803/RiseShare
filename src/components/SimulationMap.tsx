import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  type MapMouseEvent,
  useMap,
} from '@vis.gl/react-google-maps';
import {Car, Navigation, User as UserIcon} from 'lucide-react';
import React, {useEffect, useRef, useState} from 'react';
import type {Driver} from '../domain/driver';
import {DriverStatus, RideType, TripStatus} from '../domain/enums';
import {Location} from '../domain/location';
import type {Rider} from '../domain/rider';
import type {Trip} from '../domain/trip';
import {type ComputedRouteData, RouteLayer} from './RouteLayer';

export type MapPickMode = 'none' | 'pickup' | 'dropoff';

export type SelectedEntity =
  | {type: 'driver'; id: string}
  | {type: 'rider'; id: string}
  | null;

interface SimulationMapProps {
  center: google.maps.LatLngLiteral;
  viewportToFit: google.maps.LatLngBounds | null;
  panTrigger: number;
  userGpsLocation: Location | null;
  drivers: Driver[];
  riders: Rider[];
  activeTrip: Trip | null;
  pickupLocation: Location | null;
  dropoffLocation: Location | null;
  pickMode: MapPickMode;
  onMapPick: (location: Location) => void;
  onCancelPickMode: () => void;
  selectedEntity: SelectedEntity;
  onSelectEntity: (entity: SelectedEntity) => void;
  onToggleDriverStatus: (driverId: string) => void;
  onAcceptTrip: (driverId: string, tripId: string) => void;
  onSelectRiderForBooking: (riderId: string) => void;
  onTripRouteComputed: (data: ComputedRouteData | null) => void;
  onApproachRouteComputed: (data: ComputedRouteData | null) => void;
}

const MapViewportController: React.FC<{
  center: google.maps.LatLngLiteral;
  viewportToFit: google.maps.LatLngBounds | null;
  panTrigger: number;
}> = ({center, viewportToFit, panTrigger}) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (viewportToFit) {
      map.fitBounds(viewportToFit);
    } else {
      map.panTo(center);
      map.setZoom(13);
    }
  }, [map, center.lat, center.lng, viewportToFit, panTrigger]);

  return null;
};

function getDriverMarkerColors(status: DriverStatus, isNotified: boolean, isSelected: boolean) {
  if (status === DriverStatus.IN_TRIP) {
    return {
      bg: 'bg-amber-950/95',
      border: isSelected ? 'border-amber-300 ring-2 ring-amber-400/50' : 'border-amber-500/80',
      dot: 'bg-amber-400',
      text: 'text-amber-100',
    };
  }
  if (status === DriverStatus.ONLINE) {
    return {
      bg: isNotified ? 'bg-sky-950/95' : 'bg-emerald-950/95',
      border: isSelected
        ? 'border-white ring-2 ring-sky-400/60'
        : isNotified
          ? 'border-sky-400 ring-2 ring-sky-400/40'
          : 'border-emerald-500/80',
      dot: isNotified ? 'bg-sky-400' : 'bg-emerald-400',
      text: 'text-emerald-50',
    };
  }
  return {
    bg: 'bg-slate-900/90',
    border: isSelected ? 'border-slate-300 ring-2 ring-slate-400/40' : 'border-slate-600/80',
    dot: 'bg-slate-500',
    text: 'text-slate-300',
  };
}

function rideTypeShort(type: RideType): string {
  if (type === RideType.AUTO) return 'AUTO';
  if (type === RideType.SUV) return 'SUV';
  return 'SDN';
}

export const SimulationMap: React.FC<SimulationMapProps> = ({
  center,
  viewportToFit,
  panTrigger,
  userGpsLocation,
  drivers,
  riders,
  activeTrip,
  pickupLocation,
  dropoffLocation,
  pickMode,
  onMapPick,
  onCancelPickMode,
  selectedEntity,
  onSelectEntity,
  onToggleDriverStatus,
  onAcceptTrip,
  onSelectRiderForBooking,
  onTripRouteComputed,
  onApproachRouteComputed,
}) => {
  const [infoAnchorPos, setInfoAnchorPos] = useState<google.maps.LatLngLiteral | null>(null);

  // Snapshot the driver's starting coordinate ONCE when a trip enters ASSIGNED
  // so moving the driver marker during animation does not re-trigger Route.computeRoutes every tick.
  const [approachOrigin, setApproachOrigin] = useState<google.maps.LatLngLiteral | null>(null);
  const approachTripIdRef = useRef<string | null>(null);

  const activeTripId = activeTrip?.getId() ?? null;
  const activeTripStatus = activeTrip?.getStatus() ?? null;
  const activeDriver = activeTrip?.getDriver() ?? null;

  useEffect(() => {
    if (activeTripId && activeTripStatus === TripStatus.ASSIGNED && activeDriver) {
      if (approachTripIdRef.current !== activeTripId) {
        approachTripIdRef.current = activeTripId;
        setApproachOrigin(activeDriver.getCurrentLocation().toLatLng());
      }
    } else {
      approachTripIdRef.current = null;
      setApproachOrigin(null);
    }
  }, [activeTripId, activeTripStatus, activeDriver]);

  const notifiedSet: Record<string, boolean> = {};
  if (activeTrip && activeTripStatus === TripStatus.REQUESTED) {
    for (const id of activeTrip.getNotifiedDriverIds()) {
      notifiedSet[id] = true;
    }
  }

  const effectivePickup =
    activeTrip && activeTripStatus !== TripStatus.COMPLETED && activeTripStatus !== TripStatus.CANCELLED
      ? activeTrip.getPickupLocation()
      : pickupLocation;

  const effectiveDropoff =
    activeTrip && activeTripStatus !== TripStatus.COMPLETED && activeTripStatus !== TripStatus.CANCELLED
      ? activeTrip.getDropoffLocation()
      : dropoffLocation;

  const handleMapClick = (ev: MapMouseEvent) => {
    if (pickMode === 'none') {
      onSelectEntity(null);
      setInfoAnchorPos(null);
      return;
    }
    const latLng = ev.detail.latLng;
    if (!latLng) return;
    onMapPick(new Location(latLng.lat, latLng.lng));
  };

  const selectedDriver =
    selectedEntity?.type === 'driver'
      ? drivers.find((d) => d.getId() === selectedEntity.id) ?? null
      : null;

  const selectedRider =
    selectedEntity?.type === 'rider'
      ? riders.find((r) => r.getId() === selectedEntity.id) ?? null
      : null;

  useEffect(() => {
    if (selectedDriver) {
      setInfoAnchorPos(selectedDriver.getCurrentLocation().toLatLng());
    } else if (selectedRider) {
      setInfoAnchorPos(selectedRider.getCurrentLocation().toLatLng());
    } else {
      setInfoAnchorPos(null);
    }
  }, [selectedEntity?.type, selectedEntity?.id, selectedDriver, selectedRider]);

  return (
    <div className="relative h-full w-full min-h-[420px] bg-[#090D16]">
      <GoogleMap
        defaultCenter={center}
        defaultZoom={13}
        mapId="DEMO_MAP_ID"
        colorScheme="DARK"
        gestureHandling="greedy"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        onClick={handleMapClick}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="h-full w-full"
      >
        <MapViewportController
          center={center}
          viewportToFit={viewportToFit}
          panTrigger={panTrigger}
        />

        {/* Primary Trip / Preview Route (Pickup -> Dropoff) */}
        <RouteLayer
          origin={effectivePickup ? effectivePickup.toLatLng() : null}
          destination={effectiveDropoff ? effectiveDropoff.toLatLng() : null}
          strokeColor="#38BDF8"
          strokeWeight={5}
          strokeOpacity={0.9}
          fitBounds={false}
          label="Trip Route"
          onRouteComputed={onTripRouteComputed}
        />

        {/* Driver Approach Route (Snapshotted Driver Start -> Pickup) */}
        <RouteLayer
          origin={approachOrigin}
          destination={
            approachOrigin && effectivePickup ? effectivePickup.toLatLng() : null
          }
          strokeColor="#F59E0B"
          strokeWeight={4}
          strokeOpacity={0.85}
          fitBounds={false}
          label="Driver Approach Route"
          onRouteComputed={onApproachRouteComputed}
        />

        {/* User Current GPS Marker */}
        {userGpsLocation && (
          <AdvancedMarker
            position={userGpsLocation.toLatLng()}
            zIndex={820}
            title="Your Current GPS Location"
          >
            <div className="flex flex-col items-center">
              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-cyan-400 shadow-lg">
                <span className="h-2 w-2 rounded-full bg-slate-950" />
              </div>
              <span className="mt-0.5 rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300 border border-cyan-500/40 whitespace-nowrap">
                You (GPS)
              </span>
            </div>
          </AdvancedMarker>
        )}

        {/* Pickup Marker */}
        {effectivePickup && (
          <AdvancedMarker position={effectivePickup.toLatLng()} zIndex={900} title="Pickup Location">
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-xs font-bold text-slate-950 shadow-lg">
                A
              </div>
              <div className="mt-0.5 rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/40 whitespace-nowrap">
                Pickup
              </div>
            </div>
          </AdvancedMarker>
        )}

        {/* Dropoff Marker */}
        {effectiveDropoff && (
          <AdvancedMarker position={effectiveDropoff.toLatLng()} zIndex={900} title="Dropoff Location">
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-white bg-sky-400 text-xs font-bold text-slate-950 shadow-lg">
                B
              </div>
              <div className="mt-0.5 rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 border border-sky-500/40 whitespace-nowrap">
                Dropoff
              </div>
            </div>
          </AdvancedMarker>
        )}

        {/* Rider Markers */}
        {riders.map((rider) => {
          const isSelected = selectedEntity?.type === 'rider' && selectedEntity.id === rider.getId();
          return (
            <AdvancedMarker
              key={rider.getId()}
              position={rider.getCurrentLocation().toLatLng()}
              zIndex={isSelected ? 980 : 400}
              onClick={() => onSelectEntity({type: 'rider', id: rider.getId()})}
              title={`Rider: ${rider.getName()}`}
            >
              <div
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium shadow-md transition-transform hover:scale-105 cursor-pointer ${
                  isSelected
                    ? 'border-indigo-300 bg-indigo-950 text-white ring-2 ring-indigo-400/50'
                    : 'border-indigo-500/60 bg-[#111827]/95 text-indigo-100'
                }`}
              >
                <UserIcon className="h-3 w-3 text-indigo-300 shrink-0" />
                <span className="max-w-[72px] truncate">{rider.getName().split(' ')[0]}</span>
              </div>
            </AdvancedMarker>
          );
        })}

        {/* Driver Markers */}
        {drivers.map((driver) => {
          const isSelected = selectedEntity?.type === 'driver' && selectedEntity.id === driver.getId();
          const isNotified = Boolean(notifiedSet[driver.getId()]);
          const colors = getDriverMarkerColors(driver.getStatus(), isNotified, isSelected);
          const vType = driver.getVehicle().getType();

          return (
            <AdvancedMarker
              key={driver.getId()}
              position={driver.getCurrentLocation().toLatLng()}
              zIndex={isSelected ? 1000 : driver.getStatus() === DriverStatus.IN_TRIP ? 850 : 600}
              onClick={() => onSelectEntity({type: 'driver', id: driver.getId()})}
              title={`Driver: ${driver.getName()} (${driver.getVehicle().getType()})`}
            >
              <div
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium shadow-lg transition-transform hover:scale-105 cursor-pointer ${colors.bg} ${colors.border} ${colors.text}`}
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${colors.dot}`} />
                <Car className="h-3 w-3 shrink-0 opacity-90" />
                <span className="font-mono text-[10px] font-semibold tracking-tight">
                  {rideTypeShort(vType)}
                </span>
                <span className="max-w-[64px] truncate">{driver.getName().split(' ')[0]}</span>
              </div>
            </AdvancedMarker>
          );
        })}

        {/* InfoWindow for Selected Driver or Rider */}
        {infoAnchorPos && (selectedDriver || selectedRider) && (
          <InfoWindow
            position={infoAnchorPos}
            pixelOffset={[0, -28]}
            onCloseClick={() => {
              onSelectEntity(null);
              setInfoAnchorPos(null);
            }}
          >
            <div className="min-w-[210px] max-w-[260px] rounded-md bg-[#0F172A] p-3 text-slate-100">
              {selectedDriver && (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-white">{selectedDriver.getName()}</p>
                      <p className="text-[11px] text-slate-400">
                        {selectedDriver.getVehicle().getModel()} ·{' '}
                        <span className="font-mono">{selectedDriver.getVehicle().getLicenseNumber()}</span>
                      </p>
                    </div>
                    <span className="font-mono text-[10px] font-semibold text-sky-400">
                      {selectedDriver.getVehicle().getType()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] border-t border-slate-800 pt-2">
                    <span className="text-slate-400">Status</span>
                    <span className="font-mono font-medium text-slate-200">
                      {selectedDriver.getStatus()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Trips Completed</span>
                    <span className="font-mono text-slate-200">
                      {selectedDriver.getTripHistory().length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {selectedDriver.getStatus() !== DriverStatus.IN_TRIP && (
                      <button
                        type="button"
                        onClick={() => onToggleDriverStatus(selectedDriver.getId())}
                        className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-700 transition-colors"
                      >
                        {selectedDriver.getStatus() === DriverStatus.ONLINE
                          ? 'Go Offline'
                          : 'Go Online'}
                      </button>
                    )}
                    {activeTrip &&
                      activeTripStatus === TripStatus.REQUESTED &&
                      notifiedSet[selectedDriver.getId()] && (
                        <button
                          type="button"
                          onClick={() => onAcceptTrip(selectedDriver.getId(), activeTrip.getId())}
                          className="flex-1 rounded bg-sky-500 px-2 py-1 text-[11px] font-semibold text-slate-950 hover:bg-sky-400 transition-colors"
                        >
                          Accept Ride
                        </button>
                      )}
                  </div>
                </div>
              )}

              {selectedRider && (
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-white">{selectedRider.getName()}</p>
                    <p className="font-mono text-[11px] text-slate-400">
                      {selectedRider.getContact()}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] border-t border-slate-800 pt-2">
                    <span className="text-slate-400">Trip History</span>
                    <span className="font-mono text-slate-200">
                      {selectedRider.getTripHistory().length} completed
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectRiderForBooking(selectedRider.getId());
                      onSelectEntity(null);
                    }}
                    className="w-full rounded bg-sky-500 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-sky-400 transition-colors"
                  >
                    Book Ride for {selectedRider.getName().split(' ')[0]}
                  </button>
                </div>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Active Map Pick Instruction Overlay */}
      {pickMode !== 'none' && (
        <div className="pointer-events-auto absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-sky-500/60 bg-[#0F172A]/95 px-4 py-2 text-xs text-slate-100 shadow-xl backdrop-blur">
          <Navigation className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          <span>
            Click anywhere on the map to set{' '}
            <strong className="text-white">
              {pickMode === 'pickup' ? 'Pickup (A)' : 'Dropoff (B)'}
            </strong>
          </span>
          <button
            type="button"
            onClick={onCancelPickMode}
            className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Compact Legend */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-[#0B111E]/90 px-3 py-2 text-[11px] text-slate-300 backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Online Driver
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          Notified Match
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          In Trip
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-500" />
          Offline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-indigo-400" />
          Rider
        </span>
        {userGpsLocation && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            You (GPS)
          </span>
        )}
      </div>
    </div>
  );
};
