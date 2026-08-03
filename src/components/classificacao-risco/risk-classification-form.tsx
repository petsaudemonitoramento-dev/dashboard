"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  HeartPulse,
  LoaderCircle,
  Pencil,
  Save,
  Sparkles,
  UserRoundPlus,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  PrefilledFactor,
  RiskFactor,
  RiskPageData,
  RiskSaveResult,
} from "./types";
import styles from "./risk-classification.module.css";

const GROUP_ORDER = ["g1", "g3", "g4", "g5"] as const;
const GROUP_NUMBERS: Record<string, string> = {
  g1: "1",
  g3: "3",
  g4: "4",
  g5: "5",
};

function asNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function trimesterFromWeeks(weeks: number | null): 1 | 2 | 3 {
  if (weeks === null || weeks <= 13) return 1;
  if (weeks <= 27) return 2;
  return 3;
}

function weeksFromDum(value: string): number | null {
  if (!value) return null;
  const start = new Date(`${value}T12:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 604800000));
}

function imcResult(weight: number | null, heightInput: number | null) {
  if (!weight || !heightInput) {
    return { imc: null as number | null, points: 0, label: "Não calculado" };
  }
  const height = heightInput > 3 ? heightInput / 100 : heightInput;
  if (height <= 0) return { imc: null, points: 0, label: "Não calculado" };
  const imc = weight / (height * height);
  if (imc < 18) return { imc, points: 2, label: "Baixo peso (IMC < 18)" };
  if (imc <= 24.9) return { imc, points: 0, label: "Eutrófica (IMC 18–24,9)" };
  if (imc <= 29.9) return { imc, points: 1, label: "Sobrepeso (IMC 25–29,9)" };
  if (imc <= 39.9) return { imc, points: 5, label: "Obesidade grau I/II (IMC 30–39,9)" };
  return { imc, points: 10, label: "Obesidade grau III (IMC ≥ 40)" };
}

function resultFromScore(individual: number, imcPoints: number, clinical: number, imc: number | null) {
  const score = individual + imcPoints + clinical;
  if (score >= 10) {
    if (clinical === 0 && (imc ?? 0) < 40) {
      return {
        score,
        classification: "Médio Risco",
        conduct: "A pontuação elevada decorre apenas de fatores individuais e/ou nutricionais. Manter acompanhamento na APS com atenção diferenciada e avaliação clínica profissional.",
      };
    }
    return {
      score,
      classification: "Alto Risco",
      conduct: "Encaminhar ao pré-natal de alto risco, mantendo vínculo e acompanhamento compartilhado com a APS.",
    };
  }
  if (score >= 5) {
    return {
      score,
      classification: "Médio Risco",
      conduct: "Realizar pré-natal na APS pelo médico intercalado com enfermeiro, com monitoramento pela Rede Cuidar conforme o instrumento.",
    };
  }
  return {
    score,
    classification: "Risco Habitual",
    conduct: "Realizar acompanhamento de pré-natal na APS pelo enfermeiro intercalado com médico, conforme o instrumento.",
  };
}

function SourceIndicator({ item }: { item: PrefilledFactor }) {
  return (
    <details className={styles.sourceDetails}>
      <summary aria-label="Ver origem do preenchimento automático" title="Ver origem">
        <Sparkles size={12} />
      </summary>
      <div className={styles.sourcePopover}>
        <strong>Pré-preenchido automaticamente</strong>
        <span>{item.detalhe}</span>
      </div>
    </details>
  );
}

function FactorTable({
  title,
  number,
  factors,
  trimester,
  selected,
  sources,
  onToggle,
  defaultOpen,
}: {
  title: string;
  number: string;
  factors: RiskFactor[];
  trimester: 1 | 2 | 3;
  selected: Set<string>;
  sources: Map<string, PrefilledFactor>;
  onToggle: (code: string) => void;
  defaultOpen?: boolean;
}) {
  return (
    <details className={styles.groupCard} open={defaultOpen}>
      <summary>
        <span className={styles.groupNumber}>{number}</span>
        <strong>{title}</strong>
        <span>{factors.length} itens</span>
        <ChevronDown size={17} />
      </summary>
      <div className={styles.tableWrap}>
        <div className={`${styles.riskRow} ${styles.riskHeader}`}>
          <span>1º TRI</span><span>2º TRI</span><span>3º TRI</span>
          <span>Condição avaliada</span><span>Escore</span>
        </div>
        {factors.map((factor) => {
          const checked = selected.has(factor.codigo);
          const source = sources.get(factor.codigo);
          return (
            <div className={styles.riskRow} key={factor.codigo}>
              {[1, 2, 3].map((column) => (
                <label
                  className={`${styles.trimesterCell} ${column === trimester ? styles.currentTrimester : ""}`}
                  key={column}
                >
                  <input
                    type="checkbox"
                    checked={checked && column === trimester}
                    disabled={column !== trimester}
                    onChange={() => onToggle(factor.codigo)}
                    aria-label={`${factor.titulo} — ${column}º trimestre`}
                  />
                </label>
              ))}
              <div className={styles.factorTitle}>
                <span>{factor.titulo}</span>
                {source && <SourceIndicator item={source} />}
              </div>
              <strong className={styles.points}>{factor.pontos}</strong>
            </div>
          );
        })}
      </div>
    </details>
  );
}

export function RiskClassificationForm({ data }: { data: RiskPageData }) {
  const initialWeeks = data.patient?.igSemanas ?? null;
  const [trimester, setTrimester] = useState<1 | 2 | 3>(trimesterFromWeeks(initialWeeks));
  const [selected, setSelected] = useState(() => new Set(data.prefilled.map((item) => item.codigo)));
  const [weight, setWeight] = useState(data.patient?.pesoKg?.toString() ?? "");
  const [height, setHeight] = useState(data.patient?.alturaCm?.toString() ?? "");
  const [observation, setObservation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RiskSaveResult | null>(null);

  const [minimalName, setMinimalName] = useState("");
  const [minimalBirth, setMinimalBirth] = useState("");
  const [minimalDum, setMinimalDum] = useState("");
  const [minimalWeeks, setMinimalWeeks] = useState("");
  const [editingUbs, setEditingUbs] = useState(false);
  const [serviceUbsId, setServiceUbsId] = useState(data.patient?.ubsId ?? data.professional.ubsId);
  const [externalUbs, setExternalUbs] = useState("");

  const sources = useMemo(
    () => new Map(data.prefilled.map((item) => [item.codigo, item])),
    [data.prefilled]
  );

  const factorsByGroup = useMemo(() => {
    const map = new Map<string, RiskFactor[]>();
    data.factors.forEach((factor) => {
      map.set(factor.grupo, [...(map.get(factor.grupo) ?? []), factor]);
    });
    return map;
  }, [data.factors]);

  const numericWeight = asNumber(weight);
  const numericHeight = asNumber(height);
  const imc = imcResult(numericWeight, numericHeight);

  const scores = useMemo(() => {
    let individual = 0;
    let clinical = 0;
    for (const factor of data.factors) {
      if (!selected.has(factor.codigo)) continue;
      if (factor.grupo === "g1") individual += factor.pontos;
      else clinical += factor.pontos;
    }
    return { individual, clinical };
  }, [data.factors, selected]);

  const projected = resultFromScore(scores.individual, imc.points, scores.clinical, imc.imc);
  const selectedUbsName = data.ubsOptions.find((ubs) => ubs.id === serviceUbsId)?.nome ?? data.professional.ubsNome;
  const actualWeeks = data.patient?.igSemanas ?? weeksFromDum(minimalDum) ?? asNumber(minimalWeeks);

  function toggleFactor(code: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function handleDum(value: string) {
    setMinimalDum(value);
    const weeks = weeksFromDum(value);
    if (weeks !== null) {
      setMinimalWeeks(String(weeks));
      setTrimester(trimesterFromWeeks(weeks));
    }
  }

  async function saveClassification() {
    setError(null);
    setResult(null);

    if (!data.patient && (!minimalName.trim() || !minimalBirth)) {
      setError("No cadastro mínimo, informe o nome e a data de nascimento.");
      return;
    }

    setLoading(true);
    try {
      const items = [...selected].map((codigo) => {
        const source = sources.get(codigo);
        return {
          codigo,
          origem: source?.origem ?? "manual",
          detalheOrigem: source?.detalhe ?? "Selecionado manualmente pela profissional.",
          automatico: Boolean(source),
        };
      });

      const response = await fetch("/api/classificacao-risco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gestanteId: data.patient?.id ?? null,
          cadastroMinimo: data.patient ? null : {
            nome: minimalName.trim(),
            dataNascimento: minimalBirth,
            dum: minimalDum,
            igSemanas: asNumber(minimalWeeks),
            igDias: 0,
            pesoKg: numericWeight,
            alturaCm: numericHeight,
          },
          trimestre: trimester,
          pesoKg: numericWeight,
          alturaCm: numericHeight,
          ubsAtendimentoId: externalUbs.trim() ? null : serviceUbsId,
          ubsAtendimentoExterna: externalUbs.trim() || null,
          observacao: observation,
          itens: items,
        }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar a classificação.");
      setResult(body);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  const catalogUnavailable = data.factors.length === 0;

  if (catalogUnavailable) {
    return (
      <section className={styles.catalogError} role="alert">
        <AlertTriangle size={26} />
        <div>
          <h2>Instrumento de classificaÃ§Ã£o indisponÃ­vel</h2>
          <p>
            O catÃ¡logo oficial de fatores de risco nÃ£o foi carregado.
            Nenhuma classificaÃ§Ã£o pode ser calculada ou salva atÃ© a
            restauraÃ§Ã£o das configuraÃ§Ãµes clÃ­nicas.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.layout}>
      <main className={styles.mainColumn}>
        <section className={styles.contextCard}>
          <div className={styles.contextIdentity}>
            <div className={styles.contextIcon}>{data.patient ? <HeartPulse size={23} /> : <UserRoundPlus size={23} />}</div>
            <div>
              <span>{data.patient ? "Gestante selecionada" : "Cadastro mínimo para classificação imediata"}</span>
              <h2>{data.patient?.nome ?? "Nova classificação urgente"}</h2>
              {data.patient && <small>{data.patient.codigo} · Microárea {data.patient.microarea ?? "não informada"}</small>}
            </div>
          </div>

          {!data.patient && (
            <div className={styles.minimalGrid}>
              <label><span>Nome da gestante *</span><input value={minimalName} onChange={(e) => setMinimalName(e.target.value)} placeholder="Nome completo" /></label>
              <label><span>Data de nascimento *</span><input type="date" value={minimalBirth} onChange={(e) => setMinimalBirth(e.target.value)} /></label>
              <label><span>DUM</span><input type="date" value={minimalDum} onChange={(e) => handleDum(e.target.value)} /></label>
              <label><span>IG em semanas</span><input type="number" min="0" max="42" value={minimalWeeks} onChange={(e) => { setMinimalWeeks(e.target.value); setTrimester(trimesterFromWeeks(asNumber(e.target.value))); }} /></label>
            </div>
          )}

          <div className={styles.auditStrip}>
            <div><span>Profissional</span><strong>{data.professional.nome}</strong><small>Vinculada à UBS {data.professional.ubsNome}</small></div>
            <div className={styles.serviceUbs}>
              <span>UBS deste atendimento</span>
              <strong>{externalUbs.trim() || selectedUbsName}</strong>
              {!data.patient && (
                <button type="button" onClick={() => setEditingUbs((value) => !value)} aria-label="Editar UBS deste atendimento"><Pencil size={14} /></button>
              )}
            </div>
          </div>

          {editingUbs && !data.patient && (
            <div className={styles.ubsEditor}>
              <label><span>UBS cadastrada</span><select value={serviceUbsId} onChange={(e) => { setServiceUbsId(e.target.value); setExternalUbs(""); }}>
                {data.ubsOptions.map((ubs) => <option value={ubs.id} key={ubs.id}>{ubs.nome}</option>)}
              </select></label>
              <label><span>Ou informar outra UBS</span><input value={externalUbs} onChange={(e) => setExternalUbs(e.target.value)} placeholder="Nome da UBS externa" /></label>
              <small>Isso altera somente a UBS registrada neste atendimento; o vínculo da profissional permanece inalterado.</small>
            </div>
          )}
        </section>

        <section className={styles.measureCard}>
          <div><Calculator size={19} /><span><strong>Avaliação nutricional</strong><small>IMC calculado automaticamente</small></span></div>
          <label><span>Peso atual (kg)</span><input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Ex.: 70,5" /></label>
          <label><span>Altura (cm ou m)</span><input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Ex.: 165" /></label>
          <div className={styles.imcChip}><span>IMC</span><strong>{imc.imc === null ? "—" : imc.imc.toFixed(1)}</strong><small>{imc.label} · {imc.points} ponto{imc.points === 1 ? "" : "s"}</small></div>
        </section>

        <div className={styles.trimesterSelector}>
          <span>Período gestacional avaliado</span>
          <div>{([1, 2, 3] as const).map((value) => <button type="button" className={trimester === value ? styles.trimesterActive : ""} onClick={() => setTrimester(value)} key={value}>{value}º trimestre</button>)}</div>
          <small>{actualWeeks !== null ? `Idade gestacional de referência: ${actualWeeks} semanas.` : "Informe a DUM ou a idade gestacional quando necessário."}</small>
        </div>

        {data.prefilled.length > 0 && (
          <details className={styles.prefillSummary}>
            <summary><Sparkles size={15} /><strong>{data.prefilled.length} itens pré-preenchidos</strong><span>Clique para conferir</span></summary>
            <div>{data.prefilled.map((item) => <p key={item.codigo}><strong>{data.factors.find((factor) => factor.codigo === item.codigo)?.titulo ?? item.codigo}</strong><span>{item.detalhe}</span></p>)}</div>
          </details>
        )}

        {GROUP_ORDER.map((group, index) => {
          const groupFactors = factorsByGroup.get(group) ?? [];
          if (!groupFactors.length) return null;
          return <FactorTable title={groupFactors[0].grupoTitulo} number={GROUP_NUMBERS[group]} factors={groupFactors} trimester={trimester} selected={selected} sources={sources} onToggle={toggleFactor} defaultOpen={index === 0} key={group} />;
        })}

        <label className={styles.observationField}>
          <span>Observações da classificação</span>
          <textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={3} placeholder="Registre somente informações relevantes para esta avaliação." />
        </label>

        {error && <div className={styles.errorBox}><AlertTriangle size={18} />{error}</div>}

        <div className={styles.mobileSave}>
          <button type="button" onClick={saveClassification} disabled={loading}>{loading ? <LoaderCircle className={styles.spin} size={18} /> : <Save size={18} />}Salvar classificação</button>
        </div>
      </main>

      <aside className={styles.scoreColumn}>
        <section className={styles.scoreCard}>
          <span className={styles.version}>Outubro de 2024</span>
          <h2>Escore atual</h2>
          <div className={styles.scoreNumber}>{projected.score}</div>
          <strong className={`${styles.classification} ${projected.classification.includes("Alto") ? styles.high : projected.classification.includes("Médio") ? styles.medium : styles.habitual}`}>{projected.classification}</strong>
          <dl>
            <div><dt>Características individuais</dt><dd>{scores.individual}</dd></div>
            <div><dt>Avaliação nutricional</dt><dd>{imc.points}</dd></div>
            <div><dt>Fatores clínicos</dt><dd>{scores.clinical}</dd></div>
          </dl>
          <p>{projected.conduct}</p>
          <button type="button" className={styles.saveButton} onClick={saveClassification} disabled={loading}>{loading ? <LoaderCircle className={styles.spin} size={18} /> : <Save size={18} />}Salvar e finalizar</button>
          <small>O cálculo é apoio ao instrumento e deve ser confirmado pela profissional.</small>
        </section>

        {result && (
          <section className={styles.resultCard}>
            <CheckCircle2 size={25} />
            <div><h3>Classificação salva</h3><p>{result.classificacao} · {result.score} pontos</p></div>
            <a href={`/api/classificacao-risco/${result.classificacaoId}/pdf?modo=color`}><FileText size={16} />PDF colorido<Download size={14} /></a>
            <a href={`/api/classificacao-risco/${result.classificacaoId}/pdf?modo=pb`}><FileText size={16} />PDF preto e branco<Download size={14} /></a>
            <Link href={`/dashboard/cadastro-clinico?gestante=${result.gestanteId}`}>Complementar cadastro clínico</Link>
          </section>
        )}
      </aside>
    </div>
  );
}
