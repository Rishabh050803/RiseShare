import {useMap, useMapsLibrary} from '@vis.gl/react-google-maps';
import {useEffect, useRef} from 'react';
import {domainLogger} from '../domain/eventBus';

export interface ComputedRouteData {
  distanceKm: number;
  durationMinutes: number;
  path: google.maps.LatLngLiteral[];
  isRoadRoute: boolean;
  errorMessage?: string;
}

interface RouteLayerProps {
  origin: google.maps.LatLngLiteral | null;
  destination: google.maps.LatLngLiteral | null;
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
  fitBounds?: boolean;
  label?: string;
  onRouteComputed?: (data: ComputedRouteData | null) => void;
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('429') ||
    msg.includes('Quota')
  );
}

function extractLatLng(pt: unknown): google.maps.LatLngLiteral | null {
  if (!pt || typeof pt !== 'object') return null;
  const candidate = pt as {lat?: number | (() => number); lng?: number | (() => number)};
  const latVal = typeof candidate.lat === 'function' ? candidate.lat() : candidate.lat;
  const lngVal = typeof candidate.lng === 'function' ? candidate.lng() : candidate.lng;
  if (typeof latVal === 'number' && typeof lngVal === 'number' && Number.isFinite(latVal) && Number.isFinite(lngVal)) {
    return {lat: latVal, lng: lngVal};
  }
  return null;
}

function haversineKm(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number {
  const R = 6371.0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export const RouteLayer = ({
  origin,
  destination,
  strokeColor = '#38BDF8',
  strokeWeight = 5,
  strokeOpacity = 0.9,
  fitBounds = false,
  label = 'Route',
  onRouteComputed,
}: RouteLayerProps) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const onRouteComputedRef = useRef(onRouteComputed);

  useEffect(() => {
    onRouteComputedRef.current = onRouteComputed;
  }, [onRouteComputed]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!map || !routesLib || !origin || !destination) {
      onRouteComputedRef.current?.(null);
      return;
    }

    let cancelled = false;

    const request: google.maps.routes.ComputeRoutesRequest = {
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    routesLib.Route.computeRoutes(request)
      .then(({routes}) => {
        if (cancelled) return;

        if (!routes || routes.length === 0) {
          const fallbackPolyline = new google.maps.Polyline({
            path: [origin, destination],
            geodesic: true,
            strokeColor,
            strokeOpacity: 0.45,
            strokeWeight: Math.max(2, strokeWeight - 2),
            map,
          });
          polylinesRef.current = [fallbackPolyline];
          onRouteComputedRef.current?.({
            distanceKm: haversineKm(origin, destination),
            durationMinutes: 0,
            path: [origin, destination],
            isRoadRoute: false,
            errorMessage: 'No drivable road route returned between these coordinates.',
          });
          return;
        }

        const primaryRoute = routes[0];
        const created = primaryRoute.createPolylines({
          polylineOptions: {
            strokeColor,
            strokeWeight,
            strokeOpacity,
          },
        });

        created.forEach((polyline) => {
          polyline.setOptions({
            strokeColor,
            strokeWeight,
            strokeOpacity,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = created;

        if (fitBounds && primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport, {top: 48, bottom: 48, left: 48, right: 48});
        }

        const rawPath = primaryRoute.path ?? [];
        const literalPath = rawPath
          .map((pt) => extractLatLng(pt))
          .filter((pt): pt is google.maps.LatLngLiteral => pt !== null);

        const distanceKm = (primaryRoute.distanceMeters ?? 0) / 1000;
        const durationMinutes = (primaryRoute.durationMillis ?? 0) / 60000;

        onRouteComputedRef.current?.({
          distanceKm: distanceKm > 0 ? distanceKm : haversineKm(origin, destination),
          durationMinutes,
          path: literalPath.length >= 2 ? literalPath : [origin, destination],
          isRoadRoute: literalPath.length >= 2,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err ?? 'Unknown Routes API error');
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }

        domainLogger.emit('WARNING', `${label} Road Routing Fallback`, [
          `Routes API returned an error: ${msg}`,
          'Ensure "Routes API" is enabled for your VITE_GOOGLE_MAPS_API_KEY in Google Cloud Console. Falling back to straight-line path.',
        ]);

        const fallbackPolyline = new google.maps.Polyline({
          path: [origin, destination],
          geodesic: true,
          strokeColor,
          strokeOpacity: 0.45,
          strokeWeight: Math.max(2, strokeWeight - 2),
          map,
        });
        polylinesRef.current = [fallbackPolyline];

        onRouteComputedRef.current?.({
          distanceKm: haversineKm(origin, destination),
          durationMinutes: 0,
          path: [origin, destination],
          isRoadRoute: false,
          errorMessage: msg,
        });
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [
    map,
    routesLib,
    origin?.lat,
    origin?.lng,
    destination?.lat,
    destination?.lng,
    strokeColor,
    strokeWeight,
    strokeOpacity,
    fitBounds,
    label,
  ]);

  return null;
};
