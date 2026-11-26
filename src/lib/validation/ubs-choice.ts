// An unlisted unit is not an actual UBS or an authorization grant.
export const OTHER_UBS="outra";
export function parseUbsChoice(value:unknown,optional:boolean,allowEmpty=false):string|null|undefined {
 if(typeof value!=="string")return undefined;
 const v=value.trim();
 if(optional&&(v===OTHER_UBS||(allowEmpty&&v==="")))return null;
 return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)?v:undefined;
}
