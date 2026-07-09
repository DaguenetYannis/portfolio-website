import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCompleteEmergencePathWebData,
  normalizeCompleteEmergenceRow,
  parseNestedField
} from './buildCompleteEmergencePathWebData.mjs';

describe('buildCompleteEmergencePathWebData', () => {
  it('parses JSON-string nested fields', () => {
    expect(parseNestedField('[{"source_pcs":"A"}]', [])).toEqual([{ source_pcs: 'A' }]);

    const row = normalizeCompleteEmergenceRow({
      target_pcs: '632K',
      present: false,
      density_hidalgo: 0.52,
      top_present_contributors: '[{"source_pcs":"A","hidalgo":0.8,"contribution_score":0.12}]',
      best_missing_bridges: '[{"bridge_pcs":"B","bridge_density":0.5,"bridge_rank":7,"combined_score":0.22}]',
      local_explanation: '{"rank":84}',
      indicators: '{"foo":1}'
    });

    expect(row.top_present_contributors[0]).toMatchObject({ pcs: 'A', relatedness: 0.8 });
    expect(row.best_missing_bridges[0]).toMatchObject({ pcs: 'B', local_density: 0.5, opportunity_rank: 7 });
    expect(row.local_explanation).toEqual({ rank: 84 });
    expect(row.indicators).toEqual({ foo: 1 });
  });

  it('writes partitions keyed by target PCS', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'complete-emergence-'));
    const inputPath = path.join(tempDir, 'emergence_paths_complete.jsonl');
    const outputRoot = path.join(tempDir, 'web');

    await writeFile(
      inputPath,
      [
        JSON.stringify({
          department: '01',
          year: 2023,
          target_pcs: '632K',
          present: false,
          density_hidalgo: 0.52,
          top_present_contributors: [{ source_pcs: 'A', hidalgo: 0.8 }],
          best_missing_bridges: [{ bridge_pcs: 'B', bridge_density: 0.5 }]
        }),
        JSON.stringify({
          department: '01',
          year: 2023,
          target_pcs: '999Z',
          present: false,
          density_hidalgo: 0.12
        })
      ].join('\n')
    );

    const { manifest } = await buildCompleteEmergencePathWebData({ inputPath, outputRoot });
    const partition = JSON.parse(
      await readFile(path.join(outputRoot, 'by-department-year', '01', '2023.json'), 'utf8')
    );

    expect(manifest.counts.department_year_files).toBe(1);
    expect(partition.targets['632K'].density_hidalgo).toBe(0.52);
    expect(partition.targets['999Z'].target_pcs).toBe('999Z');
    expect(Array.isArray(partition.targets)).toBe(false);
  });
});
