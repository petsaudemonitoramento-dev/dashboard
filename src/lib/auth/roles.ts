export const PROFILE_VALUES = [
  "administrador",
  "gestao_municipal",
  "equipe_ubs",
  "acs",
  "aluno",
] as const;

export type UserProfile = (typeof PROFILE_VALUES)[number];

export const PUBLIC_REQUESTABLE_PROFILES = [
  "equipe_ubs",
  "acs",
  "aluno",
] as const satisfies readonly UserProfile[];

export type PublicRequestableProfile =
  (typeof PUBLIC_REQUESTABLE_PROFILES)[number];

export const MANAGEABLE_PROFILES = PUBLIC_REQUESTABLE_PROFILES;

export const PROFILE_LABELS: Record<UserProfile, string> = {
  administrador: "Administrador técnico",
  gestao_municipal: "Gestão",
  equipe_ubs: "Equipe UBS",
  acs: "ACS",
  aluno: "Aluno",
};

export function isUserProfile(value: string): value is UserProfile {
  return (PROFILE_VALUES as readonly string[]).includes(value);
}

export function isPublicRequestableProfile(
  value: string
): value is PublicRequestableProfile {
  return (PUBLIC_REQUESTABLE_PROFILES as readonly string[]).includes(value);
}

export function profileLabel(value: string): string {
  return isUserProfile(value) ? PROFILE_LABELS[value] : "Perfil inválido";
}
