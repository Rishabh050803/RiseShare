import {Car, Clock, LocateFixed, Power, Trash2} from 'lucide-react';
import React, {useState} from 'react';
import type {Driver} from '../domain/driver';
import {DriverStatus, TripStatus} from '../domain/enums';
import {domainLogger} from '../domain/eventBus';
import type {Location} from '../domain/location';
import type {Rider} from '../domain/rider';
import type {RideSharingService} from '../domain/rideSharingService';
import type {Trip} from '../domain/trip';
import type {LogCategory, ObserverLogEntry} from '../domain/tripObserver';

interface InspectorDrawerProps {
  service: RideSharingService;
  logs: ObserverLogEntry[];
  drivers: Driver[];
  riders: Rider[];
  trips: Trip[];
  activeTrip: Trip | null;
  pickupLocation: Location | null;
  onSelectTrip: (trip: Trip) => void;
  onFocusDriver: (driver: Driver) => void;
}

type RightTab = 'logs' | 'drivers' | 'history';

const CATEGORY_TEXT_CLASS: Record<LogCategory, string> = {
  SERVICE: 'text-sky-400',
  RIDER: 'text-indigo-400',
  DRIVER: 'text-emerald-400',
  STATE: 'text-amber-400',
  STRATEGY: 'text-cyan-400',
  WARNING: 'text-rose-400',
};

function statusLabelClass(status: DriverStatus): string {
  if (status === DriverStatus.ONLINE) return 'text-emerald-400';
  if (status === DriverStatus.IN_TRIP) return 'text-amber-400';
  return 'text-slate-500';
}

function tripStatusTextClass(status: TripStatus): string {
  if (status === TripStatus.COMPLETED) return 'text-emerald-400';
  if (status === TripStatus.IN_PROGRESS) return 'text-sky-400';
  if (status === TripStatus.ASSIGNED) return 'text-amber-400';
  if (status === TripStatus.CANCELLED) return 'text-rose-400';
  return 'text-slate-300';
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  service,
  logs,
  drivers,
  riders,
  trips,
  activeTrip,
  pickupLocation,
  onSelectTrip,
  onFocusDriver,
}) => {
  const [activeTab, setActiveTab] = useState<RightTab>('logs');
  const [logFilter, setLogFilter] = useState<'ALL' | LogCategory>('ALL');
  const [driverFilter, setDriverFilter] = useState<'ALL' | DriverStatus>('ALL');
  const [historyFilterRider, setHistoryFilterRider] = useState<string>('ALL');

  const filteredLogs =
    logFilter === 'ALL' ? logs : logs.filter((entry) => entry.category === logFilter);

  const filteredDrivers =
    driverFilter === 'ALL' ? drivers : drivers.filter((d) => d.getStatus() === driverFilter);

  const filteredTrips =
    historyFilterRider === 'ALL'
      ? trips
      : trips.filter((t) => t.getRider().getId() === historyFilterRider);

  const notifiedDriverIds: Record<string, boolean> = {};
  if (activeTrip && activeTrip.getStatus() === TripStatus.REQUESTED) {
    for (const id of activeTrip.getNotifiedDriverIds()) {
      notifiedDriverIds[id] = true;
    }
  }

  const onlineCount = drivers.filter((d) => d.getStatus() === DriverStatus.ONLINE).length;
  const inTripCount = drivers.filter((d) => d.getStatus() === DriverStatus.IN_TRIP).length;

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-800/90 bg-[#0D1320]">
      {/* Segmented Control */}
      <div className="border-b border-slate-800/90 p-3">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#080C15] p-1 border border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'logs'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Observer Logs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('drivers')}
            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'drivers'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Drivers ({drivers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'history'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Trips ({trips.length})
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3.5">
        {activeTab === 'logs' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value as 'ALL' | LogCategory)}
                className="h-8 rounded-md border border-slate-800 bg-[#0B111E] px-2 text-[11px] text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="ALL">All Events ({logs.length})</option>
                <option value="RIDER">Rider.onUpdate</option>
                <option value="DRIVER">Driver.onUpdate</option>
                <option value="STATE">TripState Transitions</option>
                <option value="SERVICE">RideSharingService</option>
                <option value="STRATEGY">Strategy Changes</option>
                <option value="WARNING">Warnings</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  domainLogger.clear();
                  service.notifyUiRefresh();
                }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-[#0B111E] px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="rounded-lg border border-slate-800/80 bg-[#0B111E] p-6 text-center text-xs text-slate-500">
                No observer events recorded yet. Request a ride or toggle a driver status to view{' '}
                <span className="font-mono text-slate-300">onUpdate()</span> callbacks.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-slate-800/80 bg-[#0B111E] p-2.5 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                      <span className={`font-semibold ${CATEGORY_TEXT_CLASS[entry.category]}`}>
                        {entry.category}
                      </span>
                      <span className="text-slate-500">{entry.timestamp}</span>
                    </div>
                    <p className="text-xs font-medium text-slate-100">{entry.title}</p>
                    <div className="space-y-0.5">
                      {entry.lines.map((line, i) => (
                        <p key={i} className="font-mono text-[11px] leading-snug text-slate-400">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'drivers' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
              <span>
                <strong className="font-mono text-emerald-400">{onlineCount}</strong> online ·{' '}
                <strong className="font-mono text-amber-400">{inTripCount}</strong> in trip
              </span>
              <select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value as 'ALL' | DriverStatus)}
                className="h-7 rounded border border-slate-800 bg-[#0B111E] px-2 text-[11px] text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value={DriverStatus.ONLINE}>ONLINE</option>
                <option value={DriverStatus.IN_TRIP}>IN_TRIP</option>
                <option value={DriverStatus.OFFLINE}>OFFLINE</option>
              </select>
            </div>

            {filteredDrivers.length === 0 ? (
              <div className="rounded-lg border border-slate-800/80 bg-[#0B111E] p-6 text-center text-xs text-slate-500">
                No drivers match this filter.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDrivers.map((driver) => {
                  const status = driver.getStatus();
                  const canAcceptActive =
                    activeTrip &&
                    activeTrip.getStatus() === TripStatus.REQUESTED &&
                    notifiedDriverIds[driver.getId()] &&
                    status === DriverStatus.ONLINE;
                  const distKm = pickupLocation
                    ? pickupLocation.distanceTo(driver.getCurrentLocation())
                    : null;

                  return (
                    <div
                      key={driver.getId()}
                      className="rounded-lg border border-slate-800/80 bg-[#0B111E] p-2.5 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-slate-100">
                              {driver.getName()}
                            </span>
                            <span className="text-slate-600">·</span>
                            <span className="font-mono text-[10px] text-sky-400">
                              {driver.getVehicle().getType()}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-slate-400">
                            {driver.getVehicle().getModel()} ·{' '}
                            <span className="font-mono">{driver.getVehicle().getLicenseNumber()}</span>
                          </p>
                        </div>
                        <span className={`font-mono text-[10px] font-semibold ${statusLabelClass(status)}`}>
                          {status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-slate-800/70 pt-2 text-[11px]">
                        <span className="font-mono text-slate-500">
                          {distKm !== null ? `${distKm.toFixed(2)} km to A` : `${driver.getTripHistory().length} trips`}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            title="Locate on map"
                            onClick={() => onFocusDriver(driver)}
                            className="rounded border border-slate-800 p-1 text-slate-400 hover:border-slate-700 hover:text-slate-100 transition-colors"
                          >
                            <LocateFixed className="h-3.5 w-3.5" />
                          </button>

                          {status !== DriverStatus.IN_TRIP && (
                            <button
                              type="button"
                              onClick={() =>
                                service.setDriverStatus(
                                  driver.getId(),
                                  status === DriverStatus.ONLINE
                                    ? DriverStatus.OFFLINE
                                    : DriverStatus.ONLINE
                                )
                              }
                              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-slate-200 hover:bg-slate-700 transition-colors"
                            >
                              <Power className="h-2.5 w-2.5" />
                              {status === DriverStatus.ONLINE ? 'Offline' : 'Online'}
                            </button>
                          )}

                          {canAcceptActive && activeTrip && (
                            <button
                              type="button"
                              onClick={() => service.acceptRide(driver.getId(), activeTrip.getId())}
                              className="rounded bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
                            >
                              Accept
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-slate-400">Filter by Rider</span>
              <select
                value={historyFilterRider}
                onChange={(e) => setHistoryFilterRider(e.target.value)}
                className="h-7 max-w-[180px] rounded border border-slate-800 bg-[#0B111E] px-2 text-[11px] text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="ALL">All Riders ({trips.length})</option>
                {riders.map((r) => (
                  <option key={r.getId()} value={r.getId()}>
                    {r.getName()} ({r.getTripHistory().length})
                  </option>
                ))}
              </select>
            </div>

            {filteredTrips.length === 0 ? (
              <div className="rounded-lg border border-slate-800/80 bg-[#0B111E] p-6 text-center text-xs text-slate-500">
                No trips requested yet. Select a rider, pickup, and dropoff to dispatch your first ride.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTrips.map((trip) => {
                  const isActive = activeTrip?.getId() === trip.getId();
                  return (
                    <button
                      key={trip.getId()}
                      type="button"
                      onClick={() => onSelectTrip(trip)}
                      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                        isActive
                          ? 'border-sky-500/70 bg-sky-500/10'
                          : 'border-slate-800/80 bg-[#0B111E] hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono font-semibold text-slate-200">
                          #{trip.getId().slice(0, 8)}
                        </span>
                        <span className={`font-mono text-[10px] font-semibold ${tripStatusTextClass(trip.getStatus())}`}>
                          {trip.getStatus()}
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-xs">
                        <span className="truncate font-medium text-slate-100">
                          {trip.getRider().getName()}
                        </span>
                        <span className="font-mono font-semibold text-white">
                          ${trip.getFare().toFixed(2)}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1 truncate">
                          <Car className="h-3 w-3 shrink-0" />
                          {trip.getDriver() ? trip.getDriver()!.getName() : 'Unassigned'} ·{' '}
                          {trip.getRideType()}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] shrink-0">
                          <Clock className="h-2.5 w-2.5" />
                          {trip.getDistanceKm().toFixed(2)} km
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
