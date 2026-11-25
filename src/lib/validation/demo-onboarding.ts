// Declared profession is descriptive only; never use it for authorization.
export const PROFESSIONS = [
  ["enfermeiro", "Enfermagem"], ["medico", "Medicina"],
  ["tecnico_enfermagem", "Técnico(a) de enfermagem"], ["acs", "Agente comunitário de saúde"],
  ["dentista", "Odontologia"], ["farmaceutico", "Farmácia"],
  ["nutricionista", "Nutrição"], ["fisioterapeuta", "Fisioterapia"],
  ["psicologo", "Psicologia"], ["estudante", "Estudante"], ["outro", "Outra profissão"],
] as const;
export const DEMO_NOTICE_VERSION = "demo-v1";
export const DEMO_NOTICE = "O ambiente de demonstração usa somente dados fictícios. Não insira dados de pacientes. O Gestário APS é complementar ao prontuário oficial. A utilização de dados reais exige autorização institucional adequada.";
export function isDeclaredProfession(value: string) {
  return PROFESSIONS.some(([id]) => id === value);
}
