export const PASSWORD_MIN_LENGTH=8;
export const PASSWORD_MAX_LENGTH=128;
export const PASSWORD_REQUIREMENTS="A senha deve ter de 8 a 128 caracteres, com letras e números.";
export function isValidNewPassword(value:string):boolean {
 return value.length>=PASSWORD_MIN_LENGTH && value.length<=PASSWORD_MAX_LENGTH && /[A-Za-z]/.test(value) && /\d/.test(value);
}
