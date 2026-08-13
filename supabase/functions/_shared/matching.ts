export type Category = 'road'|'bridge'|'building'|'drainage'|'flood-control'|'facility'|'unknown';
export type Coordinates = {latitude:number; longitude:number};
export type Project = {
  id:string; contractId?:string; source:string; sourceUrl:string; name:string; category:Category;
  sourceCategory?:string; componentCategories:string[]; description:string; agency:string;
  contractor?:string; budget?:number; amountPaid?:number; status:string; progress?:number;
  location:string; region?:string; districtOffice?:string; programName?:string;
  infrastructureYear?:string; startDate?:string; completionDate?:string;
  sourceOfFunds?:string; livestreamUrl?:string; hasSatelliteImage:boolean;
  sourceRevision?:string; sourceImportedAt?:string; coordinates:Coordinates;
  lastChecked:string; documents:unknown[];
};

const distanceKm = (a:Coordinates, b:Coordinates) => {
  const radians = Math.PI / 180;
  const x = (b.latitude - a.latitude) * radians;
  const y = (b.longitude - a.longitude) * radians;
  return 6371 * 2 * Math.asin(Math.sqrt(
    Math.sin(x / 2) ** 2 + Math.cos(a.latitude * radians) *
    Math.cos(b.latitude * radians) * Math.sin(y / 2) ** 2,
  ));
};

export function rankProjects(projects:Project[], coordinates:Coordinates, category:Category, clues:string[]) {
  return projects.map(project => {
    const distance = distanceKm(coordinates, project.coordinates);
    const text = [project.contractId, project.name, project.description, project.contractor,
      project.location, project.region, project.districtOffice, project.programName,
      project.sourceCategory, ...project.componentCategories]
      .filter(Boolean).join(' ').toLowerCase();
    const matchingClues = clues.filter(clue => text.includes(clue.toLowerCase()));
    const exactIdentifier = clues.some(clue => project.contractId && clue.trim().toLowerCase() === project.contractId.toLowerCase());
    const confidence = Math.max(0, Math.min(0.99,
      0.68 + matchingClues.length * 0.08 + (exactIdentifier ? 0.35 : 0) - Math.min(distance / 25, 0.5) +
      (project.category === category ? 0.15 : 0),
    ));
    return {project, confidence, evidence: [
      `${distance.toFixed(1)} km from capture`,
      project.category === category ? 'Infrastructure type matches' : 'Nearby official record',
      ...(exactIdentifier ? [`Contract ID matches: ${project.contractId}`] : []),
      ...matchingClues.map(clue => `Visual clue: ${clue}`),
    ]};
  }).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}
