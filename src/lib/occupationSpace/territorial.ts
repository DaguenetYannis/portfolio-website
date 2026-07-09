import type {
  DensityByDepartmentYear,
  DensityEntry,
  PredictionByDepartmentYear,
  PredictionEntry,
  PresenceByDepartmentYear,
  TerritorialNodeStatus
} from './types';

function yearKey(year: number | string | null | undefined): string {
  return year === null || year === undefined ? '' : String(year);
}

function normalizeDepartmentCode(code: string | number | null | undefined): string {
  return code === null || code === undefined ? '' : String(code);
}

function rowDepartment(row: Record<string, unknown>): string {
  return normalizeDepartmentCode(row.department_code ?? row.department ?? row.code);
}

function rowYear(row: Record<string, unknown>): string {
  return yearKey(row.year as string | number | undefined);
}

export function getPresenceSet(
  data: PresenceByDepartmentYear | null | undefined,
  departmentCode: string | null | undefined,
  year: number | string | null | undefined
): Set<string> {
  const department = normalizeDepartmentCode(departmentCode);
  const selectedYear = yearKey(year);

  if (!data || !department || !selectedYear) {
    return new Set();
  }

  if (Array.isArray(data)) {
    const values = data.flatMap((row) => {
      const record = row as Record<string, unknown>;

      if (rowDepartment(record) !== department || rowYear(record) !== selectedYear) {
        return [];
      }

      if (Array.isArray(record.occupations)) {
        return record.occupations.map(String);
      }

      return record.pcs ? [String(record.pcs)] : [];
    });

    return new Set(values);
  }

  const occupations = data[department]?.[selectedYear] ?? [];
  return new Set(Array.isArray(occupations) ? occupations.map(String) : []);
}

export function getDensityMap(
  data: DensityByDepartmentYear | null | undefined,
  departmentCode: string | null | undefined,
  year: number | string | null | undefined
): Map<string, DensityEntry> {
  const department = normalizeDepartmentCode(departmentCode);
  const selectedYear = yearKey(year);
  const rows = getRowsForDepartmentYear<DensityEntry>(data, department, selectedYear);
  return new Map(rows.filter((row) => row.pcs).map((row) => [String(row.pcs), row]));
}

export function getPredictionMap(
  data: PredictionByDepartmentYear | null | undefined,
  departmentCode: string | null | undefined,
  year: number | string | null | undefined
): Map<string, PredictionEntry> {
  const department = normalizeDepartmentCode(departmentCode);
  const selectedYear = yearKey(year);
  const rows = getRowsForDepartmentYear<PredictionEntry>(data, department, selectedYear);
  return new Map(rows.filter((row) => row.pcs).map((row) => [String(row.pcs), row]));
}

function getRowsForDepartmentYear<T extends { pcs: string }>(
  data: Record<string, Record<string, T[]>> | Array<T & Record<string, unknown>> | null | undefined,
  department: string,
  selectedYear: string
): T[] {
  if (!data || !department || !selectedYear) {
    return [];
  }

  if (Array.isArray(data)) {
    return data.filter((row) => rowDepartment(row) === department && rowYear(row) === selectedYear) as T[];
  }

  return data[department]?.[selectedYear] ?? [];
}

export function getNodeTerritorialStatus(
  nodeId: string,
  selectedDepartment: string | null | undefined,
  selectedYear: number | string | null | undefined,
  presenceSet: Set<string>,
  densityMap: Map<string, DensityEntry>,
  predictionMap: Map<string, PredictionEntry>
): TerritorialNodeStatus {
  const isTerritorialView = Boolean(selectedDepartment && selectedYear);
  const density = densityMap.get(nodeId);
  const prediction = predictionMap.get(nodeId);
  const isPresent = isTerritorialView ? presenceSet.has(nodeId) : false;

  return {
    nodeId,
    isTerritorialView,
    isPresent,
    isHighDensityOpportunity: isTerritorialView && !isPresent && Boolean(density),
    isPredictedEntry: isTerritorialView && !isPresent && Boolean(prediction),
    density,
    prediction
  };
}

export function scoreOfPrediction(prediction: PredictionEntry | undefined): number | undefined {
  const value = prediction?.score ?? prediction?.probability ?? prediction?.prediction;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

