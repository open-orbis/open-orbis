/**
 * Analytics tracker — thin abstraction over posthog-js.
 * Components import this module, never posthog-js directly.
 * All functions are fire-and-forget (never throw).
 */
import posthog from 'posthog-js';

let initialized = false;

export function initTracker(): void {
  try {
    if (import.meta.env.VITE_ANALYTICS_ENABLED === 'false') return;

    const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
    const host = import.meta.env.VITE_POSTHOG_HOST || 'http://localhost:8001';

    if (!apiKey) return;

    posthog.init(apiKey, {
      api_host: host,
      autocapture: true,
      capture_pageview: true,
      capture_pageleave: true,
      persistence: 'localStorage',
    });

    initialized = true;
  } catch {
    console.warn('PostHog init failed — analytics disabled');
  }
}

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.capture(name, properties);
  } catch {
    // fire-and-forget
  }
}

export function identifyUser(userId: string): void {
  if (!initialized) return;
  try {
    posthog.identify(userId);
  } catch {
    // fire-and-forget
  }
}

export function resetUser(): void {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    // fire-and-forget
  }
}
