import type {
  OccupationDetails,
  OccupationEdge,
  OccupationNode,
  OccupationCommunityLabel,
  DepartmentYearEmergencePaths,
  DepartmentYearTerritorialData,
  OccupationTerritorialData,
  OccupationSpaceData
} from './types';

const DATA_ROOT = '/data/occupation-space';
const emergencePartitionCache = new Map<string, DepartmentYearEmergencePaths>();

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Could not load ${path} (${response.status})`);
  }

  return response.json() as Promise<T>;
}

async function fetchJsonOrNull<T>(path: string): Promise<T | null> {
  const response = await fetch(path);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Could not load ${path} (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export function repairText(value: string | undefined): string | undefined {
  if (!value || !/[ÃÂâ]/.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from(Array.from(value, (character) => character.charCodeAt(0) & 255));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
}

function normalizeNode(node: OccupationNode): OccupationNode {
  const code = String(node.code ?? node.id);

  return {
    ...node,
    id: String(node.id ?? code),
    code,
    label: repairText(node.label) ?? code
  };
}

function normalizeDetails(details: Record<string, OccupationDetails>): Record<string, OccupationDetails> {
  return Object.fromEntries(
    Object.entries(details).map(([code, detail]) => [
      code,
      {
        ...detail,
        code: String(detail.code ?? code),
        label: repairText(detail.label) ?? String(detail.code ?? code),
        top_neighbors: (detail.top_neighbors ?? []).map((neighbor) => ({
          ...neighbor,
          pcs: String(neighbor.pcs),
          label: repairText(neighbor.label) ?? neighbor.pcs
        }))
      }
    ])
  );
}

function normalizeTerritorialRows<T extends { label?: string }>(
  data: Record<string, Record<string, T[]>> | Array<T>
): typeof data {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...row, label: repairText(row.label) ?? row.label })) as typeof data;
  }

  return Object.fromEntries(
    Object.entries(data).map(([department, years]) => [
      department,
      Object.fromEntries(
        Object.entries(years).map(([year, rows]) => [
          year,
          rows.map((row) => ({ ...row, label: repairText(row.label) ?? row.label }))
        ])
      )
    ])
  ) as typeof data;
}

export async function loadOccupationSpaceData(): Promise<OccupationSpaceData> {
  const [nodes, edges, details] = await Promise.all([
    fetchJson<OccupationNode[]>(`${DATA_ROOT}/nodes.json`),
    fetchJson<OccupationEdge[]>(`${DATA_ROOT}/edges.json`),
    fetchJson<Record<string, OccupationDetails>>(`${DATA_ROOT}/occupation_details.json`)
  ]);

  return {
    nodes: nodes.map(normalizeNode),
    edges,
    details: normalizeDetails(details)
  };
}

export async function loadOccupationSpaceGraphData(): Promise<Omit<OccupationSpaceData, 'details'>> {
  const [nodes, edges] = await Promise.all([
    fetchJson<OccupationNode[]>(`${DATA_ROOT}/nodes.json`),
    fetchJson<OccupationEdge[]>(`${DATA_ROOT}/edges.json`)
  ]);

  return {
    nodes: nodes.map(normalizeNode),
    edges
  };
}

export async function loadOccupationDetails(): Promise<Record<string, OccupationDetails>> {
  const details = await fetchJson<Record<string, OccupationDetails>>(`${DATA_ROOT}/occupation_details.json`);
  return normalizeDetails(details);
}

export async function loadOccupationCommunityLabels(): Promise<OccupationCommunityLabel[]> {
  const labels = await fetchJson<OccupationCommunityLabel[]>(`${DATA_ROOT}/community_labels.json`);

  return labels.map((label) => ({
    ...label,
    id: String(label.id),
    name: repairText(label.name)?.trim() ?? '',
    fallback_label: repairText(label.fallback_label) ?? `Communaute ${label.id}`
  }));
}

export async function loadOccupationTerritorialData(): Promise<OccupationTerritorialData> {
  const [departments, years, presence, density, predictions] = await Promise.all([
    fetchJson<OccupationTerritorialData['departments']>(`${DATA_ROOT}/departments.json`),
    fetchJson<OccupationTerritorialData['years']>(`${DATA_ROOT}/years.json`),
    fetchJson<OccupationTerritorialData['presence']>(`${DATA_ROOT}/presence_by_department_year.json`),
    fetchJson<OccupationTerritorialData['density']>(`${DATA_ROOT}/density_by_department_year.json`),
    fetchJson<OccupationTerritorialData['predictions']>(`${DATA_ROOT}/predictions_by_department_year.json`)
  ]);

  return {
    departments: departments.map((department) => ({
      ...department,
      code: String(department.code),
      name: repairText(department.name) ?? department.name
    })),
    years: years.map(Number).filter((year) => Number.isFinite(year)),
    presence,
    density: normalizeTerritorialRows(density),
    predictions: normalizeTerritorialRows(predictions)
  };
}

export async function loadOccupationTerritorialMetadata(): Promise<Pick<OccupationTerritorialData, 'departments' | 'years'>> {
  const [departments, years] = await Promise.all([
    fetchJson<OccupationTerritorialData['departments']>(`${DATA_ROOT}/departments.json`),
    fetchJson<OccupationTerritorialData['years']>(`${DATA_ROOT}/years.json`)
  ]);

  return {
    departments: departments.map((department) => ({
      ...department,
      code: String(department.code),
      name: repairText(department.name) ?? department.name
    })),
    years: years.map(Number).filter((year) => Number.isFinite(year))
  };
}

export async function loadOccupationDepartmentYearData(
  departmentCode: string,
  year: number | string
): Promise<DepartmentYearTerritorialData> {
  const payload = await fetchJson<DepartmentYearTerritorialData>(
    `${DATA_ROOT}/by-department-year/${departmentCode}/${year}.json`
  );

  return {
    department: String(payload.department),
    year: Number(payload.year),
    presence: Array.isArray(payload.presence) ? payload.presence.map(String) : [],
    density: normalizeTerritorialRows(payload.density ?? []) as DepartmentYearTerritorialData['density'],
    predictions: normalizeTerritorialRows(payload.predictions ?? []) as DepartmentYearTerritorialData['predictions']
  };
}

export async function loadOccupationEmergencePaths(
  departmentCode: string,
  year: number | string
): Promise<DepartmentYearEmergencePaths> {
  const cacheKey = `${departmentCode}-${year}`;
  const cached = emergencePartitionCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const payload = await fetchJsonOrNull<DepartmentYearEmergencePaths>(
    `${DATA_ROOT}/emergence_paths_complete/by-department-year/${departmentCode}/${year}.json`
  );
  const targetEntries = Array.isArray(payload?.targets)
    ? payload.targets.map((target) => [target.target_pcs, target] as const)
    : Object.entries(payload?.targets ?? {});

  const normalized = {
    department: String(payload?.department ?? departmentCode),
    year: Number(payload?.year ?? year),
    targets: Object.fromEntries(
      targetEntries.map(([targetPcs, target]) => {
        const topPresentContributors = (target.top_present_contributors ?? target.present_contributors ?? []).map((contributor) => ({
          ...contributor,
          pcs: String(contributor.pcs),
          relatedness: contributor.relatedness ?? contributor.hidalgo ?? contributor.weight ?? null
        }));
        const bestMissingBridges = (target.best_missing_bridges ?? target.missing_bridges ?? []).map((bridge) => ({
          ...bridge,
          pcs: String(bridge.pcs),
          local_density: bridge.local_density ?? null,
          opportunity_rank: bridge.opportunity_rank ?? null,
          bridge_score: bridge.bridge_score ?? null,
          relatedness: bridge.relatedness ?? bridge.hidalgo ?? bridge.weight ?? null,
          gateway_flags: Array.isArray(bridge.gateway_flags) ? bridge.gateway_flags.map(String) : []
        }));
        const predictionProbability = target.prediction_probability ?? target.prediction?.probability ?? target.prediction?.score ?? null;

        return [
          String(target.target_pcs ?? targetPcs),
          {
            ...target,
            target_pcs: String(target.target_pcs ?? targetPcs),
            present: Boolean(target.present),
            density_hidalgo: target.density_hidalgo ?? target.current_density ?? null,
            density_cosine: target.density_cosine ?? null,
            opportunity_rank_hidalgo: target.opportunity_rank_hidalgo ?? target.opportunity_rank ?? null,
            opportunity_rank_cosine: target.opportunity_rank_cosine ?? null,
            predicted_entry: target.predicted_entry ?? target.prediction?.predicted_entry ?? target.prediction?.entry_observed ?? null,
            prediction_probability: predictionProbability,
            present_contributors: topPresentContributors,
            missing_bridges: bestMissingBridges,
            top_present_contributors: topPresentContributors,
            best_missing_bridges: bestMissingBridges,
            local_explanation: target.local_explanation ?? {},
            indicators: target.indicators ?? {}
          }
        ];
      })
    )
  };

  emergencePartitionCache.set(cacheKey, normalized);
  return normalized;
}
