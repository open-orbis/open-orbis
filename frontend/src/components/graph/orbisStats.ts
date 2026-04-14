import type { OrbData, OrbNode } from '../../api/orbs';

const SKILL_LABEL = 'Skill';
const PERSON_LABEL = 'Person';
const SKILL_LINK_TYPE = 'USED_SKILL';
const DOMAIN_TYPE_UNIVERSE = [
  'Education',
  'WorkExperience',
  'Certification',
  'Language',
  'Publication',
  'Project',
  'Skill',
  'Patent',
  'Award',
  'Outreach',
  'Training',
] as const;

const DATE_FIELDS = [
  'start_date', 'end_date', 'date',
  'issue_date', 'expiry_date',
  'filing_date', 'grant_date',
] as const;

const REQUIRED_FIELDS_BY_TYPE: Record<string, string[]> = {
  Education: ['institution', 'degree', 'start_date'],
  WorkExperience: ['title', 'company', 'start_date'],
  Certification: ['name', 'issuing_organization'],
  Language: ['name', 'proficiency'],
  Publication: ['title'],
  Project: ['title', 'description'],
  Skill: ['name'],
  Patent: ['title'],
  Award: ['title'],
  Outreach: ['title'],
  Training: ['title'],
};

export interface OrbisStatsSummary {
  visibleNodes: number;
  activeNodes: number;
  visibleLinks: number;
  activeLinks: number;
  hiddenNodes: number;
  mutedNodes: number;
  typeDiversity: number;
  avgLinksPerNode: number;
  density: number;
  connectivityRate: number;
  skillCoverageRate: number;
  skillLinkedNodes: number;
  skillEligibleNodes: number;
  topHubName: string;
  topHubType: string | null;
  topHubDegree: number;
  signatureSkillName: string;
  signatureSkillLinks: number;
  usedSkillEdges: number;
  focusTopSkillEdges: number;
  focusScore: number;
  careerSpanMonths: number;
  careerSpanYears: number;
  careerSpanHasData: boolean;
  careerSpanLabel: string;
  recencyScore: number;
  recentActiveNodes: number;
  hubConcentration: number;
  domainBalanceScore: number;
  completenessRate: number;
  completeNodes: number;
  largestClusterRate: number;
  largestClusterNodes: number;
  shareReadinessScore: number;
  filtersActive: boolean;
}

const DISPLAY_FIELDS = [
  'name',
  'title',
  'company',
  'institution',
  'organization',
  'role',
  'degree',
  'issuing_organization',
] as const;

function getPrimaryLabel(node: Pick<OrbNode, '_labels'> | Record<string, unknown>): string {
  const labels = (node._labels as string[] | undefined) ?? [];
  return labels[0] ?? '';
}

function getLinkEndpointId(endpoint: unknown): string {
  if (typeof endpoint === 'string') return endpoint;
  if (endpoint && typeof endpoint === 'object') {
    const maybeEndpoint = endpoint as { id?: unknown; uid?: unknown };
    if (typeof maybeEndpoint.id === 'string') return maybeEndpoint.id;
    if (typeof maybeEndpoint.uid === 'string') return maybeEndpoint.uid;
  }
  return '';
}

function getNodeDisplayName(node: Record<string, unknown>): string {
  for (const field of DISPLAY_FIELDS) {
    const raw = node[field];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }

  const label = getPrimaryLabel(node);
  return label || 'Node';
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return false;
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === 'present' || trimmed === 'current') return null;

  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01`;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;

  const isoMatch = trimmed.match(/^(\d{4}-\d{2})-\d{2}/);
  if (isoMatch) return isoMatch[1];

  const mmYyyy = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1].padStart(2, '0')}`;

  const ddMmYyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMmYyyy) return `${ddMmYyyy[3]}-${ddMmYyyy[2].padStart(2, '0')}`;

  return null;
}

function getNormalizedNodeDates(node: Record<string, unknown>): string[] {
  const dates: string[] = [];
  for (const field of DATE_FIELDS) {
    const value = node[field];
    if (typeof value !== 'string') continue;
    const normalized = normalizeDate(value);
    if (normalized) dates.push(normalized);
  }
  return dates;
}

function toMonthIndex(ym: string): number {
  const [year, month] = ym.split('-').map(Number);
  return year * 12 + (month - 1);
}

function formatMonthIndex(monthIndex: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  return `${months[month]} ${year}`;
}

function isNodeComplete(node: Record<string, unknown>): boolean {
  const nodeType = getPrimaryLabel(node);
  const required = REQUIRED_FIELDS_BY_TYPE[nodeType];
  if (required?.length) {
    return required.every((key) => hasValue(node[key]));
  }
  return DISPLAY_FIELDS.some((field) => hasValue(node[field]));
}

export function computeOrbisStatsSummary(
  data: OrbData,
  hiddenNodeTypes: Set<string> = new Set(),
  filteredNodeIds: Set<string> = new Set(),
  referenceDate: Date = new Date(),
): OrbisStatsSummary {
  const personId = ((data.person.user_id || data.person.orb_id) as string) || 'person';
  const hiddenTypes = hiddenNodeTypes ?? new Set<string>();
  const filteredIds = filteredNodeIds ?? new Set<string>();

  const nodesById = new Map<string, Record<string, unknown>>();
  nodesById.set(personId, { id: personId, ...data.person, _labels: [PERSON_LABEL] });

  const visibleDomainNodes = data.nodes.filter((node) => {
    const label = getPrimaryLabel(node);
    if (hiddenTypes.has(label)) return false;
    nodesById.set(node.uid, node);
    return true;
  });

  const visibleIds = new Set<string>([personId, ...visibleDomainNodes.map((node) => node.uid)]);
  const activeDomainNodes = visibleDomainNodes.filter((node) => !filteredIds.has(node.uid));
  const activeIds = new Set<string>([personId, ...activeDomainNodes.map((node) => node.uid)]);

  const visibleLinks = data.links.filter((link) => {
    const source = getLinkEndpointId(link.source);
    const target = getLinkEndpointId(link.target);
    return source && target && visibleIds.has(source) && visibleIds.has(target);
  });

  const activeLinks = visibleLinks.filter((link) => {
    const source = getLinkEndpointId(link.source);
    const target = getLinkEndpointId(link.target);
    return activeIds.has(source) && activeIds.has(target);
  });

  const degreeById = new Map<string, number>();
  for (const id of activeIds) degreeById.set(id, 0);
  for (const link of activeLinks) {
    const source = getLinkEndpointId(link.source);
    const target = getLinkEndpointId(link.target);
    degreeById.set(source, (degreeById.get(source) ?? 0) + 1);
    degreeById.set(target, (degreeById.get(target) ?? 0) + 1);
  }

  const connectedActiveNodes = activeDomainNodes.filter((node) => (degreeById.get(node.uid) ?? 0) > 0).length;
  const typeDiversity = new Set(activeDomainNodes.map((node) => getPrimaryLabel(node)).filter(Boolean)).size;
  const avgLinksPerNode = activeDomainNodes.length > 0 ? activeLinks.length / activeDomainNodes.length : 0;
  const possibleEdges = activeIds.size > 1 ? (activeIds.size * (activeIds.size - 1)) / 2 : 0;
  const density = possibleEdges > 0 ? activeLinks.length / possibleEdges : 0;

  const skillCoverageCandidates = activeDomainNodes.filter((node) => getPrimaryLabel(node) !== SKILL_LABEL);
  const linkedCandidateIds = new Set<string>();
  const skillEdgeCountById = new Map<string, number>();
  let usedSkillEdges = 0;

  for (const link of activeLinks) {
    if (link.type !== SKILL_LINK_TYPE) continue;
    const source = getLinkEndpointId(link.source);
    const target = getLinkEndpointId(link.target);
    const sourceType = getPrimaryLabel(nodesById.get(source) ?? {});
    const targetType = getPrimaryLabel(nodesById.get(target) ?? {});

    if (sourceType === SKILL_LABEL && targetType !== SKILL_LABEL && targetType !== PERSON_LABEL) {
      linkedCandidateIds.add(target);
      usedSkillEdges += 1;
      skillEdgeCountById.set(source, (skillEdgeCountById.get(source) ?? 0) + 1);
    } else if (targetType === SKILL_LABEL && sourceType !== SKILL_LABEL && sourceType !== PERSON_LABEL) {
      linkedCandidateIds.add(source);
      usedSkillEdges += 1;
      skillEdgeCountById.set(target, (skillEdgeCountById.get(target) ?? 0) + 1);
    }
  }

  const topHub = [...activeDomainNodes]
    .map((node) => ({ uid: node.uid, degree: degreeById.get(node.uid) ?? 0 }))
    .filter((entry) => entry.degree > 0)
    .sort((a, b) => b.degree - a.degree || a.uid.localeCompare(b.uid))[0];

  const topHubNode = topHub ? nodesById.get(topHub.uid) : null;
  const topHubName = topHubNode ? getNodeDisplayName(topHubNode) : 'No active links yet';
  const topHubType = topHubNode ? getPrimaryLabel(topHubNode) || null : null;
  const topHubDegree = topHub?.degree ?? 0;
  const hubConcentration = clampRatio(activeLinks.length > 0 ? topHubDegree / activeLinks.length : 0);

  const signatureSkill = [...skillEdgeCountById.entries()]
    .map(([uid, links]) => {
      const skillNode = nodesById.get(uid) ?? {};
      return { uid, links, name: getNodeDisplayName(skillNode) };
    })
    .sort((a, b) => b.links - a.links || a.name.localeCompare(b.name))[0];

  const signatureSkillName = signatureSkill?.name ?? 'No linked skill yet';
  const signatureSkillLinks = signatureSkill?.links ?? 0;
  const topSkillEntries = [...skillEdgeCountById.values()].sort((a, b) => b - a);
  const focusTopSkillEdges = topSkillEntries.slice(0, 3).reduce((sum, count) => sum + count, 0);
  const focusScore = clampRatio(usedSkillEdges > 0 ? focusTopSkillEdges / usedSkillEdges : 0);

  const allDateMonths: number[] = [];
  for (const node of activeDomainNodes) {
    const dates = getNormalizedNodeDates(node);
    for (const date of dates) allDateMonths.push(toMonthIndex(date));
  }

  const careerSpanHasData = allDateMonths.length > 0;
  const minDateMonth = careerSpanHasData ? Math.min(...allDateMonths) : 0;
  const maxDateMonth = careerSpanHasData ? Math.max(...allDateMonths) : 0;
  const careerSpanMonths = careerSpanHasData ? Math.max(0, maxDateMonth - minDateMonth) : 0;
  const careerSpanYears = careerSpanMonths / 12;
  const careerSpanLabel = careerSpanHasData
    ? `${formatMonthIndex(minDateMonth)} - ${formatMonthIndex(maxDateMonth)}`
    : 'No dated nodes';

  const currentMonth = referenceDate.getUTCFullYear() * 12 + referenceDate.getUTCMonth();
  const recencyCutoffMonth = currentMonth - 23;
  const recentActiveNodes = activeDomainNodes.filter((node) => {
    const dates = getNormalizedNodeDates(node);
    if (dates.length === 0) return false;
    return dates.some((date) => toMonthIndex(date) >= recencyCutoffMonth);
  }).length;
  const recencyScore = clampRatio(activeDomainNodes.length > 0 ? recentActiveNodes / activeDomainNodes.length : 0);

  const domainTypeCounts = new Map<string, number>();
  for (const node of activeDomainNodes) {
    const type = getPrimaryLabel(node);
    if (!type) continue;
    domainTypeCounts.set(type, (domainTypeCounts.get(type) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of domainTypeCounts.values()) {
    const proportion = count / Math.max(1, activeDomainNodes.length);
    entropy += -proportion * Math.log(proportion);
  }
  const maxEntropy = Math.log(DOMAIN_TYPE_UNIVERSE.length);
  const domainBalanceScore = clampRatio(maxEntropy > 0 ? entropy / maxEntropy : 0);

  const completeNodes = activeDomainNodes.filter((node) => isNodeComplete(node)).length;
  const completenessRate = clampRatio(activeDomainNodes.length > 0 ? completeNodes / activeDomainNodes.length : 0);

  const adjacency = new Map<string, Set<string>>();
  for (const id of activeIds) adjacency.set(id, new Set<string>());
  for (const link of activeLinks) {
    const source = getLinkEndpointId(link.source);
    const target = getLinkEndpointId(link.target);
    adjacency.get(source)?.add(target);
    adjacency.get(target)?.add(source);
  }

  let largestClusterNodes = 0;
  const visited = new Set<string>();
  for (const id of activeIds) {
    if (visited.has(id)) continue;
    const queue = [id];
    visited.add(id);
    let domainNodeCount = 0;

    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (current !== personId) domainNodeCount += 1;
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    if (domainNodeCount > largestClusterNodes) largestClusterNodes = domainNodeCount;
  }
  const largestClusterRate = clampRatio(
    activeDomainNodes.length > 0 ? largestClusterNodes / activeDomainNodes.length : 0,
  );

  // Share readiness: weighted blend of profile quality signals.
  const shareReadinessScore = clampRatio(
    (0.4 * completenessRate) +
    (0.25 * (skillCoverageCandidates.length > 0 ? linkedCandidateIds.size / skillCoverageCandidates.length : 0)) +
    (0.2 * (activeDomainNodes.length > 0 ? connectedActiveNodes / activeDomainNodes.length : 0)) +
    (0.15 * domainBalanceScore),
  );

  return {
    visibleNodes: visibleDomainNodes.length,
    activeNodes: activeDomainNodes.length,
    visibleLinks: visibleLinks.length,
    activeLinks: activeLinks.length,
    hiddenNodes: data.nodes.length - visibleDomainNodes.length,
    mutedNodes: visibleDomainNodes.length - activeDomainNodes.length,
    typeDiversity,
    avgLinksPerNode,
    density: clampRatio(density),
    connectivityRate: clampRatio(activeDomainNodes.length > 0 ? connectedActiveNodes / activeDomainNodes.length : 0),
    skillCoverageRate: clampRatio(
      skillCoverageCandidates.length > 0 ? linkedCandidateIds.size / skillCoverageCandidates.length : 0,
    ),
    skillLinkedNodes: linkedCandidateIds.size,
    skillEligibleNodes: skillCoverageCandidates.length,
    signatureSkillName,
    signatureSkillLinks,
    usedSkillEdges,
    focusTopSkillEdges,
    focusScore,
    careerSpanMonths,
    careerSpanYears,
    careerSpanHasData,
    careerSpanLabel,
    recencyScore,
    recentActiveNodes,
    hubConcentration,
    domainBalanceScore,
    completenessRate,
    completeNodes,
    largestClusterRate,
    largestClusterNodes,
    shareReadinessScore,
    topHubName,
    topHubType,
    topHubDegree,
    filtersActive: filteredIds.size > 0 || hiddenTypes.size > 0,
  };
}
