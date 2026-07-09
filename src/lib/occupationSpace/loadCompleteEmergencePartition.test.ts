import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';
import {
  buildCompleteEmergencePartitionUrl,
  clearCompleteEmergencePartitionCache,
  CompleteEmergencePartitionError,
  loadCompleteEmergencePartition,
  normalizeCompleteEmergenceRow,
  parseNestedField
} from './loadCompleteEmergencePartition';

const mocks = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  asyncBufferFromUrl: vi.fn(async ({ url }: { url: string }) => ({ url })),
  parquetReadObjects: vi.fn(async () => mocks.rows)
}));

vi.mock('hyparquet', () => ({
  asyncBufferFromUrl: mocks.asyncBufferFromUrl,
  parquetReadObjects: mocks.parquetReadObjects
}));

describe('loadCompleteEmergencePartition', () => {
  beforeEach(() => {
    clearCompleteEmergencePartitionCache();
    mocks.rows = [
      {
        department: '17',
        year: 2023,
        target_pcs: '632K',
        present: false,
        density_hidalgo: 0.52,
        density_cosine: 0.49,
        opportunity_rank_hidalgo: 84,
        opportunity_rank_cosine: 91,
        predicted_entry: false,
        prediction_probability: null,
        top_present_contributors: '[{"source_pcs":"A","hidalgo":0.8}]',
        best_missing_bridges: '[{"bridge_pcs":"B","bridge_density":0.5,"bridge_rank":7}]',
        local_explanation: '{"rank":84}',
        indicators: '{"coverage":1}'
      }
    ];
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the R2 parquet URL for a department-year partition', () => {
    expect(buildCompleteEmergencePartitionUrl('17', 2023, 'https://example.test/root/')).toBe(
      'https://example.test/root/17/2023.parquet'
    );
  });

  it('caches repeated calls for the same department-year, including in-flight requests', async () => {
    const first = loadCompleteEmergencePartition('17', 2023);
    const second = loadCompleteEmergencePartition('17', 2023);

    expect(first).toBe(second);

    const partition = await first;
    const third = await loadCompleteEmergencePartition('17', 2023);

    expect(partition).toBe(third);
    expect(asyncBufferFromUrl).toHaveBeenCalledTimes(1);
    expect(parquetReadObjects).toHaveBeenCalledTimes(1);
  });

  it('parses JSON-string nested fields and keys targets by PCS', async () => {
    const partition = await loadCompleteEmergencePartition('17', 2023);

    expect(partition.targets['632K']).toMatchObject({
      target_pcs: '632K',
      density_hidalgo: 0.52,
      opportunity_rank_hidalgo: 84,
      local_explanation: { rank: 84 },
      indicators: { coverage: 1 }
    });
    expect(partition.targets['632K'].top_present_contributors?.[0]).toMatchObject({ pcs: 'A', relatedness: 0.8 });
    expect(partition.targets['632K'].best_missing_bridges?.[0]).toMatchObject({
      pcs: 'B',
      local_density: 0.5,
      opportunity_rank: 7
    });
  });

  it('returns safe fallback values when nested JSON parsing fails', () => {
    expect(parseNestedField('{bad json', [], 'top_present_contributors')).toEqual([]);

    const row = normalizeCompleteEmergenceRow({
      target_pcs: 'X',
      top_present_contributors: '{bad json',
      best_missing_bridges: '',
      local_explanation: '{bad json',
      indicators: null
    });

    expect(row?.top_present_contributors).toEqual([]);
    expect(row?.best_missing_bridges).toEqual([]);
    expect(row?.local_explanation).toEqual({});
    expect(row?.indicators).toEqual({});
  });

  it('throws a typed error when the remote partition is missing', async () => {
    mocks.asyncBufferFromUrl.mockRejectedValueOnce(new Error('fetch head failed 404'));

    await expect(loadCompleteEmergencePartition('ZZ', 1900)).rejects.toMatchObject({
      name: 'CompleteEmergencePartitionError',
      reason: 'missing'
    } satisfies Partial<CompleteEmergencePartitionError>);
  });
});
