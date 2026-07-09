import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_INPUT = path.resolve('public/data/transition_pcs/emergence_paths_complete.jsonl');
const DEFAULT_OUTPUT_ROOT = path.resolve('public/data/occupation-space/emergence_paths_complete');
const NESTED_FIELDS = ['top_present_contributors', 'best_missing_bridges', 'local_explanation', 'indicators'];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanOrFalse(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase());
  return false;
}

export function parseNestedField(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value) || isPlainObject(value)) return value;
  if (typeof value !== 'string') return value;

  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeContributor(contributor) {
  const pcs = contributor?.pcs ?? contributor?.source_pcs ?? contributor?.code;
  if (!pcs) return null;

  return {
    ...contributor,
    pcs: String(pcs),
    relatedness: numericOrNull(contributor.relatedness ?? contributor.hidalgo ?? contributor.weight),
    contribution_score: numericOrNull(contributor.contribution_score)
  };
}

function normalizeBridge(bridge) {
  const pcs = bridge?.pcs ?? bridge?.bridge_pcs ?? bridge?.code;
  if (!pcs) return null;

  return {
    ...bridge,
    pcs: String(pcs),
    local_density: numericOrNull(bridge.local_density ?? bridge.bridge_density ?? bridge.density_hidalgo),
    opportunity_rank: numericOrNull(bridge.opportunity_rank ?? bridge.bridge_rank ?? bridge.rank),
    bridge_score: numericOrNull(bridge.bridge_score ?? bridge.combined_score),
    relatedness: numericOrNull(bridge.relatedness ?? bridge.bridge_to_target_hidalgo ?? bridge.bridge_to_target_weight),
    gateway_flags: Array.isArray(bridge.gateway_flags) ? bridge.gateway_flags.map(String) : []
  };
}

export function normalizeCompleteEmergenceRow(row) {
  const parsed = { ...row };

  for (const field of NESTED_FIELDS) {
    parsed[field] = parseNestedField(parsed[field], field === 'indicators' || field === 'local_explanation' ? {} : []);
  }

  const predictionScore = numericOrNull(
    parsed.prediction_probability ?? parsed.prediction_score ?? parsed.probability ?? parsed.score
  );
  const topPresentContributors = (Array.isArray(parsed.top_present_contributors) ? parsed.top_present_contributors : [])
    .map(normalizeContributor)
    .filter(Boolean);
  const bestMissingBridges = (Array.isArray(parsed.best_missing_bridges) ? parsed.best_missing_bridges : [])
    .map(normalizeBridge)
    .filter(Boolean);

  return {
    target_pcs: String(parsed.target_pcs ?? parsed.pcs ?? ''),
    present: booleanOrFalse(parsed.present),
    density_hidalgo: numericOrNull(parsed.density_hidalgo ?? parsed.local_explanation?.density),
    density_cosine: numericOrNull(parsed.density_cosine),
    opportunity_rank_hidalgo: numericOrNull(parsed.opportunity_rank_hidalgo ?? parsed.local_explanation?.rank),
    opportunity_rank_cosine: numericOrNull(parsed.opportunity_rank_cosine),
    predicted_entry: booleanOrFalse(parsed.predicted_entry ?? parsed.local_explanation?.predicted),
    prediction_probability: predictionScore,
    top_present_contributors: topPresentContributors,
    best_missing_bridges: bestMissingBridges,
    local_explanation: isPlainObject(parsed.local_explanation) ? parsed.local_explanation : {},
    indicators: isPlainObject(parsed.indicators) ? parsed.indicators : {}
  };
}

function partitionKey(department, year) {
  return `${department}\u0000${year}`;
}

async function readSourceMetadata(sourceRoot) {
  try {
    return JSON.parse(await readFile(path.join(sourceRoot, 'metadata.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function writePartition(outputRoot, partition) {
  const departmentDir = path.join(outputRoot, 'by-department-year', partition.department);
  await mkdir(departmentDir, { recursive: true });
  await writeFile(
    path.join(departmentDir, `${partition.year}.json`),
    JSON.stringify({
      department: partition.department,
      year: partition.year,
      targets: partition.targets
    })
  );
}

export async function buildCompleteEmergencePathWebData({
  inputPath = DEFAULT_INPUT,
  outputRoot = DEFAULT_OUTPUT_ROOT
} = {}) {
  await mkdir(path.join(outputRoot, 'by-department-year'), { recursive: true });

  const partitions = new Map();
  const departments = new Set();
  const years = new Set();
  const counts = {
    rows: 0,
    department_year_files: 0,
    targets: 0,
    targets_with_density_hidalgo: 0,
    targets_with_density_cosine: 0,
    targets_with_prediction_score: 0,
    targets_with_present_contributors: 0,
    targets_with_missing_bridges: 0
  };

  const lines = readline.createInterface({
    input: createReadStream(inputPath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const rawRow = JSON.parse(trimmed);
    const department = String(rawRow.department ?? rawRow.department_code ?? rawRow.code ?? '');
    const year = Number(rawRow.year);
    const target = normalizeCompleteEmergenceRow(rawRow);

    if (!department || !Number.isFinite(year) || !target.target_pcs) {
      continue;
    }

    const key = partitionKey(department, year);
    const partition = partitions.get(key) ?? {
      department,
      year,
      targets: {}
    };

    partition.targets[target.target_pcs] = target;
    partitions.set(key, partition);
    departments.add(department);
    years.add(year);

    counts.rows += 1;
    counts.targets += 1;
    if (target.density_hidalgo !== null) counts.targets_with_density_hidalgo += 1;
    if (target.density_cosine !== null) counts.targets_with_density_cosine += 1;
    if (target.prediction_probability !== null) counts.targets_with_prediction_score += 1;
    if (target.top_present_contributors.length > 0) counts.targets_with_present_contributors += 1;
    if (target.best_missing_bridges.length > 0) counts.targets_with_missing_bridges += 1;
  }

  const sortedPartitions = [...partitions.values()].sort(
    (a, b) => a.department.localeCompare(b.department) || a.year - b.year
  );

  for (const partition of sortedPartitions) {
    await writePartition(outputRoot, partition);
  }

  counts.department_year_files = sortedPartitions.length;

  const sourceRoot = path.dirname(inputPath);
  const sourceMetadata = await readSourceMetadata(sourceRoot);
  const manifest = {
    created_by: 'scripts/buildCompleteEmergencePathWebData.mjs',
    source_file: path.relative(process.cwd(), inputPath).replaceAll('\\', '/'),
    source_metadata: sourceMetadata,
    partitioning: {
      type: 'by-department-year',
      path_template:
        'public/data/occupation-space/emergence_paths_complete/by-department-year/{department}/{year}.json',
      targets_shape: 'object keyed by target PCS'
    },
    departments: [...departments].sort((a, b) => a.localeCompare(b)),
    years: [...years].sort((a, b) => a - b),
    counts
  };

  const index = {
    path_template: manifest.partitioning.path_template,
    departments: manifest.departments,
    years: manifest.years,
    counts
  };

  await writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(outputRoot, 'index.json'), JSON.stringify(index, null, 2));

  return { manifest, partitions: sortedPartitions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildCompleteEmergencePathWebData()
    .then(({ manifest }) => {
      console.log(
        `Wrote ${manifest.counts.department_year_files} complete emergence partitions for ${manifest.counts.targets} targets.`
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
