import type { OrbData, OrbNode } from '../../api/orbs';

const SKILL_LABEL = 'Skill';
const PERSON_LABEL = 'Person';
const SKILL_LINK_TYPE = 'USED_SKILL';

const DATE_FIELDS = [
  'start_date', 'end_date', 'date',
  'issue_date', 'expiry_date',
  'filing_date', 'grant_date',
] as const;

export interface NodeDetail {
  uid: string;
  name: string;
  type: string;
}

export interface ClusterDetail {
  nodes: NodeDetail[];
}

export interface OrbisStatsSummary {
  activeNodes: number;
  visibleNodes: number;
  activeLinks: number;
  visibleLinks: number;
  density: number;
  avgLinksPerNode: number;
  skillCoverageRate: number;
  skillLinkedNodes: number;
  skillEligibleNodes: number;
  topHubName: string;
  topHubType: string | null;
  topHubDegree: number;
  orphanNodes: number;
  orphanRate: number;
  orphanNodeDetails: NodeDetail[];
  freshnessScore: number;
  skillClusters: number;
  clusterDetails: ClusterDetail[];
  bridgeNodes: number;
  bridgeNodeDetails: NodeDetail[];
  filtersActive: boolean;
}

const DISPLAY_FIELDS = [
  'name', 'title', 'company', 'institution', 'organization',
  'role', 'degree', 'issuing_organization',
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

function formatTypeLabel(type: string | null): string {
  if (!type) return 'Node';
  return type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export { formatTypeLabel };

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

  const visibleDomainIds = new Set(visibleDomainNodes.map((n) => n.uid));
  const activeDomainNodes = visibleDomainNodes.filter((node) => !filteredIds.has(node.uid));
  const activeDomainIds = new Set(activeDomainNodes.map((n) => n.uid));

  // ── Filter links: exclude Person node edges ──
  const isPersonEdge = (link: { source: unknown; target: unknown }) => {
    const s = getLinkEndpointId(link.source);
    const t = getLinkEndpointId(link.target);
    return s === personId || t === personId;
  };

  const visibleLinks = data.links.filter((link) => {
    if (isPersonEdge(link)) return false;
    const s = getLinkEndpointId(link.source);
    const t = getLinkEndpointId(link.target);
    return s && t && visibleDomainIds.has(s) && visibleDomainIds.has(t);
  });

  const activeLinks = visibleLinks.filter((link) => {
    const s = getLinkEndpointId(link.source);
    const t = getLinkEndpointId(link.target);
    return activeDomainIds.has(s) && activeDomainIds.has(t);
  });

  // ── Degree counts (Person edges excluded) ──
  const degreeById = new Map<string, number>();
  for (const id of activeDomainIds) degreeById.set(id, 0);
  for (const link of activeLinks) {
    const s = getLinkEndpointId(link.source);
    const t = getLinkEndpointId(link.target);
    degreeById.set(s, (degreeById.get(s) ?? 0) + 1);
    degreeById.set(t, (degreeById.get(t) ?? 0) + 1);
  }

  // ── Density ──
  const n = activeDomainIds.size;
  const avgLinksPerNode = n > 0 ? activeLinks.length / n : 0;
  const possibleEdges = n > 1 ? (n * (n - 1)) / 2 : 0;
  const density = possibleEdges > 0 ? activeLinks.length / possibleEdges : 0;

  // ── Orphan nodes (0 edges after excluding Person edges) ──
  const orphanNodes = activeDomainNodes.filter((node) => (degreeById.get(node.uid) ?? 0) === 0).length;
  const orphanRate = clampRatio(n > 0 ? orphanNodes / n : 0);

  // ── Skill coverage ──
  const skillCoverageCandidates = activeDomainNodes.filter((node) => getPrimaryLabel(node) !== SKILL_LABEL);
  const linkedCandidateIds = new Set<string>();

  for (const link of activeLinks) {
    if (link.type !== SKILL_LINK_TYPE) continue;
    const s = getLinkEndpointId(link.source);
    const t = getLinkEndpointId(link.target);
    const sType = getPrimaryLabel(nodesById.get(s) ?? {});
    const tType = getPrimaryLabel(nodesById.get(t) ?? {});

    if (sType === SKILL_LABEL && tType !== SKILL_LABEL && tType !== PERSON_LABEL) {
      linkedCandidateIds.add(t);
    } else if (tType === SKILL_LABEL && sType !== SKILL_LABEL && sType !== PERSON_LABEL) {
      linkedCandidateIds.add(s);
    }
  }

  // ── Top Hub ──
  const topHub = [...activeDomainNodes]
    .map((node) => ({ uid: node.uid, degree: degreeById.get(node.uid) ?? 0 }))
    .filter((e) => e.degree > 0)
    .sort((a, b) => b.degree - a.degree || a.uid.localeCompare(b.uid))[0];

  const topHubNode = topHub ? nodesById.get(topHub.uid) : null;
  const topHubName = topHubNode ? getNodeDisplayName(topHubNode) : 'No active links yet';
  const topHubType = topHubNode ? getPrimaryLabel(topHubNode) || null : null;
  const topHubDegree = topHub?.degree ?? 0;

  // ── Orphan node details ──
  const orphanNodeDetails: NodeDetail[] = activeDomainNodes
    .filter((node) => (degreeById.get(node.uid) ?? 0) === 0)
    .map((node) => ({ uid: node.uid, name: getNodeDisplayName(node), type: formatTypeLabel(getPrimaryLabel(node)) }));

  // ── Freshness score ──
  // Score based on % of nodes with a date in the last 24 months.
  const currentMonth = referenceDate.getUTCFullYear() * 12 + referenceDate.getUTCMonth();
  const recencyCutoff = currentMonth - 23;
  const datedNodes = activeDomainNodes.filter((node) => getNormalizedNodeDates(node).length > 0);
  const recentNodes = datedNodes.filter((node) =>
    getNormalizedNodeDates(node).some((d) => toMonthIndex(d) >= recencyCutoff),
  );
  const freshnessScore = datedNodes.length > 0 ? clampRatio(recentNodes.length / datedNodes.length) : 0;

  // ── Skill clusters & bridge nodes ──
  // Build adjacency among domain nodes only (Person excluded)
  const adj = new Map<string, Set<string>>();
  for (const id of activeDomainIds) adj.set(id, new Set());
  for (const link of activeLinks) {
    const s = getLinkEndpointId(link.source);
    const t = getLinkEndpointId(link.target);
    adj.get(s)?.add(t);
    adj.get(t)?.add(s);
  }

  // Find connected components (BFS) and collect node details per cluster
  const componentOf = new Map<string, number>();
  let componentCount = 0;
  const componentNodeIds: string[][] = [];
  for (const id of activeDomainIds) {
    if (componentOf.has(id)) continue;
    const cid = componentCount++;
    const queue = [id];
    componentOf.set(id, cid);
    const members: string[] = [];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      members.push(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (componentOf.has(nb)) continue;
        componentOf.set(nb, cid);
        queue.push(nb);
      }
    }
    componentNodeIds.push(members);
  }
  // Skill clusters = components with at least 2 nodes (meaningful clusters)
  const clusterDetails: ClusterDetail[] = componentNodeIds
    .filter((m) => m.length >= 2)
    .sort((a, b) => b.length - a.length)
    .map((members) => ({
      nodes: members.map((uid) => {
        const node = nodesById.get(uid) ?? {};
        return { uid, name: getNodeDisplayName(node), type: formatTypeLabel(getPrimaryLabel(node)) };
      }),
    }));
  const skillClusters = clusterDetails.length;

  // Bridge nodes: articulation points whose removal increases component count.
  const apSet = new Set<string>();
  if (activeDomainIds.size > 0) {
    const ids = [...activeDomainIds];
    const disc = new Map<string, number>();
    const low = new Map<string, number>();
    const parentMap = new Map<string, string | null>();
    let timer = 0;

    const dfs = (u: string) => {
      disc.set(u, timer);
      low.set(u, timer);
      timer++;
      let children = 0;
      for (const v of adj.get(u) ?? []) {
        if (!disc.has(v)) {
          children++;
          parentMap.set(v, u);
          dfs(v);
          low.set(u, Math.min(low.get(u)!, low.get(v)!));
          if (parentMap.get(u) === null && children > 1) apSet.add(u);
          if (parentMap.get(u) !== null && low.get(v)! >= disc.get(u)!) apSet.add(u);
        } else if (v !== parentMap.get(u)) {
          low.set(u, Math.min(low.get(u)!, disc.get(v)!));
        }
      }
    };

    for (const id of ids) {
      if (!disc.has(id)) {
        parentMap.set(id, null);
        dfs(id);
      }
    }
  }
  const bridgeNodes = apSet.size;
  const bridgeNodeDetails: NodeDetail[] = [...apSet].map((uid) => {
    const node = nodesById.get(uid) ?? {};
    return { uid, name: getNodeDisplayName(node), type: formatTypeLabel(getPrimaryLabel(node)) };
  });

  return {
    activeNodes: activeDomainNodes.length,
    visibleNodes: visibleDomainNodes.length,
    activeLinks: activeLinks.length,
    visibleLinks: visibleLinks.length,
    density: clampRatio(density),
    avgLinksPerNode,
    skillCoverageRate: clampRatio(
      skillCoverageCandidates.length > 0 ? linkedCandidateIds.size / skillCoverageCandidates.length : 0,
    ),
    skillLinkedNodes: linkedCandidateIds.size,
    skillEligibleNodes: skillCoverageCandidates.length,
    topHubName,
    topHubType,
    topHubDegree,
    orphanNodes,
    orphanRate,
    orphanNodeDetails,
    freshnessScore,
    skillClusters,
    clusterDetails,
    bridgeNodes,
    bridgeNodeDetails,
    filtersActive: filteredIds.size > 0 || hiddenTypes.size > 0,
  };
}
