import { useLocation } from 'react-router-dom';
import { useCallback } from 'react';
import { logEvent } from '../api/telemetry';

export function useTelemetry() {
  const location = useLocation();

  const trackEvent = useCallback((
    eventType: string,
    componentName?: string,
    properties?: Record<string, any>
  ) => {
    logEvent({
      event_type: eventType,
      page_path: location.pathname + location.search,
      component_name: componentName,
      properties: properties,
    });
  }, [location]);

  return { trackEvent };
}
