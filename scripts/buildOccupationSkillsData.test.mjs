import { describe, expect, it } from 'vitest';
import { buildSkillsByPcs, parseCsvRecords } from './buildOccupationSkillsData.mjs';

describe('buildOccupationSkillsData', () => {
  it('parses quoted skill lists and aggregates them by PCS', () => {
    const csv = [
      'pcs_code,pcs_label,code_rome,libelle_rome,bridge_method,bridge_is_conservative,competences,savoirs,source_pcs2020_labels,pcs2020_codes,pcs2003_codes,fap_codes,fap_labels,n_exact_paths,n_source_pcs2020_labels',
      '526D,Aides medico-psychologiques,K1301,Accompagnement,exact,true,"Accompagner une personne | Faire preuve de rigueur","Techniques de relation d aide",Aide medico psychologique,52C5,526D,V0Z80,Soins,1,1',
      '526D,Aides medico-psychologiques,K1302,Assistance,"exact",true,"Faire preuve de rigueur | Observer une personne","",Assistant medico social,52C5,526D,V0Z80,Soins,1,1'
    ].join('\n');

    const profiles = buildSkillsByPcs(parseCsvRecords(csv));

    expect(Object.keys(profiles)).toEqual(['526D']);
    expect(profiles['526D']).toMatchObject({
      pcs_code: '526D',
      rome_count: 2,
      competence_count: 3,
      savoir_count: 1,
      bridge_is_conservative: true
    });
    expect(profiles['526D'].competences).toEqual([
      'Accompagner une personne',
      'Faire preuve de rigueur',
      'Observer une personne'
    ]);
    expect(profiles['526D'].rome_links[0]).toMatchObject({
      code_rome: 'K1301',
      competences: ['Accompagner une personne', 'Faire preuve de rigueur']
    });
  });
});
