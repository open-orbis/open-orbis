import client from './client';

export interface TelemetryEvent {
  event_type: string;
  page_path: string;
  component_name?: string;
  properties?: Record<string, any>;
}

export async function logEvent(event: TelemetryEvent): Promise<void> {
  try {
    await client.post('/telemetry/event', event);
  } catch (e) {
    // Fail silently to not disrupt user experience
    console.error('Telemetry failed:', e);
  }
}
