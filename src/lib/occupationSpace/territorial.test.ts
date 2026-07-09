import { describe, expect, it } from 'vitest';
import {
  getDensityMap,
  getNodeTerritorialStatus,
  getPredictionMap,
  getPresenceSet
} from './territorial';

describe('occupation territorial helpers', () => {
  it('reads presence sets from nested compact data', () => {
    const set = getPresenceSet({ '01': { '2023': ['A', 'B'] } }, '01', 2023);
    expect(Array.from(set)).toEqual(['A', 'B']);
  });

  it('reads density maps from nested compact data', () => {
    const map = getDensityMap({ '01': { '2023': [{ pcs: 'C', density_hidalgo: 0.6, rank: 1 }] } }, '01', 2023);
    expect(map.get('C')?.density_hidalgo).toBe(0.6);
  });

  it('reads prediction maps from array data', () => {
    const map = getPredictionMap([{ department_code: '01', year: 2023, pcs: 'D', score: 0.7, rank: 2 }], '01', 2023);
    expect(map.get('D')?.rank).toBe(2);
  });

  it('classifies present, high-density, and predicted nodes', () => {
    const present = getNodeTerritorialStatus(
      'A',
      '01',
      2023,
      new Set(['A']),
      new Map(),
      new Map()
    );
    expect(present.isPresent).toBe(true);

    const opportunity = getNodeTerritorialStatus(
      'B',
      '01',
      2023,
      new Set(['A']),
      new Map([['B', { pcs: 'B', density_hidalgo: 0.55 }]]),
      new Map([['B', { pcs: 'B', score: 0.55 }]])
    );
    expect(opportunity.isHighDensityOpportunity).toBe(true);
    expect(opportunity.isPredictedEntry).toBe(true);
  });

  it('does not crash when selected department-year is missing', () => {
    expect(getPresenceSet({ '01': { '2023': ['A'] } }, '02', 2023).size).toBe(0);
    expect(getDensityMap({ '01': { '2023': [{ pcs: 'A' }] } }, '02', 2023).size).toBe(0);
    expect(getPredictionMap(undefined, '02', 2023).size).toBe(0);
  });
});

