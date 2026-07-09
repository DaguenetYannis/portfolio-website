import { UndirectedGraph } from 'graphology';
import circular from 'graphology-layout/circular';
import type { OccupationEdge, OccupationNode, OccupationSpaceData } from './types';

const COMMUNITY_COLORS = [
  '#8fb3ff',
  '#79c7b0',
  '#e0b16a',
  '#d9879d',
  '#a4c86f',
  '#b49ada',
  '#6fb6c9',
  '#d39a72',
  '#9fb0c2'
];

const READABLE_CLUSTER_CENTER_SCALE = 0.58;
const READABLE_WITHIN_CLUSTER_SCALE = 2.35;

function getCommunityColor(community: OccupationNode['community']): string {
  if (community === null || community === undefined || community === '') {
    return '#7f8794';
  }

  const index = Math.abs(Number(community)) % COMMUNITY_COLORS.length;
  return COMMUNITY_COLORS[Number.isFinite(index) ? index : 0];
}

function getNumericValue(...values: Array<number | null | undefined>): number | undefined {
  return values.find((value) => typeof value === 'number' && Number.isFinite(value));
}

function getNodeSize(node: OccupationNode, incidentWeights: Map<string, number>): number {
  const centrality = getNumericValue(
    node.weighted_degree_hidalgo,
    node.weighted_degree,
    node.degree,
    incidentWeights.get(node.id)
  );

  if (centrality === undefined || centrality <= 0) {
    return 3.5;
  }

  return Math.max(4, Math.min(13, 3 + Math.sqrt(centrality) * 0.65));
}

function getFallbackPosition(index: number, total: number): { x: number; y: number } {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle)
  };
}

function buildIncidentWeights(edges: OccupationEdge[]): Map<string, number> {
  const weights = new Map<string, number>();

  for (const edge of edges) {
    const weight = getNumericValue(edge.weight, edge.hidalgo) ?? 1;
    weights.set(edge.source, (weights.get(edge.source) ?? 0) + weight);
    weights.set(edge.target, (weights.get(edge.target) ?? 0) + weight);
  }

  return weights;
}

function assignReadablePositions(graph: UndirectedGraph): void {
  const visibleNodes = graph
    .nodes()
    .filter((node) => Number(graph.getNodeAttribute(node, 'visibleDegreeComplete') ?? 0) > 0);

  if (!visibleNodes.length) {
    return;
  }

  const globalCenter = visibleNodes.reduce(
    (center, node) => {
      center.x += Number(graph.getNodeAttribute(node, 'originalX') ?? graph.getNodeAttribute(node, 'x')) || 0;
      center.y += Number(graph.getNodeAttribute(node, 'originalY') ?? graph.getNodeAttribute(node, 'y')) || 0;
      return center;
    },
    { x: 0, y: 0 }
  );

  globalCenter.x /= visibleNodes.length;
  globalCenter.y /= visibleNodes.length;

  const groups = new Map<string, { count: number; x: number; y: number }>();

  for (const node of visibleNodes) {
    const community = graph.getNodeAttribute(node, 'community');
    const groupKey = community === null || community === undefined || community === '' ? `node:${node}` : String(community);
    const group = groups.get(groupKey) ?? { count: 0, x: 0, y: 0 };

    group.count += 1;
    group.x += Number(graph.getNodeAttribute(node, 'originalX') ?? graph.getNodeAttribute(node, 'x')) || 0;
    group.y += Number(graph.getNodeAttribute(node, 'originalY') ?? graph.getNodeAttribute(node, 'y')) || 0;
    groups.set(groupKey, group);
  }

  for (const group of groups.values()) {
    group.x /= group.count;
    group.y /= group.count;
  }

  graph.forEachNode((node, attributes) => {
    const originalX = Number(attributes.originalX ?? attributes.x) || 0;
    const originalY = Number(attributes.originalY ?? attributes.y) || 0;
    const community = attributes.community;
    const groupKey = community === null || community === undefined || community === '' ? `node:${node}` : String(community);
    const group = groups.get(groupKey) ?? { count: 1, x: originalX, y: originalY };

    graph.mergeNodeAttributes(node, {
      readableX:
        globalCenter.x +
        (group.x - globalCenter.x) * READABLE_CLUSTER_CENTER_SCALE +
        (originalX - group.x) * READABLE_WITHIN_CLUSTER_SCALE,
      readableY:
        globalCenter.y +
        (group.y - globalCenter.y) * READABLE_CLUSTER_CENTER_SCALE +
        (originalY - group.y) * READABLE_WITHIN_CLUSTER_SCALE
    });
  });
}

export function buildGraph(data: OccupationSpaceData): UndirectedGraph {
  const graph = new UndirectedGraph();
  const incidentWeights = buildIncidentWeights(data.edges);
  const hasCompleteCoordinates = data.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y));

  data.nodes.forEach((node, index) => {
    const fallback = getFallbackPosition(index, data.nodes.length);
    const id = String(node.id ?? node.code ?? index);

    const size = getNodeSize({ ...node, id }, incidentWeights);
    const color = getCommunityColor(node.community);

    graph.addNode(id, {
      code: node.code ?? id,
      label: node.label ?? node.code ?? id,
      community: node.community ?? null,
      x: hasCompleteCoordinates ? Number(node.x) : fallback.x,
      y: hasCompleteCoordinates ? Number(node.y) : fallback.y,
      originalX: hasCompleteCoordinates ? Number(node.x) : fallback.x,
      originalY: hasCompleteCoordinates ? Number(node.y) : fallback.y,
      readableX: hasCompleteCoordinates ? Number(node.x) : fallback.x,
      readableY: hasCompleteCoordinates ? Number(node.y) : fallback.y,
      size,
      baseSize: size,
      color,
      baseColor: color,
      graphDegree: 0,
      visibleDegreeReadable: 0,
      visibleDegreeComplete: 0
    });
  });

  data.edges.forEach((edge, index) => {
    const source = String(edge.source);
    const target = String(edge.target);

    if (!graph.hasNode(source) || !graph.hasNode(target) || source === target) {
      return;
    }

    const weight = getNumericValue(edge.weight, edge.hidalgo) ?? 1;
    const key = `${source}-${target}-${index}`;

    graph.addUndirectedEdgeWithKey(key, source, target, {
      weight,
      hidalgo: edge.hidalgo ?? weight,
      size: Math.max(0.5, Math.min(2, weight)),
      color: 'rgba(155, 164, 178, 0.22)'
    });
  });

  graph.forEachNode((node) => {
    let readableDegree = 0;
    let completeDegree = 0;

    graph.forEachEdge(node, (_edge, edgeAttributes) => {
      const weight = getNumericValue(edgeAttributes.weight as number, edgeAttributes.hidalgo as number) ?? 0;
      completeDegree += 1;

      if (weight >= 0.85) {
        readableDegree += 1;
      }
    });

    graph.mergeNodeAttributes(node, {
      graphDegree: graph.degree(node),
      visibleDegreeReadable: readableDegree,
      visibleDegreeComplete: completeDegree
    });
  });

  assignReadablePositions(graph);

  if (!hasCompleteCoordinates && graph.order > 0) {
    circular.assign(graph, { scale: 1 });
  }

  return graph;
}

export function getCommunityColorForLegend(community: OccupationNode['community']): string {
  return getCommunityColor(community);
}
