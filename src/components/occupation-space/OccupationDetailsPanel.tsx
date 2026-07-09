/** @jsxImportSource react */
import { useState } from 'react';
import { scoreOfPrediction } from '@/lib/occupationSpace/territorial';
import type {
  EmergenceBridge,
  EmergenceContributor,
  EmergencePath,
  OccupationDetails,
  OccupationNode,
  TerritorialNodeStatus
} from '@/lib/occupationSpace/types';

interface Props {
  selectedNode?: OccupationNode | null;
  details?: OccupationDetails | null;
  territorialStatus?: TerritorialNodeStatus | null;
  emergencePath?: EmergencePath | null;
  nodeLabels?: Map<string, string>;
  isLoadingDetails?: boolean;
  isLoadingEmergence?: boolean;
  onFocusNode?: (nodeId: string) => void;
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Non disponible dans l'export complet";
  }

  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value);
}

function labelFor(pcs: string, nodeLabels?: Map<string, string>) {
  return nodeLabels?.get(pcs) ?? pcs;
}

function PathList({
  title,
  items,
  nodeLabels,
  onFocusNode,
  renderMetric
}: {
  title: string;
  items: Array<EmergenceContributor | EmergenceBridge>;
  nodeLabels?: Map<string, string>;
  onFocusNode?: (nodeId: string) => void;
  renderMetric: (item: EmergenceContributor | EmergenceBridge) => string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleItems = items.slice(0, isExpanded ? 15 : 5);

  return (
    <div className="occupation-path-list">
      <h4>{title}</h4>
      {items.length > 0 ? (
        <>
          <ol>
            {visibleItems.map((item) => (
              <li key={item.pcs}>
                <button type="button" onClick={() => onFocusNode?.(item.pcs)}>
                  <span>{labelFor(item.pcs, nodeLabels)}</span>
                  <strong>{renderMetric(item)}</strong>
                </button>
              </li>
            ))}
          </ol>
          {items.length > 5 && (
            <button className="occupation-show-more" type="button" onClick={() => setIsExpanded((value) => !value)}>
              {isExpanded ? 'Afficher moins' : `Afficher plus (${Math.min(items.length, 15)})`}
            </button>
          )}
        </>
      ) : (
        <p>Non disponible dans l'export complet.</p>
      )}
    </div>
  );
}

export default function OccupationDetailsPanel({
  selectedNode,
  details,
  territorialStatus,
  emergencePath,
  nodeLabels,
  isLoadingDetails = false,
  isLoadingEmergence = false,
  onFocusNode
}: Props) {
  if (!selectedNode) {
    return (
      <aside className="occupation-details-panel" aria-label="Details de la profession">
        <p className="occupation-panel-kicker">Selection</p>
        <h2>Choisissez une profession</h2>
        <p>
          Cliquez sur un noeud du graphe ou utilisez la recherche pour afficher ses proximités les plus fortes.
        </p>
      </aside>
    );
  }

  const code = details?.code ?? selectedNode.code ?? selectedNode.id;
  const label = details?.label ?? selectedNode.label ?? code;
  const neighbors = details?.top_neighbors ?? [];
  const presentContributors = emergencePath?.top_present_contributors ?? emergencePath?.present_contributors ?? [];
  const missingBridges = emergencePath?.best_missing_bridges ?? emergencePath?.missing_bridges ?? [];
  const densityHidalgo = emergencePath?.density_hidalgo ?? emergencePath?.current_density ?? null;
  const densityCosine = emergencePath?.density_cosine ?? null;
  const opportunityRankHidalgo = emergencePath?.opportunity_rank_hidalgo ?? emergencePath?.opportunity_rank ?? null;
  const opportunityRankCosine = emergencePath?.opportunity_rank_cosine ?? null;
  const predictionScore = emergencePath?.prediction_probability ?? emergencePath?.prediction?.probability ?? emergencePath?.prediction?.score ?? null;
  const predictedEntry = emergencePath?.predicted_entry ?? emergencePath?.prediction?.predicted_entry ?? emergencePath?.prediction?.entry_observed ?? null;

  return (
    <aside className="occupation-details-panel" aria-label="Details de la profession">
      <p className="occupation-panel-kicker">PCS {code}</p>
      <h2>{label}</h2>

      {isLoadingDetails && <p className="occupation-details-loading">Chargement des details...</p>}
      {isLoadingEmergence && <p className="occupation-details-loading">Chargement des trajectoires...</p>}

      <dl className="occupation-detail-metrics">
        <div>
          <dt>Communaute</dt>
          <dd>{details?.community ?? selectedNode.community ?? 'Non classee'}</dd>
        </div>
        <div>
          <dt>Degre pondere</dt>
          <dd>{formatNumber(details?.weighted_degree_hidalgo ?? selectedNode.weighted_degree_hidalgo)}</dd>
        </div>
        {territorialStatus?.isTerritorialView && (
          <>
            <div>
              <dt>Statut local</dt>
              <dd>{territorialStatus.isPresent ? 'Present' : 'Absent'}</dd>
            </div>
            <div>
              <dt>Densite locale</dt>
              <dd>{formatNumber(territorialStatus.density?.density_hidalgo)}</dd>
            </div>
            <div>
              <dt>Prediction</dt>
              <dd>
                {territorialStatus.prediction
                  ? `Rang ${territorialStatus.prediction.rank ?? '-'} - ${formatNumber(scoreOfPrediction(territorialStatus.prediction))}`
                  : "Non disponible dans l'export complet"}
              </dd>
            </div>
          </>
        )}
      </dl>

      {territorialStatus?.isTerritorialView && (
        <div className="occupation-emergence-path">
          <h3>Trajectoire d'emergence</h3>
          {emergencePath ? (
            <>
              <dl className="occupation-path-metrics">
                <div>
                  <dt>Etat cible</dt>
                  <dd>{emergencePath.present ? 'Present' : 'Absent'}</dd>
                </div>
                <div>
                  <dt>Rang d'opportunite Hidalgo</dt>
                  <dd>{opportunityRankHidalgo ? `#${opportunityRankHidalgo}` : "Non disponible dans l'export complet"}</dd>
                </div>
                <div>
                  <dt>Rang d'opportunite cosine</dt>
                  <dd>{opportunityRankCosine ? `#${opportunityRankCosine}` : "Non disponible dans l'export complet"}</dd>
                </div>
                <div>
                  <dt>Densite locale Hidalgo</dt>
                  <dd>{formatNumber(densityHidalgo, 3)}</dd>
                </div>
                <div>
                  <dt>Densite locale cosine</dt>
                  <dd>{formatNumber(densityCosine, 3)}</dd>
                </div>
                <div>
                  <dt>Statut de prediction</dt>
                  <dd>
                    {predictedEntry === null || predictedEntry === undefined
                      ? "Non disponible dans l'export complet"
                      : predictedEntry
                        ? 'Entree predite'
                        : 'Non predite'}
                  </dd>
                </div>
                <div>
                  <dt>Score de prediction</dt>
                  <dd>
                    {predictionScore === null || predictionScore === undefined
                      ? "Non disponible dans l'export complet"
                      : formatNumber(predictionScore, 3)}
                  </dd>
                </div>
              </dl>

              <PathList
                title="Top present contributors"
                items={presentContributors}
                nodeLabels={nodeLabels}
                onFocusNode={onFocusNode}
                renderMetric={(item) => formatNumber(item.contribution_score ?? item.relatedness ?? item.hidalgo ?? item.weight, 3)}
              />

              <PathList
                title="Ponts manquants les plus plausibles"
                items={missingBridges}
                nodeLabels={nodeLabels}
                onFocusNode={onFocusNode}
                renderMetric={(item) => {
                  const bridge = item as EmergenceBridge;
                  return bridge.bridge_score !== null && bridge.bridge_score !== undefined
                    ? formatNumber(bridge.bridge_score, 3)
                    : formatNumber(bridge.local_density, 3);
                }}
              />
            </>
          ) : (
            <p className="occupation-path-empty">
              Aucune trajectoire disponible pour ce PCS dans la partition chargee.
            </p>
          )}
        </div>
      )}

      <div className="occupation-neighbors">
        <h3>Voisins les plus proches</h3>
        {neighbors.length > 0 ? (
          <ol>
            {neighbors.slice(0, 6).map((neighbor) => (
              <li key={neighbor.pcs}>
                <span>{neighbor.label ?? neighbor.pcs}</span>
                <strong>{formatNumber(neighbor.hidalgo)}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p>Aucun voisin detaille disponible pour cette profession.</p>
        )}
      </div>
    </aside>
  );
}
