/* Icone del gioco (bundle icons_2d, vedi assets/icons/README.md) per le voci
   che compaiono in piu' pagine: categorie di ricerca, bonus delle org,
   rendite. Un solo posto, cosi' la stessa voce ha la stessa icona ovunque. */

/** Categoria di ricerca, come nella lista del gioco (TIGenericTechTemplate.categoryIcon).
 *  «Information» e' la vecchia chiave che due org usano ancora. */
export const CATEGORY_ICON: Record<string, string> = {
  Energy: "tech_energy_icon", InformationScience: "tech_info_icon", Information: "tech_info_icon",
  LifeScience: "tech_life_icon", Materials: "tech_material_icon",
  MilitaryScience: "tech_military_icon", SocialScience: "tech_social_icon",
  SpaceScience: "tech_space_icon", Xenology: "tech_xeno_icon",
};

/** Bonus delle org alle priorita' nazionali e allo spazio (campi di TIOrgState).
 *  L'estrazione non ha un'icona fra quelle estratte: resta solo il nome. */
export const ORG_BONUS_ICON: Record<string, string | null> = {
  economyBonus: "ICO_economy_priority", welfareBonus: "ICO_welfare_priority",
  environmentBonus: "ICO_environment_priority", knowledgeBonus: "ICO_knowledge_priority",
  governmentBonus: "ICO_government_priority", unityBonus: "ICO_unity_priority",
  oppressionBonus: "ICO_oppression_priority", militaryBonus: "ICO_military_priority",
  spoilsBonus: "ICO_spoils_priority", spaceDevBonus: "ICO_funding_priority",
  spaceflightBonus: "ICO_launchFacilities_Priority", MCBonus: "ICO_missionControl_priority",
  miningBonus: null,
};

/** Rendite mensili (e posti progetto) delle org. */
export const INCOME_ICON: Record<string, string> = {
  money: "ICO_currency", influence: "ICO_influence", ops: "ICO_ops", research: "ICO_research",
  boost: "ICO_boost", missionControl: "ICO_mission_control", projects: "ICO_projects",
};
