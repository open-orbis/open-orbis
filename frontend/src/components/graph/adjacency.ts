/**
 * Build an undirected adjacency map from a list of graph links. Used to
 * compute one-hop neighborhoods for the hover-highlight feature.
 *
 * Self-loops are dropped (a node is not its own neighbor). Duplicate edges
 * collapse to a single entry via Set semantics. Links may arrive either
 * as raw ids (before react-force-graph resolves them) or as node objects
 * with an `id` field (after resolution) — both shapes are handled.
 */
export type LinkEndpoint = string | { id: string };

export interface LinkLike {
  source: LinkEndpoint;
  target: LinkEndpoint;
}

function endpointId(endpoint: LinkEndpoint): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

export function buildAdjacencyMap(
  links: LinkLike[]
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (a === b) return;
    let set = map.get(a);
    if (!set) {
      set = new Set<string>();
      map.set(a, set);
    }
    set.add(b);
  };
  for (const link of links) {
    const s = endpointId(link.source);
    const t = endpointId(link.target);
    addEdge(s, t);
    addEdge(t, s);
  }
  return map;
}
