/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from 'react';
import type Sigma from 'sigma';
import type { Attributes } from 'graphology-types';
import OccupationDetailsPanel from './occupation-space/OccupationDetailsPanel';
import OccupationSpaceLegend from './occupation-space/OccupationSpaceLegend';
import { CompleteEmergencePartitionError } from '@/lib/occupationSpace/loadCompleteEmergencePartition';
import { buildGraph } from '@/lib/occupationSpace/buildGraph';
import {
  loadOccupationCommunityLabels,
  loadOccupationDetails,
  loadOccupationDepartmentYearData,
  loadOccupationEmergencePaths,
  loadOccupationSkillProfiles,
  loadOccupationSpaceGraphData,
  loadOccupationTerritorialMetadata
} from '@/lib/occupationSpace/loadOccupationSpaceData';
import {
  getNodeTerritorialStatus,
  scoreOfPrediction
} from '@/lib/occupationSpace/territorial';
import type {
  Department,
  DepartmentYearEmergencePaths,
  DepartmentYearTerritorialData,
  EmergencePath,
  OccupationDetails,
  OccupationNode,
  OccupationCommunityLabel,
  OccupationSkillNeighbor,
  OccupationSkillProfile,
  OccupationSpaceData,
  OccupationTerritorialData,
  TerritorialNodeStatus
} from '@/lib/occupationSpace/types';

type OccupationGraphData = Omit<OccupationSpaceData, 'details'>;

interface CommunityLabelPosition {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
}

const READABLE_EDGE_THRESHOLD = 0.85;
const ISOLATED_NODE_COLOR = 'rgba(148, 163, 184, 0.28)';
const OPPORTUNITY_HALO_COLOR = '#f1c96d';
const EMERGENCE_CONTRIBUTOR_COLOR = '#f6d365';
const EMERGENCE_BRIDGE_COLOR = '#82e6c6';
const SKILL_PROFILE_COLOR = '#a8d8ff';
const SKILL_NEIGHBOR_COLOR = '#ffcf7a';
const COMPETENCE_WEIGHT = 0.8;
const SAVOIR_WEIGHT = 0.2;

function getNodeFromGraph(id: string, data: OccupationGraphData): OccupationNode | null {
  return data.nodes.find((node) => node.id === id || node.code === id) ?? null;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('fr-FR');
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-';
  }

  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value);
}

function jaccard(left: string[], right: string[]): { score: number; shared: string[] } {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const shared = [...leftSet].filter((item) => rightSet.has(item)).sort((a, b) => a.localeCompare(b, 'fr'));
  const unionSize = new Set([...leftSet, ...rightSet]).size;

  return {
    score: unionSize > 0 ? shared.length / unionSize : 0,
    shared
  };
}

function skillSimilarity(
  source: OccupationSkillProfile,
  target: OccupationSkillProfile,
  label?: string
): OccupationSkillNeighbor | null {
  const competence = jaccard(source.competences, target.competences);
  const savoir = jaccard(source.savoirs, target.savoirs);
  const score = COMPETENCE_WEIGHT * competence.score + SAVOIR_WEIGHT * savoir.score;

  if (score <= 0) {
    return null;
  }

  return {
    pcs: target.pcs_code,
    label: label ?? target.pcs_label,
    score,
    competence_score: competence.score,
    savoir_score: savoir.score,
    shared_competences: competence.shared,
    shared_savoirs: savoir.shared
  };
}

function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getLargestCommunityCenters(
  graph: ReturnType<typeof buildGraph>,
  labels: Map<string, OccupationCommunityLabel>
): Array<{ id: string; label: string; color: string; x: number; y: number }> {
  const groups = new Map<string, { count: number; color: string; x: number; y: number }>();

  graph.forEachNode((node, attributes: Attributes) => {
    const community = attributes.community;
    const degree = Number(attributes.visibleDegreeComplete ?? attributes.graphDegree ?? 0);
    const x = Number(attributes.readableX ?? attributes.x);
    const y = Number(attributes.readableY ?? attributes.y);

    if (community === null || community === undefined || community === '' || degree <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    const key = String(community);
    const current = groups.get(key) ?? {
      count: 0,
      color: (attributes.baseColor as string | undefined) ?? (attributes.color as string | undefined) ?? '#8fb3ff',
      x: 0,
      y: 0
    };

    current.count += 1;
    current.x += x;
    current.y += y;
    groups.set(key, current);
  });

  return Array.from(groups.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 6)
    .map(([community, group]) => ({
      id: community,
      label: labels.get(community)?.name || labels.get(community)?.fallback_label || `Communaute ${community}`,
      color: group.color,
      x: group.x / group.count,
      y: group.y / group.count
    }));
}

function drawReadableNodeHover(
  context: CanvasRenderingContext2D,
  data: { x: number; y: number; size: number; label?: string; color: string; showLabel?: boolean; haloColor?: string },
) {
  const haloColor = data.haloColor ?? 'rgba(255, 255, 255, 0.72)';
  const radius = Math.max(data.size + 3, 8);

  context.beginPath();
  context.arc(data.x, data.y, radius + 3, 0, Math.PI * 2);
  context.fillStyle = haloColor;
  context.globalAlpha = 0.22;
  context.fill();
  context.globalAlpha = 1;

  context.beginPath();
  context.arc(data.x, data.y, radius, 0, Math.PI * 2);
  context.fillStyle = data.color;
  context.strokeStyle = 'rgba(244, 247, 251, 0.92)';
  context.lineWidth = 2;
  context.fill();
  context.stroke();

  if (!data.showLabel || !data.label) {
    return;
  }

  const fontSize = 13;
  const paddingX = 9;
  const paddingY = 6;
  const label = data.label;

  context.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  const textWidth = context.measureText(label).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;
  const boxX = data.x + radius + 8;
  const boxY = data.y - boxHeight / 2;

  context.fillStyle = 'rgba(10, 14, 20, 0.96)';
  context.strokeStyle = 'rgba(244, 247, 251, 0.22)';
  context.lineWidth = 1;
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(boxX, boxY, boxWidth, boxHeight, 7);
  } else {
    context.rect(boxX, boxY, boxWidth, boxHeight);
  }
  context.fill();
  context.stroke();

  context.fillStyle = '#f8fafc';
  context.fillText(label, boxX + paddingX, boxY + paddingY + fontSize - 2);
}

export default function OccupationSpaceExplorer() {
  const componentStartRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Sigma | null>(null);
  const detailsRef = useRef<Record<string, OccupationDetails> | null>(null);
  const detailsLoadPromiseRef = useRef<Promise<Record<string, OccupationDetails>> | null>(null);
  const territorialLoadPromiseRef = useRef<Promise<DepartmentYearTerritorialData> | null>(null);
  const emergenceLoadPromiseRef = useRef<Promise<DepartmentYearEmergencePaths> | null>(null);
  const territorialLoadKeyRef = useRef('');
  const emergenceLoadKeyRef = useRef('');
  const [data, setData] = useState<OccupationGraphData | null>(null);
  const [details, setDetails] = useState<Record<string, OccupationDetails> | null>(null);
  const [skillProfiles, setSkillProfiles] = useState<Record<string, OccupationSkillProfile> | null>(null);
  const [departmentYearData, setDepartmentYearData] = useState<DepartmentYearTerritorialData | null>(null);
  const [emergencePathData, setEmergencePathData] = useState<DepartmentYearEmergencePaths | null>(null);
  const [territorialMetadata, setTerritorialMetadata] = useState<Pick<OccupationTerritorialData, 'departments' | 'years'> | null>(null);
  const [communityLabelRows, setCommunityLabelRows] = useState<OccupationCommunityLabel[]>([]);
  const [selectedNode, setSelectedNode] = useState<OccupationNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedDepartmentCode, setSelectedDepartmentCode] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | ''>('');
  const [showPresent, setShowPresent] = useState(true);
  const [showOpportunities, setShowOpportunities] = useState(true);
  const [showSkills, setShowSkills] = useState(false);
  const [showCommunityNames, setShowCommunityNames] = useState(true);
  const [communityLabels, setCommunityLabels] = useState<CommunityLabelPosition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [territorialError, setTerritorialError] = useState<string | null>(null);
  const [emergenceError, setEmergenceError] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isLoadingTerritorial, setIsLoadingTerritorial] = useState(false);
  const [isLoadingEmergence, setIsLoadingEmergence] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRendererReady, setIsRendererReady] = useState(false);

  const graph = useMemo(() => {
    if (!data) {
      return null;
    }

    const start = typeof performance !== 'undefined' ? performance.now() : 0;
    const builtGraph = buildGraph(data);

    if (import.meta.env.DEV && start) {
      console.info('[occupation-space] graph built', {
        nodes: builtGraph.order,
        edges: builtGraph.size,
        ms: Math.round((performance.now() - start) * 10) / 10
      });
    }

    return builtGraph;
  }, [data]);
  const departments = territorialMetadata?.departments ?? [];
  const years = territorialMetadata?.years ?? [];
  const activeYear = selectedYear || years.at(-1) || '';
  const selectedDepartment = departments.find((department) => department.code === selectedDepartmentCode) ?? null;
  const isTerritorialView = Boolean(selectedDepartmentCode && activeYear);

  const presenceSet = useMemo(
    () => new Set((departmentYearData?.presence ?? []).map(String)),
    [departmentYearData]
  );

  const densityMap = useMemo(
    () => new Map((departmentYearData?.density ?? []).map((entry) => [entry.pcs, entry])),
    [departmentYearData]
  );

  const predictionMap = useMemo(
    () => new Map((departmentYearData?.predictions ?? []).map((entry) => [entry.pcs, entry])),
    [departmentYearData]
  );

  const nodeLabelMap = useMemo(
    () => new Map((data?.nodes ?? []).map((node) => [node.code ?? node.id, node.label ?? node.code ?? node.id])),
    [data]
  );

  const emergencePathMap = useMemo(
    () => new Map(Object.entries(emergencePathData?.targets ?? {})),
    [emergencePathData]
  );

  const territorialStatuses = useMemo(() => {
    if (!data || !isTerritorialView) {
      return new Map<string, TerritorialNodeStatus>();
    }

    return new Map(
      data.nodes.map((node) => [
        node.id,
        getNodeTerritorialStatus(node.id, selectedDepartmentCode, activeYear, presenceSet, densityMap, predictionMap)
      ])
    );
  }, [data, isTerritorialView, selectedDepartmentCode, activeYear, presenceSet, densityMap, predictionMap]);

  const topOpportunities = useMemo(
    () =>
      Array.from(densityMap.values())
        .filter((entry) => !presenceSet.has(entry.pcs))
        .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
        .slice(0, 10),
    [densityMap, presenceSet]
  );

  const topPredictions = useMemo(
    () =>
      Array.from(predictionMap.values())
        .filter((entry) => !presenceSet.has(entry.pcs))
        .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
        .slice(0, 10),
    [predictionMap, presenceSet]
  );

  const selectedTerritorialStatus = selectedNode ? territorialStatuses.get(selectedNode.id) ?? null : null;
  const selectedEmergencePath = selectedNode ? emergencePathMap.get(selectedNode.code ?? selectedNode.id) ?? null : null;
  const selectedSkillProfile = selectedNode ? skillProfiles?.[selectedNode.code ?? selectedNode.id] ?? null : null;
  const skillNeighbors = useMemo(() => {
    if (!selectedSkillProfile || !skillProfiles) {
      return [];
    }

    return Object.values(skillProfiles)
      .filter((profile) => profile.pcs_code !== selectedSkillProfile.pcs_code)
      .map((profile) => skillSimilarity(
        selectedSkillProfile,
        profile,
        nodeLabelMap.get(profile.pcs_code) ?? profile.pcs_label
      ))
      .filter((neighbor): neighbor is OccupationSkillNeighbor => Boolean(neighbor))
      .sort((left, right) =>
        right.score - left.score ||
        right.competence_score - left.competence_score ||
        right.savoir_score - left.savoir_score ||
        left.pcs.localeCompare(right.pcs)
      )
      .slice(0, 12);
  }, [selectedSkillProfile, skillProfiles, nodeLabelMap]);
  const skillNeighborMap = useMemo(
    () => new Map(skillNeighbors.map((neighbor) => [neighbor.pcs, neighbor])),
    [skillNeighbors]
  );
  const communityLabelMap = useMemo(
    () => new Map(communityLabelRows.map((label) => [label.id, label])),
    [communityLabelRows]
  );
  const communityCenters = useMemo(
    () => (graph ? getLargestCommunityCenters(graph, communityLabelMap) : []),
    [graph, communityLabelMap]
  );

  const searchMatches = useMemo(() => {
    if (!data) {
      return [];
    }

    const query = normalizeSearch(search);
    if (query.length < 2) {
      return [];
    }

    return data.nodes
      .filter((node) => {
        const code = normalizeSearch(node.code ?? node.id);
        const label = normalizeSearch(node.label ?? '');
        return code.includes(query) || label.includes(query);
      })
      .slice(0, 8);
  }, [data, search]);

  useEffect(() => {
    detailsRef.current = details;
  }, [details]);

  useEffect(() => {
    let isMounted = true;

    loadOccupationSpaceGraphData()
      .then((loadedData) => {
        if (isMounted) {
          setData(loadedData);
        }
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Erreur de chargement des donnees.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    loadOccupationCommunityLabels()
      .then((labels) => {
        if (isMounted) {
          setCommunityLabelRows(labels);
        }
      })
      .catch(() => {
        if (isMounted) {
          setCommunityLabelRows([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    loadOccupationSkillProfiles()
      .then((profiles) => {
        if (isMounted) {
          setSkillProfiles(profiles);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSkillProfiles({});
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    loadOccupationTerritorialMetadata()
      .then((metadata) => {
        if (isMounted) {
          setTerritorialMetadata(metadata);
          setSelectedYear((currentYear) => currentYear || metadata.years.at(-1) || '');
        }
      })
      .catch(() => {
        if (isMounted) {
          setTerritorialMetadata({ departments: [], years: [] });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function ensureDetailsLoaded() {
    if (detailsRef.current) {
      return;
    }

    setDetailsError(null);

    if (!detailsLoadPromiseRef.current) {
      setIsLoadingDetails(true);
      detailsLoadPromiseRef.current = loadOccupationDetails();
    }

    try {
      setDetails(await detailsLoadPromiseRef.current);
    } catch (loadError) {
      detailsLoadPromiseRef.current = null;
      setDetailsError(loadError instanceof Error ? loadError.message : 'Erreur de chargement des details.');
    } finally {
      setIsLoadingDetails(false);
    }
  }

  async function loadSelectedDepartmentYear(departmentCode: string, year: number | string) {
    const key = `${departmentCode}-${year}`;

    if (!departmentCode || !year) {
      setDepartmentYearData(null);
      return null;
    }

    if (departmentYearData?.department === departmentCode && String(departmentYearData.year) === String(year)) {
      return departmentYearData;
    }

    setTerritorialError(null);

    if (!territorialLoadPromiseRef.current || territorialLoadKeyRef.current !== key) {
      setIsLoadingTerritorial(true);
      territorialLoadKeyRef.current = key;
      territorialLoadPromiseRef.current = loadOccupationDepartmentYearData(departmentCode, year);
    }

    try {
      const loadedData = await territorialLoadPromiseRef.current;
      setDepartmentYearData(loadedData);
      return loadedData;
    } catch (loadError) {
      territorialLoadPromiseRef.current = null;
      territorialLoadKeyRef.current = '';
      setDepartmentYearData(null);
      setTerritorialError(loadError instanceof Error ? loadError.message : 'Erreur de chargement des donnees territoriales.');
      return null;
    } finally {
      setIsLoadingTerritorial(false);
    }
  }

  async function loadSelectedEmergencePaths(departmentCode: string, year: number | string) {
    const key = `${departmentCode}-${year}`;

    if (!departmentCode || !year) {
      setEmergencePathData(null);
      return null;
    }

    if (emergencePathData?.department === departmentCode && String(emergencePathData.year) === String(year)) {
      return emergencePathData;
    }

    setEmergenceError(null);

    if (!emergenceLoadPromiseRef.current || emergenceLoadKeyRef.current !== key) {
      setIsLoadingEmergence(true);
      emergenceLoadKeyRef.current = key;
      emergenceLoadPromiseRef.current = loadOccupationEmergencePaths(departmentCode, year);
    }

    try {
      const loadedData = await emergenceLoadPromiseRef.current;
      setEmergencePathData(loadedData);
      return loadedData;
    } catch (loadError) {
      emergenceLoadPromiseRef.current = null;
      emergenceLoadKeyRef.current = '';
      setEmergencePathData(null);
      setEmergenceError(
        loadError instanceof CompleteEmergencePartitionError
          ? 'Les donnees detaillees de trajectoire ne sont pas disponibles pour ce departement-annee.'
          : loadError instanceof Error
            ? loadError.message
            : 'Erreur de chargement des trajectoires.'
      );
      return null;
    } finally {
      setIsLoadingEmergence(false);
    }
  }

  useEffect(() => {
    if (!selectedDepartmentCode || !activeYear) {
      setDepartmentYearData(null);
      setEmergencePathData(null);
      return;
    }

    void loadSelectedDepartmentYear(selectedDepartmentCode, activeYear);
    void loadSelectedEmergencePaths(selectedDepartmentCode, activeYear);
  }, [selectedDepartmentCode, activeYear]);

  useEffect(() => {
    if (!containerRef.current || !graph || !data) {
      return undefined;
    }

    let renderer: Sigma | null = null;
    let isCancelled = false;

    import('sigma').then(({ default: SigmaRenderer }) => {
      if (!containerRef.current || isCancelled) {
        return;
      }

      renderer = new SigmaRenderer(graph, containerRef.current, {
        allowInvalidContainer: true,
        autoCenter: true,
        autoRescale: true,
        defaultEdgeType: 'line',
        defaultEdgeColor: 'rgba(142, 151, 166, 0.2)',
        defaultNodeColor: '#8fb3ff',
        defaultDrawNodeHover: drawReadableNodeHover,
        labelColor: { color: '#f4f7fb' },
        labelDensity: 0.06,
        labelGridCellSize: 90,
        labelRenderedSizeThreshold: 13,
        minCameraRatio: 0.08,
        maxCameraRatio: 3,
        renderEdgeLabels: false,
        zIndex: true
      });

      rendererRef.current = renderer;
      setIsRendererReady(true);
      renderer.refresh();

      if (import.meta.env.DEV && componentStartRef.current) {
        requestAnimationFrame(() => {
          console.info('[occupation-space] first sigma frame', {
            ms: Math.round((performance.now() - componentStartRef.current) * 10) / 10,
            nodes: graph.order,
            edges: graph.size
          });
        });
      }

      renderer.on('enterNode', ({ node }) => setHoveredNode(node));
      renderer.on('leaveNode', () => setHoveredNode(null));
      renderer.on('clickNode', ({ node }) => {
        setSelectedNode(getNodeFromGraph(node, data));
        void ensureDetailsLoaded();
      });
    });

    return () => {
      isCancelled = true;
      renderer?.kill();
      rendererRef.current = null;
      setIsRendererReady(false);
    };
  }, [graph, data]);

  useEffect(() => {
    if (!isRendererReady || !rendererRef.current || !communityCenters.length) {
      setCommunityLabels([]);
      return undefined;
    }

    const renderer = rendererRef.current;

    const updateCommunityLabels = () => {
      const nextLabels = communityCenters.map((center) => {
        const position = renderer.graphToViewport({ x: center.x, y: center.y });
        return {
          ...center,
          x: position.x,
          y: position.y
        };
      });

      setCommunityLabels(nextLabels);
    };

    updateCommunityLabels();
    renderer.on('afterRender', updateCommunityLabels);

    return () => {
      renderer.off('afterRender', updateCommunityLabels);
    };
  }, [communityCenters, isRendererReady]);

  useEffect(() => {
    if (!graph) {
      return;
    }

    graph.forEachEdge((edge, attributes: Attributes) => {
      const weight = Number(attributes.hidalgo ?? attributes.weight ?? 0);
      const isReadableEdge = weight >= READABLE_EDGE_THRESHOLD;

      graph.mergeEdgeAttributes(edge, {
        hidden: !isReadableEdge,
        color: isReadableEdge ? 'rgba(190, 202, 222, 0.34)' : 'rgba(155, 164, 178, 0)',
        size: Math.max(0.7, Math.min(2.4, weight * 1.5))
      });
    });

    graph.forEachNode((node, attributes: Attributes) => {
      const nodeCode = String(attributes.code ?? node);
      const status = territorialStatuses.get(node);
      const isPathContributor = Boolean(
        selectedEmergencePath?.top_present_contributors?.some((contributor) => contributor.pcs === nodeCode)
      );
      const isPathBridge = Boolean(
        selectedEmergencePath?.best_missing_bridges?.some((bridge) => bridge.pcs === nodeCode)
      );
      const skillNeighbor = skillNeighborMap.get(nodeCode);
      const hasSkillProfile = Boolean(skillProfiles?.[nodeCode]);
      const isSkillNeighbor = showSkills && Boolean(skillNeighbor);
      const isSkillProfileVisible = showSkills && hasSkillProfile;
      const isSelectedOrHovered = selectedNode?.id === node || hoveredNode === node;
      const baseColor = (attributes.baseColor as string | undefined) ?? (attributes.community === null ? '#7f8794' : attributes.color);
      const baseSize = Number(attributes.baseSize ?? attributes.size) || 4;
      const x = Number(attributes.readableX ?? attributes.x);
      const y = Number(attributes.readableY ?? attributes.y);
      const readableDegree = Number(attributes.visibleDegreeReadable ?? 0);
      const completeDegree = Number(attributes.visibleDegreeComplete ?? attributes.graphDegree ?? 0);
      const hasStrongReadableLink = readableDegree > 0;
      const isIsolated = completeDegree <= 0;
      const hidden = false;
      const subdued = !hasStrongReadableLink;

      if (!isTerritorialView || !status) {
        graph.mergeNodeAttributes(node, {
          x,
          y,
          color: isIsolated
            ? ISOLATED_NODE_COLOR
            : isSkillNeighbor
              ? SKILL_NEIGHBOR_COLOR
              : isSkillProfileVisible
                ? colorWithAlpha(SKILL_PROFILE_COLOR, selectedSkillProfile ? 0.38 : 0.78)
                : subdued
                  ? colorWithAlpha(baseColor, 0.34)
                  : baseColor,
          size: Math.max(
            isIsolated ? 1.9 : 2.4,
            (isIsolated ? baseSize * 0.52 : subdued ? baseSize * 0.72 : baseSize) +
              (isSkillNeighbor ? 4 : isSkillProfileVisible ? 1.4 : 0)
          ),
          hidden,
          highlighted: isSelectedOrHovered || isSkillNeighbor || isSkillProfileVisible,
          showLabel: isSelectedOrHovered || isSkillNeighbor,
          haloColor: isSkillNeighbor ? SKILL_NEIGHBOR_COLOR : isSelectedOrHovered ? baseColor : undefined,
          zIndex: isSelectedOrHovered ? 4 : isSkillNeighbor ? 3 : isSkillProfileVisible ? 2 : isIsolated ? -1 : subdued ? 0 : 1
        });
        return;
      }

      const isOpportunityVisible = showOpportunities && status.isHighDensityOpportunity;
      const isPresentVisible = showPresent && status.isPresent;
      const isSelectedTarget = Boolean(selectedEmergencePath && selectedEmergencePath.target_pcs === nodeCode);
      const isPathNode = isPathContributor || isPathBridge;
      const muted = !isPresentVisible && !isOpportunityVisible && !isSkillProfileVisible;
      const opacity = isPresentVisible
        ? 0.95
        : isOpportunityVisible || isSkillProfileVisible
          ? 0.82
          : 0.22;

      graph.mergeNodeAttributes(node, {
        x,
        y,
        color: isIsolated
          ? ISOLATED_NODE_COLOR
          : isSelectedTarget
            ? '#f8fafc'
            : isSkillNeighbor
              ? SKILL_NEIGHBOR_COLOR
            : isPathBridge
            ? colorWithAlpha(EMERGENCE_BRIDGE_COLOR, 0.9)
            : isPathContributor
              ? colorWithAlpha(EMERGENCE_CONTRIBUTOR_COLOR, 0.9)
              : isSkillProfileVisible
                ? colorWithAlpha(SKILL_PROFILE_COLOR, selectedSkillProfile ? 0.38 : 0.78)
                : colorWithAlpha(baseColor, subdued ? Math.min(opacity, 0.34) : muted ? 0.16 : opacity),
        size: Math.max(
          isIsolated ? 1.8 : 2,
          baseSize * (isIsolated ? 0.52 : subdued ? 0.78 : 1) +
            (isSelectedOrHovered || isSelectedTarget ? 4.8 : isSkillNeighbor ? 4 : isPathNode ? 3.2 : isSkillProfileVisible ? 1.5 : isOpportunityVisible ? 2.5 : isPresentVisible ? 1 : -1)
        ),
        hidden,
        highlighted: isSelectedOrHovered || isSelectedTarget || isPathNode || isSkillNeighbor || isSkillProfileVisible || isOpportunityVisible,
        showLabel: isSelectedOrHovered || isSelectedTarget || isPathNode || isSkillNeighbor,
        haloColor: isSelectedTarget
          ? '#f8fafc'
          : isSkillNeighbor
            ? SKILL_NEIGHBOR_COLOR
          : isPathBridge
          ? EMERGENCE_BRIDGE_COLOR
          : isPathContributor
            ? EMERGENCE_CONTRIBUTOR_COLOR
            : isOpportunityVisible
                ? OPPORTUNITY_HALO_COLOR
                : isSkillProfileVisible
                  ? SKILL_PROFILE_COLOR
                  : baseColor,
        zIndex: isSelectedOrHovered || isSelectedTarget ? 6 : isSkillNeighbor || isPathNode ? 5 : isOpportunityVisible ? 4 : isSkillProfileVisible ? 3 : isPresentVisible ? 2 : 0
      });
    });

    rendererRef.current?.refresh();
  }, [
    graph,
    territorialStatuses,
    isTerritorialView,
    selectedNode,
    hoveredNode,
    showPresent,
    showOpportunities,
    showSkills,
    selectedEmergencePath,
    selectedSkillProfile,
    skillNeighborMap,
    skillProfiles
  ]);

  function handleDepartmentChange(departmentCode: string) {
    setSelectedDepartmentCode(departmentCode);
  }

  function focusNode(node: OccupationNode) {
    if (!rendererRef.current || !graph?.hasNode(node.id)) {
      setSelectedNode(node);
      return;
    }

    const attributes = graph.getNodeAttributes(node.id);
    setSelectedNode(node);
    setSearch(node.label ?? node.code ?? node.id);
    void ensureDetailsLoaded();

    if (Number.isFinite(attributes.x) && Number.isFinite(attributes.y)) {
      rendererRef.current.getCamera().animate(
        { x: attributes.x, y: attributes.y, ratio: 0.18 },
        { duration: 550 }
      );
    }
  }

  function resetCamera() {
    if (!rendererRef.current || !graph) {
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let count = 0;

    graph.forEachNode((_node, attributes: Attributes) => {
      if (attributes.hidden) {
        return;
      }

      const x = Number(attributes.x);
      const y = Number(attributes.y);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      count += 1;
    });

    if (!count) {
      rendererRef.current.getCamera().animatedReset({ duration: 500 });
      return;
    }

    rendererRef.current.getCamera().animate(
      {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        ratio: 0.95
      },
      { duration: 550 }
    );
  }

  function resetTerritorialSelection() {
    setSelectedDepartmentCode('');
    setSelectedYear('');
    setTerritorialError(null);
  }

  function focusNodeById(nodeId: string) {
    const node = data?.nodes.find((candidate) => candidate.id === nodeId || candidate.code === nodeId);

    if (node) {
      focusNode(node);
    }
  }

  const selectedDetails = selectedNode ? details?.[selectedNode.code ?? selectedNode.id] ?? null : null;

  if (isLoading) {
    return <div className="occupation-state">Chargement du reseau national...</div>;
  }

  if (error) {
    return <div className="occupation-state occupation-state-error">{error}</div>;
  }

  if (!data || !graph || graph.order === 0) {
    return <div className="occupation-state">Aucune profession disponible dans le jeu de donnees.</div>;
  }

  return (
    <div className="occupation-explorer">
      <section className="occupation-graph-region" aria-label="Graphe national des metiers">
        <div className="occupation-toolbar">
          <div className="occupation-control-stack">
            <div className="occupation-selectors">
              <label>
                Departement
                <select
                  value={selectedDepartmentCode}
                  onChange={(event) => handleDepartmentChange(event.target.value)}
                >
                  <option value="">Vue nationale</option>
                  {departments.map((department: Department) => (
                    <option value={department.code} key={department.code}>
                      {department.code} - {department.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Annee
                <select
                  value={activeYear}
                  disabled={!years.length}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                >
                  {!years.length && <option value="">Annee</option>}
                  {years.map((year) => (
                    <option value={year} key={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>

              <button className="occupation-reset" type="button" onClick={resetTerritorialSelection}>
                Reinitialiser
              </button>
            </div>

            <div className="occupation-toggles" aria-label="Affichage de la carte">
              <button
                type="button"
                className={showCommunityNames ? 'is-active' : ''}
                onClick={() => setShowCommunityNames((value) => !value)}
              >
                Communautes
              </button>
              <button
                type="button"
                className={showSkills ? 'is-active' : ''}
                onClick={() => setShowSkills((value) => !value)}
              >
                Competences
              </button>
            </div>

            {isTerritorialView && (
              <div className="occupation-toggles" aria-label="Statuts territoriaux">
                <button
                  type="button"
                  className={showPresent ? 'is-active' : ''}
                  onClick={() => setShowPresent((value) => !value)}
                >
                  Presents
                </button>
                <button
                  type="button"
                  className={showOpportunities ? 'is-active' : ''}
                  onClick={() => setShowOpportunities((value) => !value)}
                >
                  Opportunites
                </button>
              </div>
            )}
          </div>

          <div className="occupation-search">
            <label htmlFor="occupation-search">Rechercher</label>
            <input
              id="occupation-search"
              type="search"
              value={search}
              placeholder="Code PCS ou libelle"
              onChange={(event) => setSearch(event.target.value)}
            />
            {searchMatches.length > 0 && (
              <div className="occupation-search-results">
                {searchMatches.map((node) => (
                  <button type="button" key={node.id} onClick={() => focusNode(node)}>
                    <span>{node.label ?? node.id}</span>
                    <strong>{node.code ?? node.id}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="occupation-reset" type="button" onClick={resetCamera}>
            Recentrer
          </button>
        </div>

        {isLoadingTerritorial && <div className="occupation-floating-status">Chargement territorial...</div>}
        <div ref={containerRef} className="occupation-graph-canvas" />
        {showCommunityNames && communityLabels.length > 0 && (
          <div className="occupation-community-label-layer" aria-hidden="true">
            {communityLabels.map((label) => (
              <span
                key={label.id}
                style={{
                  left: `${label.x}px`,
                  top: `${label.y}px`,
                  borderColor: colorWithAlpha(label.color, 0.45),
                  color: label.color
                }}
              >
                {label.label}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="occupation-side">
        {isTerritorialView && (
          <aside className="occupation-summary-panel" aria-label="Synthese departement-annee">
            <p className="occupation-panel-kicker">Vue territoriale</p>
            <h2>
              {selectedDepartment?.name ?? selectedDepartmentCode} {activeYear}
            </h2>
            <div className="occupation-summary-cards">
              <div>
                <strong>{presenceSet.size}</strong>
                <span>PCS presents</span>
              </div>
              <div>
                <strong>{topOpportunities.length}</strong>
                <span>opportunites</span>
              </div>
              <div>
                <strong>{topPredictions.length}</strong>
                <span>predictions</span>
              </div>
            </div>
          </aside>
        )}

        <OccupationDetailsPanel
          selectedNode={selectedNode}
          details={selectedDetails}
          skillProfile={selectedSkillProfile}
          skillProfiles={skillProfiles}
          skillNeighbors={skillNeighbors}
          territorialStatus={selectedTerritorialStatus}
          emergencePath={selectedEmergencePath}
          nodeLabels={nodeLabelMap}
          isLoadingDetails={isLoadingDetails}
          isLoadingEmergence={isLoadingEmergence}
          onFocusNode={focusNodeById}
        />
        {detailsError && <div className="occupation-details-error">{detailsError}</div>}
        {territorialError && <div className="occupation-details-error">{territorialError}</div>}
        {emergenceError && <div className="occupation-details-error">{emergenceError}</div>}

        {isTerritorialView && (
          <aside className="occupation-opportunity-panel" aria-label="Opportunites territoriales">
            <h2>Top opportunites</h2>
            <ol>
              {topOpportunities.map((entry) => (
                <li key={entry.pcs}>
                  <button type="button" onClick={() => focusNodeById(entry.pcs)}>
                    <span>{entry.label ?? entry.pcs}</span>
                    <strong>{formatNumber(entry.density_hidalgo)}</strong>
                  </button>
                </li>
              ))}
            </ol>

            <h2>Entrees predites</h2>
            <ol>
              {topPredictions.map((entry) => (
                <li key={entry.pcs}>
                  <button type="button" onClick={() => focusNodeById(entry.pcs)}>
                    <span>{entry.label ?? entry.pcs}</span>
                    <strong>{formatNumber(scoreOfPrediction(entry))}</strong>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}

        <OccupationSpaceLegend
          nodes={data.nodes}
          isTerritorialView={isTerritorialView}
          communityLabels={communityLabelRows}
        />
      </div>
    </div>
  );
}
