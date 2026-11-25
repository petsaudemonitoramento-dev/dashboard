"use client";
import { useState } from "react";

const EXAMPLES = [
  { name: "Gestante fictícia A", weeks: "24 semanas", risk: "Habitual", consultations: 4 },
  { name: "Gestante fictícia B", weeks: "31 semanas", risk: "Alto", consultations: 6 },
  { name: "Gestante fictícia C", weeks: "12 semanas", risk: "Habitual", consultations: 2 },
];
const TABS = ["Início", "Importar PEC", "Minhas gestantes", "Agenda", "Perfil"] as const;
type Tab = typeof TABS[number];

export function DemoWorkspace() {
  const [tab, setTab] = useState<Tab>("Início");
  const [imported, setImported] = useState(false);
  const [completed, setCompleted] = useState(false);
  return <div>
    <nav aria-label="Páginas da demonstração" style={{display:"flex", flexWrap:"wrap", gap:8, margin:"16px 0"}}>
      {TABS.map(t => <button key={t} type="button" className={tab === t ? "v20-primary-button" : "v20-secondary-button"} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
    </nav>
    <section aria-label={tab} aria-live="polite" style={{padding:16, border:"1px solid #c9c1d8", borderRadius:12}}>
      <h2>{tab}</h2>
      {tab === "Início" && <><p>{imported ? 3 : 0} gestantes fictícias no espaço de trabalho.</p><p>{imported ? "1 gestante fictícia com classificação de alto risco." : "Importe o exemplo para iniciar."}</p><button type="button" className="v20-primary-button" onClick={() => setTab("Importar PEC")}>Experimentar importação</button></>}
      {tab === "Importar PEC" && <><p>Simule uma importação com um lote fixo de três fichas fictícias. Nenhum arquivo externo é aceito.</p><button type="button" className="v20-primary-button" onClick={() => setImported(true)}>Carregar exemplo fictício</button>{imported && <p role="status">Exemplo carregado. Consulte Minhas gestantes.</p>}</>}
      {tab === "Minhas gestantes" && (imported ? <ul>{EXAMPLES.map(g => <li key={g.name}><strong>{g.name}</strong> · {g.weeks} · risco {g.risk.toLowerCase()} · {g.consultations} consultas</li>)}</ul> : <p>Nenhuma ficha fictícia importada.</p>)}
      {tab === "Agenda" && <>{imported ? <label><input type="checkbox" checked={completed} onChange={e => setCompleted(e.target.checked)} /> Consulta fictícia de acompanhamento {completed ? "(concluída)" : "(pendente)"}</label> : <p>Importe o exemplo para simular a agenda.</p>}</>}
      {tab === "Perfil" && <><p>Conta individual · demonstração</p><p>Sem acesso a prontuários reais ou dados de outras contas.</p><button type="button" className="v20-secondary-button" onClick={() => {setImported(false);setCompleted(false);setTab("Início");}}>Reiniciar exemplo</button></>}
    </section>
  </div>;
}
