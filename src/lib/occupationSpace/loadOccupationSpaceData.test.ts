import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadOccupationEmergencePaths } from './loadOccupationSpaceData';
import { loadCompleteEmergencePartition } from './loadCompleteEmergencePartition';

vi.mock('./loadCompleteEmergencePartition', () => ({
  loadCompleteEmergencePartition: vi.fn()
}));

describe('loadOccupationEmergencePaths', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates complete emergence loading to the R2 parquet partition service', async () => {
    vi.mocked(loadCompleteEmergencePartition).mockResolvedValue({
      department: '01',
      year: 2023,
      targets: {
        '632K': {
          target_pcs: '632K',
          present: false,
          density_hidalgo: 0.52,
          opportunity_rank_hidalgo: 84,
          top_present_contributors: [{ pcs: 'A', hidalgo: 0.8, relatedness: 0.8 }],
          best_missing_bridges: [{ pcs: 'B', local_density: 0.5 }]
        },
        '999Z': {
          target_pcs: '999Z',
          present: false,
          density_hidalgo: 0.12,
          opportunity_rank_hidalgo: 175
        }
      }
    });

    const partition = await loadOccupationEmergencePaths('01', 2023);

    expect(loadCompleteEmergencePartition).toHaveBeenCalledWith('01', 2023);
    expect(partition.targets['999Z']).toMatchObject({
      target_pcs: '999Z',
      opportunity_rank_hidalgo: 175
    });
    expect(partition.targets['632K'].top_present_contributors?.[0]).toMatchObject({
      pcs: 'A',
      relatedness: 0.8
    });
  });
});
