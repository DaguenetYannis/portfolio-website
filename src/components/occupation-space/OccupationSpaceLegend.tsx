/** @jsxImportSource react */
import { getCommunityColorForLegend } from '@/lib/occupationSpace/buildGraph';
import type { OccupationCommunityLabel, OccupationNode } from '@/lib/occupationSpace/types';

interface Props {
  nodes: OccupationNode[];
  isTerritorialView?: boolean;
  communityLabels?: OccupationCommunityLabel[];
}

export default function OccupationSpaceLegend({ nodes, isTerritorialView = false, communityLabels = [] }: Props) {
  const labelMap = new Map(communityLabels.map((label) => [label.id, label]));
  const communities = Array.from(
    new Set(nodes.map((node) => node.community).filter((community) => community !== null && community !== undefined))
  ).slice(0, 8);

  return (
    <aside className="occupation-legend" aria-label="Legende du graphe">
      <h2>Legende</h2>
      {isTerritorialView ? (
        <dl>
          <div>
            <dt>Couleur</dt>
            <dd>Famille professionnelle.</dd>
          </div>
          <div>
            <dt>Present</dt>
            <dd>Noeud plus opaque.</dd>
          </div>
          <div>
            <dt>Opportunite</dt>
            <dd>Halo jaune.</dd>
          </div>
          <div>
            <dt>Prediction</dt>
            <dd>Halo vert.</dd>
          </div>
          <div>
            <dt>Trajectoire</dt>
            <dd>Jaune = contributeur present, vert clair = pont manquant.</dd>
          </div>
        </dl>
      ) : (
        <dl>
          <div>
            <dt>Noeud</dt>
            <dd>Une profession PCS.</dd>
          </div>
          <div>
            <dt>Couleur</dt>
            <dd>Communaute professionnelle detectee.</dd>
          </div>
          <div>
            <dt>Lien</dt>
            <dd>Proximite revelee forte entre deux PCS.</dd>
          </div>
          <div>
            <dt>Taille</dt>
            <dd>Centralite ou degre pondere lorsqu'il est disponible.</dd>
          </div>
        </dl>
      )}

      {!isTerritorialView && communities.length > 0 && (
        <div className="occupation-communities" aria-label="Communautes visibles">
          {communities.map((community) => (
            <span key={String(community)}>
              <i style={{ backgroundColor: getCommunityColorForLegend(community) }} />
              {labelMap.get(String(community))?.name ||
                labelMap.get(String(community))?.fallback_label ||
                `Communaute ${community}`}
            </span>
          ))}
        </div>
      )}
    </aside>
  );
}
