// Display preferences only. Never use user metadata for authorization.
export type GestarioPreferences={start:"inicio"|"agenda"|"gestantes";showExams:boolean;showVisits:boolean};
export function parseGestarioPreferences(value:unknown):GestarioPreferences {
 const x=value&&typeof value==="object"?value as Record<string,unknown>:{};
 return {start:x.start==="agenda"||x.start==="gestantes"?x.start:"inicio",showExams:x.showExams!==false,showVisits:x.showVisits!==false};
}
export function preferredPath(value:unknown){const p=parseGestarioPreferences(value);return p.start==="agenda"?"/dashboard/atendimentos":p.start==="gestantes"?"/dashboard/gestantes":"/dashboard";}
export function filterNoticeReasons(reasons:string[],p:GestarioPreferences){return reasons.filter(r=>r.startsWith("Risco registrado:")||(!r.includes("documental(is) de exames")||p.showExams)&&(!r.startsWith("Última visita registrada")||p.showVisits));}
