import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';
import type {
  DepartmentYearEmergencePaths,
  EmergenceBridge,
  EmergenceContributor,
  EmergencePath
} from './types';

export const DEFAULT_OCCUPATION_DATA_URL = 'https://pub-b1fc5ab1b5a24cd4b5cbf3879db5f165.r2.dev';

const NESTED_OBJECT_FIELDS = new Set(['local_explanation', 'indicators']);
const NESTED_ARRAY_FIELDS = new Set(['top_present_contributors', 'best_missing_bridges']);
const PARTITION_COLUMNS = [
  'department',
  'year',
  'target_pcs',
  'present',
  'density_hidalgo',
  'density_cosine',
  'opportunity_rank_hidalgo',
  'opportunity_rank_cosine',
  'predicted_entry',
  'prediction_probability',
  'top_present_contributors',
  'best_missing_bridges',
  'local_explanation',
  'indicators'
];

const partitionCache = new Map<string, DepartmentYearEmergencePaths>();
const inFlightPartitions = new Map<string, Promise<DepartmentYearEmergencePaths>>();

export class CompleteEmergencePartitionError extends Error {
  constructor(
    message: string,
    public readonly reason: 'missing' | 'network' | 'parse' | 'empty' | 'malformed',
    public readonly url: string
  ) {
    super(message);
    this.name = 'CompleteEmergencePartitionError';
  }
}

function getOccupationDataRoot(): string {
  return String(import.meta.env.PUBLIC_OCCUPATION_DATA_URL || DEFAULT_OCCUPATION_DATA_URL).replace(/\/+$/, '');
}

export function buildCompleteEmergencePartitionUrl(
  departmentCode: string,
  year: number | string,
  baseUrl = getOccupationDataRoot()
): string {
  const root = baseUrl.replace(/\/+$/, '');
  return `${root}/${encodeURIComponent(String(departmentCode))}/${encodeURIComponent(String(year))}.parquet`;
}

export function clearCompleteEmergencePartitionCache(): void {
  partitionCache.clear();
  inFlightPartitions.clear();
}

function warnInDevelopment(message: string, detail?: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(message, detail);
  }
}

export function parseNestedField(value: unknown, fallback: unknown, fieldName: string): unknown {
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) return value;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value) ?? fallback;
  } catch (error) {
    warnInDevelopment(`[occupation-space] Could not parse ${fieldName} from complete emergence partition.`, error);
    return fallback;
  }
}

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanOrFalse(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase());
  return false;
}

function booleanOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null;
  return booleanOrFalse(value);
}

function objectOrEmpty(value: unknown, fieldName: string): Record<string, unknown> {
  const parsed = parseNestedField(value, {}, fieldName);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function arrayOrEmpty(value: unknown, fieldName: string): unknown[] {
  const parsed = parseNestedField(value, [], fieldName);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizeContributor(value: unknown): EmergenceContributor | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const pcs = row.pcs ?? row.source_pcs ?? row.code;
  if (!pcs) return null;

  return {
    ...row,
    pcs: String(pcs),
    relatedness: numericOrNull(row.relatedness ?? row.hidalgo ?? row.weight),
    weight: numericOrNull(row.weight),
    hidalgo: numericOrNull(row.hidalgo),
    contribution_score: numericOrNull(row.contribution_score)
  };
}

function normalizeBridge(value: unknown): EmergenceBridge | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const pcs = row.pcs ?? row.bridge_pcs ?? row.code;
  if (!pcs) return null;

  return {
    ...row,
    pcs: String(pcs),
    local_density: numericOrNull(row.local_density ?? row.bridge_density ?? row.density_hidalgo),
    opportunity_rank: numericOrNull(row.opportunity_rank ?? row.bridge_rank ?? row.rank),
    bridge_score: numericOrNull(row.bridge_score ?? row.combined_score),
    relatedness: numericOrNull(row.relatedness ?? row.bridge_to_target_hidalgo ?? row.bridge_to_target_weight),
    weight: numericOrNull(row.weight ?? row.bridge_to_target_weight),
    hidalgo: numericOrNull(row.hidalgo ?? row.bridge_to_target_hidalgo),
    gateway_flags: Array.isArray(row.gateway_flags) ? row.gateway_flags.map(String) : []
  };
}

export function normalizeCompleteEmergenceRow(row: Record<string, unknown>): EmergencePath | null {
  const targetPcs = row.target_pcs ?? row.pcs;
  if (!targetPcs) return null;

  const topPresentContributors = arrayOrEmpty(row.top_present_contributors, 'top_present_contributors')
    .map(normalizeContributor)
    .filter(Boolean) as EmergenceContributor[];
  const bestMissingBridges = arrayOrEmpty(row.best_missing_bridges, 'best_missing_bridges')
    .map(normalizeBridge)
    .filter(Boolean) as EmergenceBridge[];

  return {
    target_pcs: String(targetPcs),
    present: booleanOrFalse(row.present),
    density_hidalgo: numericOrNull(row.density_hidalgo),
    density_cosine: numericOrNull(row.density_cosine),
    opportunity_rank_hidalgo: numericOrNull(row.opportunity_rank_hidalgo),
    opportunity_rank_cosine: numericOrNull(row.opportunity_rank_cosine),
    predicted_entry: booleanOrNull(row.predicted_entry),
    prediction_probability: numericOrNull(row.prediction_probability ?? row.prediction_score ?? row.probability ?? row.score),
    top_present_contributors: topPresentContributors,
    best_missing_bridges: bestMissingBridges,
    present_contributors: topPresentContributors,
    missing_bridges: bestMissingBridges,
    local_explanation: objectOrEmpty(row.local_explanation, 'local_explanation'),
    indicators: objectOrEmpty(row.indicators, 'indicators')
  };
}

function normalizePartitionRows(
  rows: Array<Record<string, unknown>>,
  departmentCode: string,
  year: number | string,
  url: string
): DepartmentYearEmergencePaths {
  if (!rows.length) {
    throw new CompleteEmergencePartitionError(
      'Les donnees detaillees de trajectoire ne sont pas disponibles pour ce departement-annee.',
      'empty',
      url
    );
  }

  const targets: Record<string, EmergencePath> = {};

  for (const row of rows) {
    const target = normalizeCompleteEmergenceRow(row);
    if (!target) {
      warnInDevelopment('[occupation-space] Malformed complete emergence row skipped.', row);
      continue;
    }
    targets[target.target_pcs] = target;
  }

  if (!Object.keys(targets).length) {
    throw new CompleteEmergencePartitionError(
      'Les donnees detaillees de trajectoire ne sont pas disponibles pour ce departement-annee.',
      'malformed',
      url
    );
  }

  return {
    department: String(rows[0]?.department ?? departmentCode),
    year: Number(rows[0]?.year ?? year),
    targets
  };
}

async function readParquetPartition(url: string): Promise<Array<Record<string, unknown>>> {
  const file = await asyncBufferFromUrl({ url });
  return parquetReadObjects({
    file,
    columns: PARTITION_COLUMNS
  });
}

export function loadCompleteEmergencePartition(
  departmentCode: string,
  year: number | string
): Promise<DepartmentYearEmergencePaths> {
  const key = `${departmentCode}-${year}`;
  const cached = partitionCache.get(key);
  if (cached) return cached;

  const inFlight = inFlightPartitions.get(key);
  if (inFlight) return inFlight;

  const url = buildCompleteEmergencePartitionUrl(departmentCode, year);
  if (import.meta.env.DEV) {
    console.info('[occupation-space] loading complete emergence partition', { key, url });
  }

  const request = readParquetPartition(url)
    .then((rows) => normalizePartitionRows(rows, departmentCode, year, url))
    .then((partition) => {
      partitionCache.set(key, partition);
      inFlightPartitions.delete(key);
      return partition;
    })
    .catch((error: unknown) => {
      inFlightPartitions.delete(key);

      if (error instanceof CompleteEmergencePartitionError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      const reason = /404|not found|fetch with range failed 404|fetch head failed 404/i.test(message)
        ? 'missing'
        : /parquet|parse|schema|column/i.test(message)
          ? 'parse'
          : 'network';

      throw new CompleteEmergencePartitionError(
        'Les donnees detaillees de trajectoire ne sont pas disponibles pour ce departement-annee.',
        reason,
        url
      );
    });

  inFlightPartitions.set(key, request);
  return request;
}
