// One-time "post-tour AI connect prompt" gate, mirroring the
// orbis_tour_completed pattern in GuidedTour.tsx.
const AI_CONNECT_SEEN_KEY = 'orbis_ai_connect_seen';

export function isAiConnectSeen(): boolean {
  return localStorage.getItem(AI_CONNECT_SEEN_KEY) === 'true';
}

export function markAiConnectSeen(): void {
  localStorage.setItem(AI_CONNECT_SEEN_KEY, 'true');
}

export function resetAiConnectSeen(): void {
  localStorage.removeItem(AI_CONNECT_SEEN_KEY);
}

// Pure gate used by both triggers: after the tour finishes, and once on
// mount for users who finished the tour before this feature shipped.
export function shouldAutoOpenAiConnect(
  tourCompleted: boolean,
  seen: boolean,
): boolean {
  return tourCompleted && !seen;
}
