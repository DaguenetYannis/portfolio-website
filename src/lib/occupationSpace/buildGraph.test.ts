import { describe, expect, it } from 'vitest';
import { buildGraph } from './buildGraph';
import type { OccupationSpaceData } from './types';

describe('buildGraph', () => {
  it('creates a graphology graph from tiny occupation data', () => {
    const data: OccupationSpaceData = {
      nodes: [
        { id: 'A', code: 'A', label: 'Alpha', community: 1, x: 0, y: 0 },
        { id: 'B', code: 'B', label: 'Beta', community: 2, x: 1, y: 1 }
      ],
      edges: [{ source: 'A', target: 'B', weight: 0.9 }],
      details: {}
    };

    const graph = buildGraph(data);

    expect(graph.order).toBe(2);
    expect(graph.size).toBe(1);
    expect(graph.getNodeAttribute('A', 'label')).toBe('Alpha');
    expect(graph.getNodeAttribute('A', 'size')).toBeGreaterThan(0);
  });

  it('handles missing optional fields and skips invalid edges', () => {
    const data: OccupationSpaceData = {
      nodes: [{ id: 'A' }, { id: 'B', label: 'Beta' }],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'Z', weight: 1 }
      ],
      details: {}
    };

    const graph = buildGraph(data);

    expect(graph.order).toBe(2);
    expect(graph.size).toBe(1);
    expect(graph.getNodeAttribute('A', 'label')).toBe('A');
    expect(Number.isFinite(graph.getNodeAttribute('A', 'x'))).toBe(true);
  });
});

