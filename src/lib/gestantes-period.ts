// Period means the last recorded prenatal consultation, never the import date.
export function consultationPeriod(value:string|null):string|null{
  if(!value||!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value))return null;
  const d=new Date(value+"T12:00:00Z");
  return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value?null:value.slice(0,7);
}
export function periodLabel(period:string):string{
  if(period==="sem-data")return "Sem consulta registrada";
  return new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(period+"-01T12:00:00Z"));
}
