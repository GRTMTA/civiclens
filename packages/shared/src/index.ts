export type InfrastructureCategory = 'road'|'bridge'|'building'|'drainage'|'flood-control'|'facility'|'unknown';
export interface Coordinates { latitude:number; longitude:number; }
export interface Project { id:string; source:string; sourceUrl:string; name:string; category:InfrastructureCategory; description:string; agency:string; contractor?:string; budget?:number; status:string; progress?:number; startDate?:string; completionDate?:string; location:string; coordinates:Coordinates; lastChecked:string; documents:string[]; }
export interface Match { project:Project; confidence:number; evidence:string[]; }
export interface ScanResult { status:'matched'|'needs_retake'; analysis?:{category:InfrastructureCategory; clues:string[]; identifiers:string[]; confidence:number}; matches?:Match[]; }
export interface Report { id:string; projectId:string; authorName:string; category:string; note:string; photoUrl?:string; coordinates:Coordinates; status:'unverified'|'resolved'|'hidden'; createdAt:string; }
