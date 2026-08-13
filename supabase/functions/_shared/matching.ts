export type Category = 'road'|'bridge'|'building'|'drainage'|'flood-control'|'facility'|'unknown';
export type Coordinates = {latitude:number; longitude:number};
export type Project = {
  id:string; source:string; sourceUrl:string; name:string; category:Category;
  description:string; agency:string; contractor?:string; budget?:number;
  status:string; progress?:number; location:string; coordinates:Coordinates;
  lastChecked:string; documents:string[];
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
    const text = `${project.name} ${project.description}`.toLowerCase();
    const matchingClues = clues.filter(clue => text.includes(clue.toLowerCase()));
    const confidence = Math.max(0, Math.min(0.99,
      0.68 + matchingClues.length * 0.08 - Math.min(distance / 25, 0.5) +
      (project.category === category ? 0.15 : 0),
    ));
    return {project, confidence, evidence: [
      `${distance.toFixed(1)} km from capture`,
      project.category === category ? 'Infrastructure type matches' : 'Nearby official record',
      ...matchingClues.map(clue => `Visual clue: ${clue}`),
    ]};
  }).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}
