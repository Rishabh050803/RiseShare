import {useEffect, useState} from 'react';
import {domainLogger} from '../domain/eventBus';
import {RideSharingService} from '../domain/rideSharingService';
import type {ObserverLogEntry} from '../domain/tripObserver';

export function useRideSharing() {
  const service = RideSharingService.getInstance();
  const [, setVersion] = useState(0);
  const [logs, setLogs] = useState<ObserverLogEntry[]>(() => domainLogger.getLogs());

  useEffect(() => {
    const unsubService = service.subscribe(() => {
      setVersion((v) => v + 1);
    });
    const unsubLogs = domainLogger.subscribe(() => {
      setLogs([...domainLogger.getLogs()]);
    });
    return () => {
      unsubService();
      unsubLogs();
    };
  }, [service]);

  return {
    service,
    riders: service.getRiders(),
    drivers: service.getDrivers(),
    trips: service.getTrips(),
    logs,
    pricingStrategy: service.getPricingStrategy(),
    matchingStrategy: service.getDriverMatchingStrategy(),
  };
}
