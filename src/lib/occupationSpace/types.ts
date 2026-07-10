export interface OccupationNode {
  id: string;
  code?: string;
  label?: string;
  community?: string | number | null;
  x?: number | null;
  y?: number | null;
  degree?: number | null;
  weighted_degree?: number | null;
  weighted_degree_hidalgo?: number | null;
}

export interface OccupationEdge {
  source: string;
  target: string;
  weight?: number | null;
  hidalgo?: number | null;
  n_depts_both?: number | null;
}

export interface OccupationNeighbor {
  pcs: string;
  label?: string;
  hidalgo?: number | null;
}

export interface OccupationDetails {
  code: string;
  label?: string;
  community?: string | number | null;
  weighted_degree_hidalgo?: number | null;
  top_neighbors?: OccupationNeighbor[];
  explanation_rows?: number | null;
}

export interface OccupationSkillRomeLink {
  code_rome: string;
  libelle_rome?: string;
  competences: string[];
  savoirs: string[];
  source_pcs2020_labels?: string[];
  pcs2020_codes?: string[];
  pcs2003_codes?: string[];
  fap_codes?: string[];
  fap_labels?: string[];
  n_exact_paths?: number;
  n_source_pcs2020_labels?: number;
}

export interface OccupationSkillProfile {
  pcs_code: string;
  pcs_label?: string;
  bridge_method?: string;
  bridge_is_conservative?: boolean;
  rome_count?: number;
  competence_count?: number;
  savoir_count?: number;
  competences: string[];
  savoirs: string[];
  rome_links: OccupationSkillRomeLink[];
}

export interface OccupationSkillPayload {
  metadata?: {
    created_by?: string;
    source_file?: string;
    bridge_scope?: string;
    profile_count?: number;
  };
  profiles: Record<string, OccupationSkillProfile>;
}

export interface OccupationCommunityLabel {
  id: string;
  name?: string;
  fallback_label?: string;
  node_count?: number;
  color?: string;
}

export interface OccupationSpaceData {
  nodes: OccupationNode[];
  edges: OccupationEdge[];
  details: Record<string, OccupationDetails>;
}

export interface Department {
  code: string;
  name: string;
  is_special_geography?: boolean;
}

export type Year = number;

export type PresenceByDepartmentYear =
  | Record<string, Record<string, string[]>>
  | Array<{ department?: string; department_code?: string; code?: string; year: number | string; pcs?: string; occupations?: string[] }>;

export interface DensityEntry {
  pcs: string;
  label?: string;
  density_hidalgo?: number | null;
  density_cosine?: number | null;
  rank?: number | null;
}

export type DensityByDepartmentYear =
  | Record<string, Record<string, DensityEntry[]>>
  | Array<DensityEntry & { department?: string; department_code?: string; code?: string; year: number | string }>;

export interface PredictionEntry {
  pcs: string;
  label?: string;
  score?: number | null;
  probability?: number | null;
  prediction?: number | null;
  density_cosine?: number | null;
  next_year?: number | null;
  rank?: number | null;
  entry_observed?: boolean | null;
}

export type PredictionByDepartmentYear =
  | Record<string, Record<string, PredictionEntry[]>>
  | Array<PredictionEntry & { department?: string; department_code?: string; code?: string; year: number | string }>;

export interface OccupationTerritorialData {
  departments: Department[];
  years: Year[];
  presence: PresenceByDepartmentYear;
  density: DensityByDepartmentYear;
  predictions: PredictionByDepartmentYear;
}

export interface DepartmentYearTerritorialData {
  department: string;
  year: number;
  presence: string[];
  density: DensityEntry[];
  predictions: PredictionEntry[];
}

export interface TerritorialNodeStatus {
  nodeId: string;
  isTerritorialView: boolean;
  isPresent: boolean;
  isHighDensityOpportunity: boolean;
  isPredictedEntry: boolean;
  density?: DensityEntry;
  prediction?: PredictionEntry;
}

export interface EmergenceContributor {
  pcs: string;
  relatedness?: number | null;
  weight?: number | null;
  hidalgo?: number | null;
  contribution_score?: number | null;
}

export interface EmergenceBridge extends EmergenceContributor {
  local_density?: number | null;
  opportunity_rank?: number | null;
  bridge_score?: number | null;
  gateway_flags?: string[];
}

export interface EmergencePrediction {
  rank?: number | null;
  score?: number | null;
  probability?: number | null;
  entry_observed?: boolean | null;
  predicted_entry?: boolean | null;
  next_year?: number | null;
}

export interface EmergencePath {
  target_pcs: string;
  present: boolean;
  density_hidalgo?: number | null;
  density_cosine?: number | null;
  opportunity_rank_hidalgo?: number | null;
  opportunity_rank_cosine?: number | null;
  predicted_entry?: boolean | null;
  prediction_probability?: number | null;
  current_density?: number | null;
  opportunity_rank?: number | null;
  prediction?: EmergencePrediction | null;
  present_contributors?: EmergenceContributor[];
  missing_bridges?: EmergenceBridge[];
  top_present_contributors?: EmergenceContributor[];
  best_missing_bridges?: EmergenceBridge[];
  local_explanation?: Record<string, unknown>;
  indicators?: Record<string, unknown>;
}

export interface DepartmentYearEmergencePaths {
  department: string;
  year: number;
  targets: Record<string, EmergencePath>;
}
