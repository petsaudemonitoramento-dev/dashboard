import { PROFESSIONS } from "@/lib/validation/demo-onboarding";
export function ProfessionField({ initial = "" }: { initial?: string }) {
  return <div className="v20-field">
    <label htmlFor="profissao">Profissão</label>
    <select id="profissao" name="profissao" defaultValue={initial} required>
      <option value="" disabled>Selecione sua profissão</option>
      {PROFESSIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  </div>;
}
