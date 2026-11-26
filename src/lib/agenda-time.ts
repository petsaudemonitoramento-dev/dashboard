export function validAgendaTime(value:unknown):value is string|null {
 return value===null||(typeof value==="string"&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value));
}
export function agendaTimeLabel(value:string|null|undefined){return typeof value==="string"&&/^([01][0-9]|2[0-3]):[0-5][0-9]/.test(value)?value.slice(0,5):null;}
