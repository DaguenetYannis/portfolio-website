/** @jsxImportSource react */
import { useState } from 'react';
import { scoreOfPrediction } from '@/lib/occupationSpace/territorial';
import type {
  EmergenceBridge,
  EmergenceContributor,
  EmergencePath,
  OccupationDetails,
  OccupationNode,
  OccupationSkillProfile,
  TerritorialNodeStatus
} from '@/lib/occupationSpace/types';

interface Props {
  selectedNode?: OccupationNode | null;
  details?: OccupationDetails | null;
  skillProfile?: OccupationSkillProfile | null;
  skillProfiles?: Record<string, OccupationSkillProfile> | null;
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

function uniqueItems(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function collectProfileItems(
  items: Array<EmergenceContributor | EmergenceBridge>,
  profiles: Record<string, OccupationSkillProfile> | null | undefined,
  field: 'competences' | 'savoirs'
): Set<string> {
  return new Set(
    items.flatMap((item) => profiles?.[item.pcs]?.[field] ?? [])
  );
}

function countCovered(targetItems: string[], sourceItems: Set<string>): number {
  return targetItems.filter((item) => sourceItems.has(item)).length;
}

function sampleMissing(targetItems: string[], sourceItems: Set<string>, limit = 6): string[] {
  return targetItems.filter((item) => !sourceItems.has(item)).slice(0, limit);
}

function CapabilityList({ title, items }: { title: string; items: string[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleItems = items.slice(0, isExpanded ? 18 : 6);

  return (
    <div className="occupation-capability-list">
      <h4>{title}</h4>
      {items.length > 0 ? (
        <>
          <ul>
            {visibleItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {items.length > 6 && (
            <button className="occupation-show-more" type="button" onClick={() => setIsExpanded((value) => !value)}>
              {isExpanded ? 'Afficher moins' : `Afficher plus (${Math.min(items.length, 18)})`}
            </button>
          )}
        </>
      ) : (
        <p>Non disponible dans la correspondance exacte.</p>
      )}
    </div>
  );
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
  skillProfile,
  skillProfiles,
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
  const targetCompetences = uniqueItems(skillProfile?.competences ?? []);
  const targetSavoirs = uniqueItems(skillProfile?.savoirs ?? []);
  const presentCompetences = collectProfileItems(presentContributors, skillProfiles, 'competences');
  const presentSavoirs = collectProfileItems(presentContributors, skillProfiles, 'savoirs');
  const bridgeCompetences = collectProfileItems(missingBridges, skillProfiles, 'competences');
  const bridgeSavoirs = collectProfileItems(missingBridges, skillProfiles, 'savoirs');
  const presentCompetenceCount = countCovered(targetCompetences, presentCompetences);
  const presentSavoirCount = countCovered(targetSavoirs, presentSavoirs);
  const bridgeCompetenceCount = countCovered(targetCompetences, bridgeCompetences);
  const bridgeSavoirCount = countCovered(targetSavoirs, bridgeSavoirs);
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

      <div className="occupation-capability-profile">
        <h3>Competences et savoirs</h3>
        {skillProfile ? (
          <>
            <p>
              Profil disponible via correspondance exacte conservatrice PCS-ROME:
              {' '}
              {skillProfile.rome_count ?? skillProfile.rome_links.length} ROME,
              {' '}
              {targetCompetences.length} competences,
              {' '}
              {targetSavoirs.length} savoirs.
            </p>

            {territorialStatus?.isTerritorialView && emergencePath && (
              <dl className="occupation-capability-coverage">
                <div>
                  <dt>Deja portes par contributeurs presents</dt>
                  <dd>{presentCompetenceCount}/{targetCompetences.length} competences - {presentSavoirCount}/{targetSavoirs.length} savoirs</dd>
                </div>
                <div>
                  <dt>Portes par ponts manquants plausibles</dt>
                  <dd>{bridgeCompetenceCount}/{targetCompetences.length} competences - {bridgeSavoirCount}/{targetSavoirs.length} savoirs</dd>
                </div>
              </dl>
            )}

            <CapabilityList title="Competences cibles" items={targetCompetences} />
            <CapabilityList title="Savoirs cibles" items={targetSavoirs} />

            {territorialStatus?.isTerritorialView && emergencePath && (
              <CapabilityList
                title="Blocs cibles non couverts par les contributeurs presents"
                items={[
                  ...sampleMissing(targetCompetences, presentCompetences, 4),
                  ...sampleMissing(targetSavoirs, presentSavoirs, 4)
                ]}
              />
            )}
          </>
        ) : (
          <p>Aucun profil de competences disponible dans la correspondance exacte conservatrice pour ce PCS.</p>
        )}
      </div>

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
