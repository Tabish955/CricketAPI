import {readFileSync} from 'node:fs';
export const logoCandidates=JSON.parse(readFileSync(new URL('./logo-candidates.json',import.meta.url),'utf8'));
const key=(id,name)=>`${id}:${String(name||'').trim().toLowerCase()}`;
let registry=new Map(logoCandidates.map(r=>[key(r.id,r.name),r]));
export function applyLogoCandidates(entries) {registry=new Map(entries.map(r=>[key(r.id,r.name),r]));}
export function candidateLogo(team) {return registry.get(key(team.id,team.name))?.url ?? null;}
