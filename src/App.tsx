import {APIProvider} from '@vis.gl/react-google-maps';
import {Locate, RefreshCw, RotateCcw, Users} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {DispatchPanel} from './components/DispatchPanel';
import {InspectorDrawer} from './components/InspectorDrawer';
import {PlaceSearchInput, type SelectedPlaceResult} from './components/PlaceSearchInput';
import type {ComputedRouteData} from './components/RouteLayer';
import {
  type MapPickMode,
  type SelectedEntity,
  SimulationMap,
} from './components/SimulationMap';
import {DriverStatus, RideType, TripStatus} from './domain/enums';
import {domainLogger} from './domain/eventBus';
import {Location} from './domain/location';
import {randomNearbyLocation} from './domain/rideSharingService';
import type {Trip} from './domain/trip';
import {useRideSharing} from './hooks/useRideSharing';

const DEFAULT_LOCALITY = {
  lat: 12.9716,
  lng: 77.5946,
  label: 'Bengaluru, India',
};

const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  (typeof __GOOGLE_MAPS_API_KEY__ !== 'undefined' ? __GOOGLE_MAPS_API_KEY__ : '');

type MobileView = 'map' | 'dispatch' | 'inspector';

/**
 * Interpolates a coordinate at progress t in [0, 1] along a polyline path
 * weighted by actual segment arc length so the vehicle moves at steady speed
 * along every curve and turn of the road.
 */
function interpolateAlongPath(path: google.maps.LatLngLiteral[], t: number): google.maps.LatLngLiteral {
  if (path.length === 0) return {lat: 0, lng: 0};
  if (path.length === 1 || t <= 0) return path[0];
  if (t >= 1) return path[path.length - 1];

  const cumDist: number[] = [0];
  let totalDist = 0;
  for (let i = 1; i < path.length; i++) {
    const dLat = path[i].lat - path[i - 1].lat;
    const dLng = path[i].lng - path[i - 1].lng;
    const segLen = Math.hypot(dLat, dLng);
    totalDist += segLen;
    cumDist.push(totalDist);
  }

  if (totalDist <= 0) return path[0];

  const targetDist = t * totalDist;
  for (let i = 1; i < cumDist.length; i++) {
    if (cumDist[i] >= targetDist) {
      const segStart = cumDist[i - 1];
      const segLen = cumDist[i] - segStart;
      const frac = segLen > 0 ? (targetDist - segStart) / segLen : 0;
      return {
        lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * frac,
        lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * frac,
      };
    }
  }
  return path[path.length - 1];
}

export default function App() {
  const {
    service,
    riders,
    drivers,
    trips,
    logs,
    pricingStrategy,
    matchingStrategy,
  } = useRideSharing();

  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>({
    lat: DEFAULT_LOCALITY.lat,
    lng: DEFAULT_LOCALITY.lng,
  });
  const [localityLabel, setLocalityLabel] = useState<string>(DEFAULT_LOCALITY.label);
  const [viewportToFit, setViewportToFit] = useState<google.maps.LatLngBounds | null>(null);
  const [panTrigger, setPanTrigger] = useState(0);
  const [locatingGps, setLocatingGps] = useState(false);
  const [userGpsLocation, setUserGpsLocation] = useState<Location | null>(null);

  const [selectedRiderId, setSelectedRiderId] = useState<string>('');
  const [pickupLocation, setPickupLocation] = useState<Location | null>(null);
  const [pickupLabel, setPickupLabel] = useState<string>('');
  const [dropoffLocation, setDropoffLocation] = useState<Location | null>(null);
  const [dropoffLabel, setDropoffLabel] = useState<string>('');
  const [pickMode, setPickMode] = useState<MapPickMode>('none');
  const [selectedRideType, setSelectedRideType] = useState<RideType>(RideType.SEDAN);

  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(null);

  const [tripRouteData, setTripRouteData] = useState<ComputedRouteData | null>(null);
  const [approachRouteData, setApproachRouteData] = useState<ComputedRouteData | null>(null);

  const [autoAnimate, setAutoAnimate] = useState(true);
  const [autoProgress, setAutoProgress] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('map');

  const initializedRef = useRef(false);

  // Quota Exceeded Event Listener (Tier 1 & Tier 2)
  useEffect(() => {
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  // Helper to seed a locality with random drivers, riders, and initial pickup/dropoff
  const seedLocality = useCallback(
    (
      center: google.maps.LatLngLiteral,
      label: string,
      viewport: google.maps.LatLngBounds | null,
      exactPickup?: Location | null
    ) => {
      setMapCenter(center);
      setLocalityLabel(label);
      setViewportToFit(viewport);
      setPanTrigger((t) => t + 1);

      const centerLoc = new Location(center.lat, center.lng);
      service.resetFleet(centerLoc);

      const spawnedRiders = service.getRiders();
      if (spawnedRiders.length > 0) {
        const firstRider = spawnedRiders[0];
        if (exactPickup) {
          firstRider.setCurrentLocation(exactPickup);
        }
        setSelectedRiderId(firstRider.getId());
        const pLoc = exactPickup ?? firstRider.getCurrentLocation();
        const dLoc = randomNearbyLocation(centerLoc, 1.4, 3.5);
        setPickupLocation(pLoc);
        setPickupLabel(
          exactPickup
            ? `My Current Location (${pLoc.getLatitude().toFixed(4)}, ${pLoc.getLongitude().toFixed(4)})`
            : `${pLoc.getLatitude().toFixed(4)}, ${pLoc.getLongitude().toFixed(4)}`
        );
        setDropoffLocation(dLoc);
        setDropoffLabel(`${dLoc.getLatitude().toFixed(4)}, ${dLoc.getLongitude().toFixed(4)}`);
      }
      setActiveTripId(null);
      setSelectedEntity(null);
    },
    [service]
  );

  // Initial seed + automatic current location detection on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    seedLocality(
      {lat: DEFAULT_LOCALITY.lat, lng: DEFAULT_LOCALITY.lng},
      DEFAULT_LOCALITY.label,
      null
    );

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          const gpsLoc = new Location(coords.lat, coords.lng);
          setUserGpsLocation(gpsLoc);
          seedLocality(coords, 'Your Current Locality', null, gpsLoc);
        },
        () => {
          // User declined or unavailable; keep default locality cleanly
        },
        {enableHighAccuracy: true, timeout: 6000, maximumAge: 30000}
      );
    }
  }, [seedLocality]);

  const handleDetectLocation = (setAsPickupOnly = false) => {
    if (!('geolocation' in navigator)) {
      domainLogger.emit('WARNING', 'Geolocation Unavailable', [
        'Browser geolocation is not supported in this environment. Use the locality search bar.',
      ]);
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingGps(false);
        const coords = {lat: pos.coords.latitude, lng: pos.coords.longitude};
        const gpsLoc = new Location(coords.lat, coords.lng);
        setUserGpsLocation(gpsLoc);

        if (setAsPickupOnly) {
          setPickupLocation(gpsLoc);
          setPickupLabel(
            `My Current Location (${gpsLoc.getLatitude().toFixed(4)}, ${gpsLoc.getLongitude().toFixed(4)})`
          );
          const rider = service.getRiderById(selectedRiderId);
          if (rider) {
            rider.setCurrentLocation(gpsLoc);
            service.notifyUiRefresh();
          }
          setMapCenter(coords);
          setViewportToFit(null);
          setPanTrigger((t) => t + 1);
        } else {
          seedLocality(coords, 'Your Current Locality', null, gpsLoc);
        }
      },
      (err) => {
        setLocatingGps(false);
        domainLogger.emit('WARNING', 'Location Access Declined', [
          err.message ||
            'Unable to read GPS location. Ensure you access via http://localhost:3000 (or HTTPS) and allow location access.',
        ]);
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  };

  const handleUseGpsPickup = () => {
    if (userGpsLocation) {
      setPickupLocation(userGpsLocation);
      setPickupLabel(
        `My Current Location (${userGpsLocation.getLatitude().toFixed(4)}, ${userGpsLocation.getLongitude().toFixed(4)})`
      );
      const rider = service.getRiderById(selectedRiderId);
      if (rider) {
        rider.setCurrentLocation(userGpsLocation);
        service.notifyUiRefresh();
      }
      return;
    }
    handleDetectLocation(true);
  };

  const handleLocalitySelect = (res: SelectedPlaceResult) => {
    seedLocality({lat: res.lat, lng: res.lng}, res.label, res.viewport ?? null);
  };

  const activeTrip = activeTripId ? service.getTripById(activeTripId) ?? null : null;

  // Escape cancels map pick mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickMode('none');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Smooth road-path vehicle animation for ASSIGNED (approach) and IN_PROGRESS (trip)
  const animPhaseRef = useRef<{tripId: string; status: TripStatus; progress: number} | null>(null);
  const activeTripStatus = activeTrip?.getStatus() ?? null;

  useEffect(() => {
    if (!autoAnimate || !activeTrip) return;
    if (activeTripStatus !== TripStatus.ASSIGNED && activeTripStatus !== TripStatus.IN_PROGRESS) {
      animPhaseRef.current = null;
      return;
    }

    const status = activeTripStatus;
    const driver = activeTrip.getDriver();
    if (!driver) return;

    const routeObj = status === TripStatus.ASSIGNED ? approachRouteData : tripRouteData;

    // Wait briefly for Routes API road polyline to resolve before falling back to straight-line
    if (!routeObj) {
      const waitTimer = window.setTimeout(() => {
        // Trigger fallback animation if Routes API hasn't returned after 1.2s
        if (status === TripStatus.ASSIGNED) {
          setApproachRouteData((prev) =>
            prev ?? {
              distanceKm: driver.getCurrentLocation().distanceTo(activeTrip.getPickupLocation()),
              durationMinutes: 0,
              path: [driver.getCurrentLocation().toLatLng(), activeTrip.getPickupLocation().toLatLng()],
              isRoadRoute: false,
            }
          );
        } else {
          setTripRouteData((prev) =>
            prev ?? {
              distanceKm: activeTrip.getPickupLocation().distanceTo(activeTrip.getDropoffLocation()),
              durationMinutes: 0,
              path: [activeTrip.getPickupLocation().toLatLng(), activeTrip.getDropoffLocation().toLatLng()],
              isRoadRoute: false,
            }
          );
        }
      }, 1200);
      return () => window.clearTimeout(waitTimer);
    }

    const path =
      routeObj.path.length >= 2
        ? routeObj.path
        : status === TripStatus.ASSIGNED
          ? [driver.getCurrentLocation().toLatLng(), activeTrip.getPickupLocation().toLatLng()]
          : [activeTrip.getPickupLocation().toLatLng(), activeTrip.getDropoffLocation().toLatLng()];

    if (
      !animPhaseRef.current ||
      animPhaseRef.current.tripId !== activeTrip.getId() ||
      animPhaseRef.current.status !== status
    ) {
      animPhaseRef.current = {tripId: activeTrip.getId(), status, progress: 0};
    }

    const durationMs = status === TripStatus.ASSIGNED ? 6500 : 9000;
    const stepMs = 75;
    const increment = stepMs / durationMs;

    const timer = window.setInterval(() => {
      const state = animPhaseRef.current;
      if (!state) return;

      const nextProgress = Math.min(1, state.progress + increment);
      state.progress = nextProgress;

      const pos = interpolateAlongPath(path, nextProgress);
      const loc = new Location(pos.lat, pos.lng);
      driver.setCurrentLocation(loc);
      if (status === TripStatus.IN_PROGRESS) {
        activeTrip.getRider().setCurrentLocation(loc);
      }
      service.notifyUiRefresh();

      if (nextProgress >= 1) {
        window.clearInterval(timer);
        if (autoProgress) {
          if (status === TripStatus.ASSIGNED) {
            service.startTrip(activeTrip.getId());
          } else if (status === TripStatus.IN_PROGRESS) {
            service.endTrip(activeTrip.getId());
          }
        }
      }
    }, stepMs);

    return () => window.clearInterval(timer);
  }, [
    autoAnimate,
    autoProgress,
    activeTrip,
    activeTripStatus,
    approachRouteData,
    tripRouteData,
    service,
  ]);

  const handleMapPick = (loc: Location) => {
    const label = `${loc.getLatitude().toFixed(4)}, ${loc.getLongitude().toFixed(4)}`;
    if (pickMode === 'pickup') {
      setPickupLocation(loc);
      setPickupLabel(label);
    } else if (pickMode === 'dropoff') {
      setDropoffLocation(loc);
      setDropoffLabel(label);
    }
    setPickMode('none');
  };

  const handleToggleDriverStatus = (driverId: string) => {
    const driver = service.getDriverById(driverId);
    if (!driver) return;
    const current = driver.getStatus();
    if (current === DriverStatus.IN_TRIP) return;
    service.setDriverStatus(
      driverId,
      current === DriverStatus.ONLINE ? DriverStatus.OFFLINE : DriverStatus.ONLINE
    );
  };

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['marker', 'places', 'routes']}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#090D16] text-slate-100">
        {/* Mandatory Google Maps Demo Quota Banner */}
        {quotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        {/* Top Bar Contract: Brand Wordmark | Locality Search & GPS | Primary Fleet Actions */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-800/90 bg-[#0B111E] px-4 lg:gap-8 lg:px-6">
          {/* Zone 1: Single-element Brand Wordmark */}
          <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            RideGrid
          </span>

          {/* Zone 2: Locality Search & GPS Detect */}
          <div className="flex min-w-0 flex-1 max-w-xl items-center gap-2">
            <div className="min-w-0 flex-1">
              <PlaceSearchInput
                placeholder="Search any city or neighborhood..."
                valueLabel={localityLabel}
                onSelect={handleLocalitySelect}
                compact
              />
            </div>
            <button
              type="button"
              onClick={() => handleDetectLocation(false)}
              disabled={locatingGps}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#0F172A] px-3 text-xs font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Locate className={`h-3.5 w-3.5 text-sky-400 ${locatingGps ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{locatingGps ? 'Locating...' : 'My Location'}</span>
            </button>
          </div>

          {/* Zone 3: Fleet Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => service.spawnRandomFleet(new Location(mapCenter.lat, mapCenter.lng), 6, 3)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#0F172A] px-3 text-xs font-medium text-slate-200 hover:border-sky-500/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden md:inline">Spawn Fleet</span>
            </button>
            <button
              type="button"
              onClick={() => seedLocality(mapCenter, localityLabel, null, userGpsLocation)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </header>

        {/* Mobile View Switcher (< lg) */}
        <div className="flex lg:hidden border-b border-slate-800 bg-[#0B111E] px-3 py-2 gap-1.5 shrink-0">
          {(['map', 'dispatch', 'inspector'] as MobileView[]).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setMobileView(view)}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition-colors ${
                mobileView === view
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'bg-slate-900 text-slate-400'
              }`}
            >
              {view === 'inspector' ? 'Logs & Fleet' : view}
            </button>
          ))}
        </div>

        {/* Main 3-Column Command Center Workspace */}
        <main className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left Dock: Ride Dispatch, Fleet Registration & Strategies */}
          <div
            className={`${
              mobileView === 'dispatch' ? 'flex' : 'hidden'
            } lg:flex h-full w-full lg:w-[360px] xl:w-[380px] shrink-0 overflow-hidden`}
          >
            <DispatchPanel
              service={service}
              mapCenter={mapCenter}
              riders={riders}
              drivers={drivers}
              selectedRiderId={selectedRiderId}
              onSelectRiderId={setSelectedRiderId}
              pickupLocation={pickupLocation}
              pickupLabel={pickupLabel}
              dropoffLocation={dropoffLocation}
              dropoffLabel={dropoffLabel}
              onSetPickup={(loc, label) => {
                setPickupLocation(loc);
                setPickupLabel(label);
              }}
              onSetDropoff={(loc, label) => {
                setDropoffLocation(loc);
                setDropoffLabel(label);
              }}
              pickMode={pickMode}
              onSetPickMode={setPickMode}
              selectedRideType={selectedRideType}
              onSelectRideType={setSelectedRideType}
              tripRouteData={tripRouteData}
              onUseGpsPickup={handleUseGpsPickup}
              activeTrip={activeTrip}
              onActiveTripChange={(trip) => {
                setActiveTripId(trip ? trip.getId() : null);
                setMobileView('map');
              }}
              autoAnimate={autoAnimate}
              onToggleAutoAnimate={setAutoAnimate}
              autoProgress={autoProgress}
              onToggleAutoProgress={setAutoProgress}
              pricingStrategy={pricingStrategy}
              matchingStrategyRadius={matchingStrategy.maxDistanceKm}
              onSpawnExtraFleet={() =>
                service.spawnRandomFleet(new Location(mapCenter.lat, mapCenter.lng), 6, 3)
              }
            />
          </div>

          {/* Center Canvas: Live Google Map */}
          <div
            className={`${
              mobileView === 'map' ? 'flex' : 'hidden'
            } lg:flex relative min-w-0 flex-1 h-full`}
          >
            {!GOOGLE_MAPS_API_KEY ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#090D16] p-6 text-center">
                <RefreshCw className="h-8 w-8 text-slate-500" />
                <p className="text-sm font-medium text-slate-200">
                  Google Maps API key not detected in runtime environment.
                </p>
                <p className="max-w-md text-xs text-slate-400">
                  Ensure Google Maps setup completed in AI Studio or configure{' '}
                  <code className="font-mono text-sky-400">VITE_GOOGLE_MAPS_API_KEY</code>.
                </p>
              </div>
            ) : (
              <SimulationMap
                center={mapCenter}
                viewportToFit={viewportToFit}
                panTrigger={panTrigger}
                userGpsLocation={userGpsLocation}
                drivers={drivers}
                riders={riders}
                activeTrip={activeTrip}
                pickupLocation={pickupLocation}
                dropoffLocation={dropoffLocation}
                pickMode={pickMode}
                onMapPick={handleMapPick}
                onCancelPickMode={() => setPickMode('none')}
                selectedEntity={selectedEntity}
                onSelectEntity={setSelectedEntity}
                onToggleDriverStatus={handleToggleDriverStatus}
                onAcceptTrip={(driverId, tripId) => service.acceptRide(driverId, tripId)}
                onSelectRiderForBooking={(riderId) => {
                  setSelectedRiderId(riderId);
                  const rider = service.getRiderById(riderId);
                  if (rider) {
                    const loc = rider.getCurrentLocation();
                    setPickupLocation(loc);
                    setPickupLabel(
                      `${loc.getLatitude().toFixed(4)}, ${loc.getLongitude().toFixed(4)}`
                    );
                  }
                  setMobileView('dispatch');
                }}
                onTripRouteComputed={setTripRouteData}
                onApproachRouteComputed={setApproachRouteData}
              />
            )}
          </div>

          {/* Right Drawer: Observer Logs, Driver Roster & Trip History */}
          <div
            className={`${
              mobileView === 'inspector' ? 'flex' : 'hidden'
            } lg:flex h-full w-full lg:w-[340px] xl:w-[360px] shrink-0 overflow-hidden`}
          >
            <InspectorDrawer
              service={service}
              logs={logs}
              drivers={drivers}
              riders={riders}
              trips={trips}
              activeTrip={activeTrip}
              pickupLocation={pickupLocation}
              onSelectTrip={(trip) => {
                setActiveTripId(trip.getId());
                if (trip.getStatus() === TripStatus.COMPLETED || trip.getStatus() === TripStatus.CANCELLED) {
                  setPickupLocation(trip.getPickupLocation());
                  setPickupLabel(trip.getPickupLabel());
                  setDropoffLocation(trip.getDropoffLocation());
                  setDropoffLabel(trip.getDropoffLabel());
                }
              }}
              onFocusDriver={(driver) => {
                setMapCenter(driver.getCurrentLocation().toLatLng());
                setViewportToFit(null);
                setPanTrigger((t) => t + 1);
                setSelectedEntity({type: 'driver', id: driver.getId()});
                setMobileView('map');
              }}
            />
          </div>
        </main>
      </div>
    </APIProvider>
  );
}
