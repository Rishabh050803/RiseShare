import {Loader2, MapPin, Search, X} from 'lucide-react';
import React, {useEffect, useRef, useState} from 'react';
import {useAutocompleteSuggestions} from '../hooks/useAutocompleteSuggestions';

export interface SelectedPlaceResult {
  lat: number;
  lng: number;
  label: string;
  viewport?: google.maps.LatLngBounds | null;
}

interface PlaceSearchInputProps {
  placeholder: string;
  valueLabel?: string;
  locationBias?: google.maps.LatLngLiteral | null;
  onSelect: (result: SelectedPlaceResult) => void;
  onClear?: () => void;
  compact?: boolean;
  accentIcon?: 'search' | 'pickup' | 'dropoff';
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

export const PlaceSearchInput: React.FC<PlaceSearchInputProps> = ({
  placeholder,
  valueLabel = '',
  locationBias = null,
  onSelect,
  onClear,
  compact = false,
  accentIcon = 'search',
}) => {
  const [query, setQuery] = useState(valueLabel);
  const [isOpen, setIsOpen] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(valueLabel);
  }, [valueLabel]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const {suggestions, isLoading, resetSession} = useAutocompleteSuggestions(
    isOpen ? query : '',
    locationBias
  );

  const handleSuggestionClick = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    const prediction = suggestion.placePrediction;
    if (!prediction) return;

    setFetchingDetails(true);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ['location', 'viewport', 'displayName', 'formattedAddress'],
      });

      if (place.location) {
        const label =
          place.displayName ||
          place.formattedAddress ||
          prediction.text?.text ||
          'Selected Place';
        setQuery(label);
        setIsOpen(false);
        resetSession();
        onSelect({
          lat: place.location.lat(),
          lng: place.location.lng(),
          label,
          viewport: place.viewport ?? null,
        });
      }
    } catch (err) {
      if (isQuotaError(err)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    } finally {
      setFetchingDetails(false);
    }
  };

  const iconEl =
    accentIcon === 'pickup' ? (
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0" />
    ) : accentIcon === 'dropoff' ? (
      <span className="h-2.5 w-2.5 rounded-sm bg-sky-400 shrink-0" />
    ) : (
      <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
    );

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={`flex items-center gap-2 rounded-lg border border-slate-700/80 bg-[#0B111E] px-2.5 transition-colors focus-within:border-sky-500/80 ${
          compact ? 'h-9' : 'h-10'
        }`}
      >
        {iconEl}
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          className="w-full min-w-0 bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        {(isLoading || fetchingDetails) && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400 shrink-0" />
        )}
        {query && !isLoading && !fetchingDetails && (
          <button
            type="button"
            aria-label="Clear location"
            onClick={() => {
              setQuery('');
              resetSession();
              onClear?.();
            }}
            className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-700 bg-[#0F172A] py-1 shadow-xl">
          {suggestions.map((suggestion, index) => {
            const mainText = suggestion.placePrediction?.mainText?.text;
            const secondaryText = suggestion.placePrediction?.secondaryText?.text;
            const fallbackText = suggestion.placePrediction?.text?.text;

            return (
              <li key={suggestion.placePrediction?.placeId ?? index}>
                <button
                  type="button"
                  onClick={() => void handleSuggestionClick(suggestion)}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs hover:bg-slate-800/80 transition-colors"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-100">
                      {mainText ?? fallbackText ?? 'Location'}
                    </div>
                    {secondaryText && (
                      <div className="truncate text-[11px] text-slate-400">{secondaryText}</div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
