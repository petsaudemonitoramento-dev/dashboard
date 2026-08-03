"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Baby,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  FileHeart,
  HeartPulse,
  LoaderCircle,
  MapPin,
  Plus,
  Save,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  ClinicalPageData,
  ClinicalRecord,
  ConsultationItem,
  ExamItem,
  VaccineItem,
} from "./types";
import styles from "./clinical-form.module.css";

type TabId =
  | "identificacao"
  | "gestacao"
  | "consultas"
  | "exames"
  | "vacinas"
  | "alta";

const tabs: Array<{
  id: TabId;
  label: string;
  icon: typeof UserRound;
}> = [
  { id: "identificacao", label: "Identificação", icon: UserRound },
  { id: "gestacao", label: "Gestação", icon: Baby },
  { id: "consultas", label: "Consultas", icon: CalendarDays },
  { id: "exames", label: "Exames", icon: FileHeart },
  { id: "vacinas", label: "Vacinas", icon: Syringe },
  { id: "alta", label: "Alta", icon: ShieldCheck },
];

const examStatuses = [
  ["nao_informado", "Não informado"],
  ["pendente", "Pendente"],
  ["solicitado", "Solicitado"],
  ["realizado", "Realizado"],
  ["resultado_alterado", "Resultado alterado"],
  ["nao_se_aplica", "Não se aplica"],
] as const;

const vaccineStatuses = [
  ["nao_informado", "Não informado"],
  ["pendente", "Pendente"],
  ["agendada", "Agendada"],
  ["realizada", "Realizada"],
  ["nao_se_aplica", "Não se aplica"],
] as const;

function dateValue(value: unknown): string {
  if (!value) {
    return "";
  }

  return String(value).slice(0, 10);
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRecord(
  data: ClinicalPageData
): ClinicalRecord {
  const base = structuredClone(data.record);

  base.identificacao.dataNascimento = dateValue(
    base.identificacao.dataNascimento
  );
  base.identificacao.vigenciaBolsaFamilia = dateValue(
    base.identificacao.vigenciaBolsaFamilia
  );

  base.gestacao.inicioPreNatal = dateValue(
    base.gestacao.inicioPreNatal
  );
  base.gestacao.dum = dateValue(base.gestacao.dum);
  base.gestacao.dpp = dateValue(base.gestacao.dpp);
  base.gestacao.dataParto = dateValue(base.gestacao.dataParto);
  base.gestacao.dataUltimaPressao = dateValue(
    base.gestacao.dataUltimaPressao
  );
  base.gestacao.dataUltimoPesoAltura = dateValue(
    base.gestacao.dataUltimoPesoAltura
  );
  base.gestacao.igSemanas = numberValue(
    base.gestacao.igSemanas
  );
  base.gestacao.igDias = numberValue(base.gestacao.igDias);
  base.gestacao.igEcografiaSemanas = numberValue(
    base.gestacao.igEcografiaSemanas
  );
  base.gestacao.igEcografiaDias = numberValue(
    base.gestacao.igEcografiaDias
  );
  base.gestacao.dppEcografia = dateValue(
    base.gestacao.dppEcografia
  );
  base.gestacao.pesoKg = numberValue(base.gestacao.pesoKg);
  base.gestacao.alturaCm = numberValue(base.gestacao.alturaCm);

  base.acompanhamento.ultimaConsultaPreNatal = dateValue(
    base.acompanhamento.ultimaConsultaPreNatal
  );
  base.acompanhamento.ultimaConsultaPuerperio = dateValue(
    base.acompanhamento.ultimaConsultaPuerperio
  );

  base.consultas = (base.consultas ?? []).map((item) => ({
    ...item,
    data: dateValue(item.data),
    observacao: item.observacao ?? "",
  }));

  const currentExamMap = new Map(
    (base.exames ?? []).map((item) => [
      `${item.codigo}:${item.trimestre}`,
      item,
    ])
  );

  const configuredExams: ExamItem[] =
    data.examConfigs.map((config) => {
      const existing = currentExamMap.get(
        `${config.codigo}:${config.trimestre}`
      );

      return {
        id: existing?.id,
        codigo: config.codigo,
        nome: config.nome,
        trimestre: config.trimestre,
        status: existing?.status ?? "nao_informado",
        dataSolicitacao: dateValue(existing?.dataSolicitacao),
        dataRealizacao: dateValue(existing?.dataRealizacao),
        resultado: existing?.resultado ?? "",
        observacao: existing?.observacao ?? "",
        origem: existing?.origem,
      };
    });

  const knownExamKeys = new Set(
    configuredExams.map(
      (item) => `${item.codigo}:${item.trimestre}`
    )
  );

  base.exames = [
    ...configuredExams,
    ...(base.exames ?? [])
      .filter(
        (item) =>
          !knownExamKeys.has(
            `${item.codigo}:${item.trimestre}`
          )
      )
      .map((item) => ({
        ...item,
        dataSolicitacao: dateValue(item.dataSolicitacao),
        dataRealizacao: dateValue(item.dataRealizacao),
      })),
  ];

  const currentVaccineMap = new Map(
    (base.vacinas ?? []).map((item) => [item.codigo, item])
  );

  const configuredVaccines: VaccineItem[] =
    data.vaccineConfigs.map((config) => {
      const existing = currentVaccineMap.get(config.codigo);

      return {
        id: existing?.id,
        codigo: config.codigo,
        nome: config.nome,
        status: existing?.status ?? "nao_informado",
        dose:
          existing?.dose ??
          (config.codigo === "dtpa" ||
          config.codigo === "vvsr"
            ? "dose_gestacao_atual"
            : "conforme_historico"),
        dataAplicacao: dateValue(existing?.dataAplicacao),
        lote: existing?.lote ?? "",
        unidadeAplicadora:
          existing?.unidadeAplicadora ?? "",
        observacao: existing?.observacao ?? "",
        origem: existing?.origem,
      };
    });

  const knownVaccineCodes = new Set(
    configuredVaccines.map((item) => item.codigo)
  );

  base.vacinas = [
    ...configuredVaccines,
    ...(base.vacinas ?? []).filter(
      (item) => !knownVaccineCodes.has(item.codigo)
    ),
  ].map((item) => ({
    ...item,
    dataAplicacao: dateValue(item.dataAplicacao),
  }));

  base.alta.data = dateValue(base.alta.data);

  return base;
}

function parseLocalDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T12:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toInputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateAge(value: string): number | null {
  const birth = parseLocalDate(value);

  if (!birth) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();

  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() &&
      today.getDate() < birth.getDate());

  if (beforeBirthday) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function calculatePregnancy(dumValue: string): {
  weeks: number | null;
  days: number | null;
  dpp: string;
} {
  const dum = parseLocalDate(dumValue);

  if (!dum) {
    return { weeks: null, days: null, dpp: "" };
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const totalDays = Math.max(
    0,
    Math.floor(
      (today.getTime() - dum.getTime()) /
        (1000 * 60 * 60 * 24)
    )
  );

  const dpp = new Date(dum);
  dpp.setDate(dpp.getDate() + 280);

  return {
    weeks: Math.floor(totalDays / 7),
    days: totalDays % 7,
    dpp: toInputDate(dpp),
  };
}

function trimesterFromWeeks(weeks: number | null): 1 | 2 | 3 {
  if (weeks === null || weeks <= 13) {
    return 1;
  }

  if (weeks <= 27) {
    return 2;
  }

  return 3;
}

function calculateImc(
  weight: number | null,
  heightCm: number | null
): number | null {
  if (!weight || !heightCm) {
    return null;
  }

  const heightM = heightCm > 3 ? heightCm / 100 : heightCm;

  if (heightM <= 0) {
    return null;
  }

  return weight / (heightM * heightM);
}

function imcLabel(value: number | null): string {
  if (value === null) {
    return "Não calculado";
  }

  if (value < 18) {
    return "Baixo peso";
  }

  if (value <= 24.9) {
    return "Eutrófica";
  }

  if (value <= 29.9) {
    return "Sobrepeso";
  }

  if (value <= 39.9) {
    return "Obesidade grau I/II";
  }

  return "Obesidade grave";
}

function isExamDone(status: ExamItem["status"]): boolean {
  return status === "realizado" || status === "nao_se_aplica";
}

function isVaccineDone(
  status: VaccineItem["status"]
): boolean {
  return status === "realizada" || status === "nao_se_aplica";
}

function Field({
  label,
  children,
  helper,
  required,
}: {
  label: string;
  children: ReactNode;
  helper?: string;
  required?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {children}
      {helper && <small>{helper}</small>}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      min={min}
      step={step}
      value={value ?? ""}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next === "" ? null : Number(next));
      }}
    />
  );
}

export function ClinicalForm({
  data,
}: {
  data: ClinicalPageData;
}) {
  const router = useRouter();
  const [record, setRecord] = useState<ClinicalRecord>(
    () => normalizeRecord(data)
  );
  const [activeTab, setActiveTab] =
    useState<TabId>("identificacao");
  const [examTrimester, setExamTrimester] =
    useState<1 | 2 | 3>(1);
  const [consultationDraft, setConsultationDraft] =
    useState<ConsultationItem>({
      data: toInputDate(new Date()),
      tipo: "pre_natal",
      observacao: "",
    });
  const [showAlerts, setShowAlerts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
    existingId?: string;
  } | null>(null);

  const age = useMemo(
    () =>
      calculateAge(record.identificacao.dataNascimento),
    [record.identificacao.dataNascimento]
  );

  const calculatedPregnancy = useMemo(
    () => calculatePregnancy(record.gestacao.dum),
    [record.gestacao.dum]
  );

  const currentWeeks =
    calculatedPregnancy.weeks ??
    record.gestacao.igSemanas;

  const currentDays =
    calculatedPregnancy.days ?? record.gestacao.igDias;

  const currentTrimester =
    trimesterFromWeeks(currentWeeks);

  const imc = useMemo(
    () =>
      calculateImc(
        record.gestacao.pesoKg,
        record.gestacao.alturaCm
      ),
    [record.gestacao.alturaCm, record.gestacao.pesoKg]
  );

  useEffect(() => {
    if (!record.gestacao.dum) {
      return;
    }

    const calculated = calculatePregnancy(
      record.gestacao.dum
    );

    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza os campos derivados da DUM
    setRecord((current) => ({
      ...current,
      gestacao: {
        ...current.gestacao,
        dpp: calculated.dpp,
        igSemanas: calculated.weeks,
        igDias: calculated.days,
      },
    }));
  }, [record.gestacao.dum]);

  const pendingExams = useMemo(() => {
    const examMap = new Map(
      record.exames.map((item) => [
        `${item.codigo}:${item.trimestre}`,
        item,
      ])
    );

    return data.examConfigs.filter((config) => {
      const item = examMap.get(
        `${config.codigo}:${config.trimestre}`
      );

      if (item && isExamDone(item.status)) {
        return false;
      }

      // Itens condicionais não geram alerta automático sem
      // confirmação clínica; continuam visíveis no trimestre.
      if (config.condicaoAplicacao) {
        return item?.status === "pendente";
      }

      if (
        config.semanaInicio !== null &&
        currentWeeks !== null &&
        currentWeeks < config.semanaInicio
      ) {
        return false;
      }

      return config.trimestre <= currentTrimester;
    });
  }, [
    currentTrimester,
    currentWeeks,
    data.examConfigs,
    record.exames,
  ]);

  const pendingVaccines = useMemo(() => {
    const vaccineMap = new Map(
      record.vacinas.map((item) => [item.codigo, item])
    );

    return data.vaccineConfigs.filter((config) => {
      const item = vaccineMap.get(config.codigo);

      if (item && isVaccineDone(item.status)) {
        return false;
      }

      if (config.semanaInicio === null) {
        return item?.status === "pendente";
      }

      return (
        currentWeeks !== null &&
        currentWeeks >= config.semanaInicio
      );
    });
  }, [
    currentWeeks,
    data.vaccineConfigs,
    record.vacinas,
  ]);

  const totalPending =
    pendingExams.length + pendingVaccines.length;

  function updateIdentification<
    K extends keyof ClinicalRecord["identificacao"],
  >(
    key: K,
    value: ClinicalRecord["identificacao"][K]
  ) {
    setRecord((current) => ({
      ...current,
      identificacao: {
        ...current.identificacao,
        [key]: value,
      },
    }));
  }

  function updateGestation<
    K extends keyof ClinicalRecord["gestacao"],
  >(
    key: K,
    value: ClinicalRecord["gestacao"][K]
  ) {
    setRecord((current) => ({
      ...current,
      gestacao: {
        ...current.gestacao,
        [key]: value,
      },
    }));
  }

  function updateFollowUp<
    K extends keyof ClinicalRecord["acompanhamento"],
  >(
    key: K,
    value: ClinicalRecord["acompanhamento"][K]
  ) {
    setRecord((current) => ({
      ...current,
      acompanhamento: {
        ...current.acompanhamento,
        [key]: value,
      },
    }));
  }

  function updateExam(
    codigo: string,
    trimestre: number,
    patch: Partial<ExamItem>
  ) {
    setRecord((current) => ({
      ...current,
      exames: current.exames.map((item) =>
        item.codigo === codigo &&
        item.trimestre === trimestre
          ? { ...item, ...patch }
          : item
      ),
    }));
  }

  function updateVaccine(
    codigo: string,
    patch: Partial<VaccineItem>
  ) {
    setRecord((current) => ({
      ...current,
      vacinas: current.vacinas.map((item) =>
        item.codigo === codigo
          ? { ...item, ...patch }
          : item
      ),
    }));
  }

  function addConsultation() {
    if (!consultationDraft.data) {
      setMessage({
        tone: "error",
        text: "Informe a data da consulta.",
      });
      return;
    }

    setRecord((current) => ({
      ...current,
      consultas: [
        ...current.consultas,
        {
          ...consultationDraft,
          id: crypto.randomUUID(),
          origem: "manual",
        },
      ].sort((a, b) => a.data.localeCompare(b.data)),
    }));

    setConsultationDraft({
      data: toInputDate(new Date()),
      tipo: "pre_natal",
      observacao: "",
    });
    setMessage(null);
  }

  function removeConsultation(id: string | undefined) {
    setRecord((current) => ({
      ...current,
      consultas: current.consultas.filter(
        (item) => item.id !== id
      ),
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage(null);

    if (!record.identificacao.nome.trim()) {
      setActiveTab("identificacao");
      setMessage({
        tone: "error",
        text: "Preencha o nome da gestante.",
      });
      return;
    }

    if (!record.identificacao.dataNascimento) {
      setActiveTab("identificacao");
      setMessage({
        tone: "error",
        text: "Preencha a data de nascimento.",
      });
      return;
    }

    if (!record.microareaId) {
      setActiveTab("identificacao");
      setMessage({
        tone: "error",
        text: "Selecione a microárea.",
      });
      return;
    }

    if (
      record.alta.ativa &&
      (!record.alta.data || !record.alta.motivo)
    ) {
      setActiveTab("alta");
      setMessage({
        tone: "error",
        text:
          "Para registrar alta, informe a data e o motivo.",
      });
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        "/api/gestantes/clinico",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...record,
            gestacao: {
              ...record.gestacao,
              igSemanas: currentWeeks,
              igDias: currentDays,
              dpp:
                calculatedPregnancy.dpp ||
                record.gestacao.dpp,
            },
          }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        setMessage({
          tone: "error",
          text:
            body.error ??
            "Não foi possível salvar o cadastro.",
          existingId: body.existingId,
        });
        return;
      }

      setMessage({
        tone: "success",
        text: record.id
          ? "Acompanhamento atualizado com sucesso."
          : "Gestante cadastrada com sucesso.",
      });

      setTimeout(() => {
        router.push("/dashboard/gestantes");
        router.refresh();
      }, 650);
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o cadastro.",
      });
    } finally {
      setSaving(false);
    }
  }

  const examsInTab = record.exames.filter(
    (item) => item.trimestre === examTrimester
  );

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
    >
      <section className={styles.contextBar}>
        <div>
          <span className={styles.contextIcon}>
            <Stethoscope size={20} />
          </span>
          <p>
            <strong>{data.professional.nome}</strong>
            <small>
              Profissional vinculada à{" "}
              {data.professional.ubsNome ??
                "UBS não informada"}
            </small>
          </p>
        </div>

        <div className={styles.contextUbs}>
          <MapPin size={17} />
          <span>
            UBS do acompanhamento
            <strong>{record.ubsNome}</strong>
          </span>
        </div>

        {record.codigo && (
          <span className={styles.recordCode}>
            {record.codigo}
          </span>
        )}
      </section>

      <section className={styles.summaryGrid}>
        <article>
          <UserRound size={18} />
          <span>
            Idade
            <strong>
              {age === null ? "Não calculada" : `${age} anos`}
            </strong>
          </span>
        </article>

        <article>
          <CalendarDays size={18} />
          <span>
            Idade gestacional
            <strong>
              {currentWeeks === null
                ? "Não calculada"
                : `${currentWeeks}s ${currentDays ?? 0}d`}
            </strong>
          </span>
        </article>

        <article>
          <Activity size={18} />
          <span>
            IMC
            <strong>
              {imc === null ? "Não calculado" : imc.toFixed(1)}
            </strong>
            <small>{imcLabel(imc)}</small>
          </span>
        </article>

        <button
          type="button"
          className={`${styles.pendingSummary} ${
            totalPending > 0 ? styles.hasPending : ""
          }`}
          onClick={() => setShowAlerts((current) => !current)}
          aria-expanded={showAlerts}
        >
          <AlertCircle size={18} />
          <span>
            Pendências sugeridas
            <strong>{totalPending}</strong>
            <small>Clique para conferir</small>
          </span>
          <ChevronDown size={17} />
        </button>
      </section>

      {showAlerts && (
        <section className={styles.alertPanel}>
          <div>
            <strong>Exames</strong>
            {pendingExams.length === 0 ? (
              <span>Nenhuma pendência automática.</span>
            ) : (
              <ul>
                {pendingExams.map((item) => (
                  <li key={item.codigo}>{item.nome}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <strong>Vacinas</strong>
            {pendingVaccines.length === 0 ? (
              <span>Nenhuma pendência automática.</span>
            ) : (
              <ul>
                {pendingVaccines.map((item) => (
                  <li key={item.codigo}>{item.nome}</li>
                ))}
              </ul>
            )}
          </div>

          <p>
            Os alertas auxiliam o acompanhamento e devem ser
            confirmados pela profissional conforme histórico,
            indicação clínica e protocolo vigente.
          </p>
        </section>
      )}

      <nav
        className={styles.tabs}
        aria-label="Etapas do cadastro clínico"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={activeTab === id ? styles.activeTab : ""}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={17} />
            {label}
            {id === "exames" && pendingExams.length > 0 && (
              <i>{pendingExams.length}</i>
            )}
            {id === "vacinas" &&
              pendingVaccines.length > 0 && (
                <i>{pendingVaccines.length}</i>
              )}
          </button>
        ))}
      </nav>

      <div className={styles.formCard}>
        {activeTab === "identificacao" && (
          <section>
            <div className={styles.sectionHeading}>
              <div>
                <UserRound size={21} />
                <span>
                  <h2>Identificação e território</h2>
                  <p>
                    Dados usados no atendimento assistencial.
                    Identificadores permanecem criptografados.
                  </p>
                </span>
              </div>
            </div>

            <div className={styles.fieldGrid}>
              <Field label="Nome completo" required>
                <input
                  type="text"
                  value={record.identificacao.nome}
                  onChange={(event) =>
                    updateIdentification(
                      "nome",
                      event.target.value
                    )
                  }
                />
              </Field>

              <Field label="Data de nascimento" required>
                <input
                  type="date"
                  min="1930-01-01"
                  max={toInputDate(new Date())}
                  value={
                    record.identificacao.dataNascimento
                  }
                  onChange={(event) =>
                    updateIdentification(
                      "dataNascimento",
                      event.target.value
                    )
                  }
                />
              </Field>

              <Field label="Microárea" required>
                <select
                  value={record.microareaId}
                  onChange={(event) =>
                    setRecord((current) => ({
                      ...current,
                      microareaId: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    Selecione a microárea
                  </option>
                  {data.microareas.map((item) => (
                    <option value={item.id} key={item.id}>
                      Microárea {item.codigo}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Sexo">
                <select
                  value={record.identificacao.sexo}
                  onChange={(event) =>
                    updateIdentification(
                      "sexo",
                      event.target.value
                    )
                  }
                >
                  <option value="">Não informado</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Intersexo">Intersexo</option>
                </select>
              </Field>

              <Field label="Raça/cor">
                <select
                  value={record.identificacao.racaCor}
                  onChange={(event) =>
                    updateIdentification(
                      "racaCor",
                      event.target.value
                    )
                  }
                >
                  <option value="">Não informada</option>
                  <option value="BRANCA">Branca</option>
                  <option value="PRETA">Preta</option>
                  <option value="PARDA">Parda</option>
                  <option value="AMARELA">Amarela</option>
                  <option value="INDÍGENA">Indígena</option>
                </select>
              </Field>

              <Field label="Identidade de gênero">
                <input
                  type="text"
                  value={
                    record.identificacao.identidadeGenero
                  }
                  onChange={(event) =>
                    updateIdentification(
                      "identidadeGenero",
                      event.target.value
                    )
                  }
                />
              </Field>

              <Field label="Beneficiária do Bolsa Família">
                <select
                  value={
                    record.identificacao.bolsaFamilia === null
                      ? ""
                      : String(
                          record.identificacao.bolsaFamilia
                        )
                  }
                  onChange={(event) =>
                    updateIdentification(
                      "bolsaFamilia",
                      event.target.value === ""
                        ? null
                        : event.target.value === "true"
                    )
                  }
                >
                  <option value="">Não informado</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </Field>

              <Field label="Vigência do benefício">
                <input
                  type="date"
                  value={
                    record.identificacao
                      .vigenciaBolsaFamilia
                  }
                  onChange={(event) =>
                    updateIdentification(
                      "vigenciaBolsaFamilia",
                      event.target.value
                    )
                  }
                />
              </Field>
            </div>

            <details className={styles.protectedDetails}>
              <summary>
                <ShieldCheck size={18} />
                Dados protegidos de contato e endereço
                <small>
                  Abrir somente quando necessário ao
                  atendimento
                </small>
              </summary>

              <div className={styles.fieldGrid}>
                <Field label="CPF">
                  <input
                    type="text"
                    value={record.identificacao.cpf}
                    onChange={(event) =>
                      updateIdentification(
                        "cpf",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="CNS">
                  <input
                    type="text"
                    value={record.identificacao.cns}
                    onChange={(event) =>
                      updateIdentification(
                        "cns",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Telefone celular">
                  <input
                    type="text"
                    value={
                      record.identificacao.telefoneCelular
                    }
                    onChange={(event) =>
                      updateIdentification(
                        "telefoneCelular",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Telefone residencial">
                  <input
                    type="text"
                    value={
                      record.identificacao.telefoneResidencial
                    }
                    onChange={(event) =>
                      updateIdentification(
                        "telefoneResidencial",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Telefone de contato">
                  <input
                    type="text"
                    value={
                      record.identificacao.telefoneContato
                    }
                    onChange={(event) =>
                      updateIdentification(
                        "telefoneContato",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Rua">
                  <input
                    type="text"
                    value={record.identificacao.rua}
                    onChange={(event) =>
                      updateIdentification(
                        "rua",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Número">
                  <input
                    type="text"
                    value={record.identificacao.numero}
                    onChange={(event) =>
                      updateIdentification(
                        "numero",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Complemento">
                  <input
                    type="text"
                    value={
                      record.identificacao.complemento
                    }
                    onChange={(event) =>
                      updateIdentification(
                        "complemento",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Bairro">
                  <input
                    type="text"
                    value={record.identificacao.bairro}
                    onChange={(event) =>
                      updateIdentification(
                        "bairro",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Município">
                  <input
                    type="text"
                    value={record.identificacao.municipio}
                    onChange={(event) =>
                      updateIdentification(
                        "municipio",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="UF">
                  <input
                    type="text"
                    maxLength={2}
                    value={record.identificacao.uf}
                    onChange={(event) =>
                      updateIdentification(
                        "uf",
                        event.target.value.toUpperCase()
                      )
                    }
                  />
                </Field>

                <Field label="CEP">
                  <input
                    type="text"
                    value={record.identificacao.cep}
                    onChange={(event) =>
                      updateIdentification(
                        "cep",
                        event.target.value
                      )
                    }
                  />
                </Field>
              </div>
            </details>
          </section>
        )}

        {activeTab === "gestacao" && (
          <section>
            <div className={styles.sectionHeading}>
              <div>
                <Baby size={21} />
                <span>
                  <h2>Dados gestacionais e clínicos</h2>
                  <p>
                    A DPP e a idade gestacional são
                    recalculadas a partir da DUM.
                  </p>
                </span>
              </div>
            </div>

            <div className={styles.fieldGrid}>
              <Field label="Situação obstétrica">
                <select
                  value={record.gestacao.situacao}
                  onChange={(event) =>
                    updateGestation(
                      "situacao",
                      event.target.value as
                        | "gestacao_em_curso"
                        | "puerperio"
                    )
                  }
                >
                  <option value="gestacao_em_curso">
                    Gestação em curso
                  </option>
                  <option value="puerperio">
                    Parto ocorrido / puerpério
                  </option>
                </select>
              </Field>

              <Field label="Início do pré-natal">
                <input
                  type="date"
                  value={record.gestacao.inicioPreNatal}
                  onChange={(event) =>
                    updateGestation(
                      "inicioPreNatal",
                      event.target.value
                    )
                  }
                />
              </Field>

              <Field label="DUM">
                <input
                  type="date"
                  value={record.gestacao.dum}
                  onChange={(event) =>
                    updateGestation(
                      "dum",
                      event.target.value
                    )
                  }
                />
              </Field>

              <Field
                label="DPP"
                helper="Calculada automaticamente pela DUM; pode ser conferida antes de salvar."
              >
                <input
                  type="date"
                  value={record.gestacao.dpp}
                  onChange={(event) =>
                    updateGestation(
                      "dpp",
                      event.target.value
                    )
                  }
                />
              </Field>

              <Field label="Idade gestacional — semanas">
                <NumberInput
                  value={currentWeeks}
                  min={0}
                  onChange={(value) =>
                    updateGestation("igSemanas", value)
                  }
                />
              </Field>

              <Field label="Idade gestacional — dias">
                <NumberInput
                  value={currentDays}
                  min={0}
                  onChange={(value) =>
                    updateGestation("igDias", value)
                  }
                />
              </Field>

              {record.gestacao.situacao === "puerperio" && (
                <>
                  <Field label="Data do parto">
                    <input
                      type="date"
                      value={record.gestacao.dataParto}
                      onChange={(event) =>
                        updateGestation(
                          "dataParto",
                          event.target.value
                        )
                      }
                    />
                  </Field>

                  <Field label="Tipo de parto">
                    <select
                      value={record.gestacao.tipoParto}
                      onChange={(event) =>
                        updateGestation(
                          "tipoParto",
                          event.target.value
                        )
                      }
                    >
                      <option value="">
                        Não informado
                      </option>
                      <option value="vaginal">
                        Vaginal
                      </option>
                      <option value="cesarea">
                        Cesárea
                      </option>
                      <option value="instrumental">
                        Vaginal instrumental
                      </option>
                      <option value="outro">Outro</option>
                    </select>
                  </Field>
                </>
              )}
            </div>

            <details className={styles.secondaryDetails}>
              <summary>
                Dados de ecografia obstétrica
                <small>
                  Mantidos separadamente dos cálculos pela DUM
                </small>
              </summary>

              <div className={styles.fieldGrid}>
                <Field label="IG pela ecografia — semanas">
                  <NumberInput
                    value={
                      record.gestacao.igEcografiaSemanas
                    }
                    min={0}
                    onChange={(value) =>
                      updateGestation(
                        "igEcografiaSemanas",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="IG pela ecografia — dias">
                  <NumberInput
                    value={
                      record.gestacao.igEcografiaDias
                    }
                    min={0}
                    onChange={(value) =>
                      updateGestation(
                        "igEcografiaDias",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="DPP pela ecografia">
                  <input
                    type="date"
                    value={
                      record.gestacao.dppEcografia
                    }
                    onChange={(event) =>
                      updateGestation(
                        "dppEcografia",
                        event.target.value
                      )
                    }
                  />
                </Field>
              </div>
            </details>

            <div className={styles.divider} />

            <div className={styles.fieldGrid}>
              <Field label="Peso atual (kg)">
                <NumberInput
                  value={record.gestacao.pesoKg}
                  step={0.1}
                  onChange={(value) =>
                    updateGestation("pesoKg", value)
                  }
                />
              </Field>

              <Field
                label="Altura (cm)"
                helper="Exemplo: 165"
              >
                <NumberInput
                  value={record.gestacao.alturaCm}
                  step={0.1}
                  onChange={(value) =>
                    updateGestation("alturaCm", value)
                  }
                />
              </Field>

              <Field label="Pressão arterial">
                <input
                  type="text"
                  placeholder="Ex.: 120/80"
                  value={
                    record.gestacao.pressaoArterial
                  }
                  onChange={(event) =>
                    updateGestation(
                      "pressaoArterial",
                      event.target.value
                    )
                  }
                />
              </Field>

              <Field label="Data da pressão arterial">
                <input
                  type="date"
                  value={
                    record.gestacao.dataUltimaPressao
                  }
                  onChange={(event) =>
                    updateGestation(
                      "dataUltimaPressao",
                      event.target.value
                    )
                  }
                />
              </Field>

              <Field label="Data da medição de peso e altura">
                <input
                  type="date"
                  value={
                    record.gestacao
                      .dataUltimoPesoAltura
                  }
                  onChange={(event) =>
                    updateGestation(
                      "dataUltimoPesoAltura",
                      event.target.value
                    )
                  }
                />
              </Field>

              <Field label="Risco informado anteriormente">
                <input
                  type="text"
                  value={
                    record.gestacao.riscoGestacional
                  }
                  onChange={(event) =>
                    updateGestation(
                      "riscoGestacional",
                      event.target.value
                    )
                  }
                  placeholder="Será consolidado na classificação de risco"
                />
              </Field>
            </div>

            <div className={styles.calculationBox}>
              <HeartPulse size={22} />
              <div>
                <span>IMC calculado</span>
                <strong>
                  {imc === null
                    ? "Preencha peso e altura"
                    : `${imc.toFixed(2)} — ${imcLabel(imc)}`}
                </strong>
              </div>
            </div>
          </section>
        )}

        {activeTab === "consultas" && (
          <section>
            <div className={styles.sectionHeading}>
              <div>
                <CalendarDays size={21} />
                <span>
                  <h2>Consultas e acompanhamento</h2>
                  <p>
                    Registre datas individuais e complemente
                    os indicadores recebidos do PEC.
                  </p>
                </span>
              </div>
            </div>

            <div className={styles.consultationComposer}>
              <Field label="Data">
                <input
                  type="date"
                  value={consultationDraft.data}
                  onChange={(event) =>
                    setConsultationDraft((current) => ({
                      ...current,
                      data: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field label="Tipo">
                <select
                  value={consultationDraft.tipo}
                  onChange={(event) =>
                    setConsultationDraft((current) => ({
                      ...current,
                      tipo: event.target.value,
                    }))
                  }
                >
                  <option value="pre_natal">
                    Pré-natal
                  </option>
                  <option value="rotina">
                    Rotina
                  </option>
                  <option value="enfermagem">
                    Enfermagem
                  </option>
                  <option value="medico">Médico</option>
                  <option value="odontologico">
                    Odontológico
                  </option>
                  <option value="puerperio">
                    Puerpério
                  </option>
                  <option value="outro">Outro</option>
                </select>
              </Field>

              <Field label="Observação">
                <input
                  type="text"
                  value={consultationDraft.observacao}
                  onChange={(event) =>
                    setConsultationDraft((current) => ({
                      ...current,
                      observacao: event.target.value,
                    }))
                  }
                />
              </Field>

              <button
                type="button"
                className={styles.addButton}
                onClick={addConsultation}
              >
                <Plus size={18} />
                Adicionar
              </button>
            </div>

            <div className={styles.consultationList}>
              {record.consultas.length === 0 ? (
                <div className={styles.emptyInline}>
                  Nenhuma consulta individual registrada.
                </div>
              ) : (
                record.consultas.map((item) => (
                  <article key={item.id}>
                    <CalendarDays size={17} />
                    <span>
                      <strong>
                        {new Intl.DateTimeFormat(
                          "pt-BR"
                        ).format(
                          new Date(
                            `${item.data}T12:00:00`
                          )
                        )}
                      </strong>
                      <small>
                        {item.tipo.replaceAll("_", " ")}
                        {item.observacao
                          ? ` · ${item.observacao}`
                          : ""}
                      </small>
                    </span>
                    <button
                      type="button"
                      aria-label="Remover consulta"
                      onClick={() =>
                        removeConsultation(item.id)
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                ))
              )}
            </div>

            <details className={styles.secondaryDetails}>
              <summary>
                Indicadores complementares do PEC
                <small>
                  Quantidades e intervalos usados no
                  monitoramento
                </small>
              </summary>

              <div className={styles.fieldGrid}>
                <Field label="Consultas de pré-natal">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .atendimentosPreNatal
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "atendimentosPreNatal",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Consultas até 12 semanas">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .atendimentosAte12Semanas
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "atendimentosAte12Semanas",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Última consulta de pré-natal">
                  <input
                    type="date"
                    value={
                      record.acompanhamento
                        .ultimaConsultaPreNatal
                    }
                    onChange={(event) =>
                      updateFollowUp(
                        "ultimaConsultaPreNatal",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Atendimentos odontológicos">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .atendimentosOdontologicos
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "atendimentosOdontologicos",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Medições de altura uterina">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .medicoesAlturaUterina
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "medicoesAlturaUterina",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Medições de pressão">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .medicoesPressao
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "medicoesPressao",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Medições de peso e altura">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .medicoesPesoAltura
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "medicoesPesoAltura",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Visitas no pré-natal">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .visitasPreNatal
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "visitasPreNatal",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Visitas no puerpério">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .visitasPuerperio
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "visitasPuerperio",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Atendimentos no puerpério">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .atendimentosPuerperio
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "atendimentosPuerperio",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Última consulta de puerpério">
                  <input
                    type="date"
                    value={
                      record.acompanhamento
                        .ultimaConsultaPuerperio
                    }
                    onChange={(event) =>
                      updateFollowUp(
                        "ultimaConsultaPuerperio",
                        event.target.value
                      )
                    }
                  />
                </Field>

                <Field label="Dias desde atendimento médico">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .diasUltimoAtendimentoMedico
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "diasUltimoAtendimentoMedico",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Dias desde enfermagem">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .diasUltimoAtendimentoEnfermagem
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "diasUltimoAtendimentoEnfermagem",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Dias desde odontologia">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .diasUltimoAtendimentoOdontologico
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "diasUltimoAtendimentoOdontologico",
                        value
                      )
                    }
                  />
                </Field>

                <Field label="Dias desde última visita">
                  <NumberInput
                    value={
                      record.acompanhamento
                        .diasUltimaVisita
                    }
                    onChange={(value) =>
                      updateFollowUp(
                        "diasUltimaVisita",
                        value
                      )
                    }
                  />
                </Field>
              </div>
            </details>
          </section>
        )}

        {activeTab === "exames" && (
          <section>
            <div className={styles.sectionHeading}>
              <div>
                <FileHeart size={21} />
                <span>
                  <h2>Exames por trimestre</h2>
                  <p>
                    O trimestre atual é destacado. Itens
                    condicionais devem ser confirmados pela
                    profissional.
                  </p>
                </span>
              </div>

              <span className={styles.trimesterBadge}>
                IG atual: {currentWeeks ?? "—"} semanas ·{" "}
                {currentTrimester}º trimestre
              </span>
            </div>

            <div className={styles.trimesterTabs}>
              {[1, 2, 3].map((trimester) => (
                <button
                  type="button"
                  key={trimester}
                  className={
                    examTrimester === trimester
                      ? styles.activeTrimester
                      : ""
                  }
                  onClick={() =>
                    setExamTrimester(
                      trimester as 1 | 2 | 3
                    )
                  }
                >
                  {trimester}º trimestre
                  {currentTrimester === trimester && (
                    <small>Atual</small>
                  )}
                </button>
              ))}
            </div>

            <div className={styles.examList}>
              {examsInTab.map((item) => {
                const config = data.examConfigs.find(
                  (candidate) =>
                    candidate.codigo === item.codigo
                );

                return (
                  <details
                    className={styles.examItem}
                    key={`${item.codigo}:${item.trimestre}`}
                  >
                    <summary>
                      <span
                        className={`${styles.statusDot} ${
                          styles[
                            `examStatus_${item.status}`
                          ]
                        }`}
                      />
                      <div>
                        <strong>{item.nome}</strong>
                        <small>
                          {config?.condicaoAplicacao ??
                            "Acompanhamento de rotina"}
                          {item.origem &&
                            ` · Origem: ${item.origem}`}
                        </small>
                      </div>
                      <span className={styles.statusLabel}>
                        {
                          examStatuses.find(
                            ([value]) =>
                              value === item.status
                          )?.[1]
                        }
                      </span>
                      <ChevronDown size={17} />
                    </summary>

                    <div className={styles.examFields}>
                      <Field label="Situação">
                        <select
                          value={item.status}
                          onChange={(event) =>
                            updateExam(
                              item.codigo,
                              item.trimestre,
                              {
                                status: event.target
                                  .value as ExamItem["status"],
                              }
                            )
                          }
                        >
                          {examStatuses.map(
                            ([value, label]) => (
                              <option
                                value={value}
                                key={value}
                              >
                                {label}
                              </option>
                            )
                          )}
                        </select>
                      </Field>

                      <Field label="Data da solicitação">
                        <input
                          type="date"
                          value={item.dataSolicitacao}
                          onChange={(event) =>
                            updateExam(
                              item.codigo,
                              item.trimestre,
                              {
                                dataSolicitacao:
                                  event.target.value,
                              }
                            )
                          }
                        />
                      </Field>

                      <Field label="Data da realização">
                        <input
                          type="date"
                          value={item.dataRealizacao}
                          onChange={(event) =>
                            updateExam(
                              item.codigo,
                              item.trimestre,
                              {
                                dataRealizacao:
                                  event.target.value,
                              }
                            )
                          }
                        />
                      </Field>

                      <Field label="Resultado resumido">
                        <input
                          type="text"
                          value={item.resultado}
                          onChange={(event) =>
                            updateExam(
                              item.codigo,
                              item.trimestre,
                              {
                                resultado:
                                  event.target.value,
                              }
                            )
                          }
                        />
                      </Field>

                      <Field label="Observação">
                        <input
                          type="text"
                          value={item.observacao}
                          onChange={(event) =>
                            updateExam(
                              item.codigo,
                              item.trimestre,
                              {
                                observacao:
                                  event.target.value,
                              }
                            )
                          }
                        />
                      </Field>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "vacinas" && (
          <section>
            <div className={styles.sectionHeading}>
              <div>
                <Syringe size={21} />
                <span>
                  <h2>Vacinas da gestação</h2>
                  <p>
                    Registre a situação atual sem substituir
                    a conferência do cartão vacinal.
                  </p>
                </span>
              </div>
            </div>

            <div className={styles.vaccineList}>
              {record.vacinas.map((item) => {
                const config = data.vaccineConfigs.find(
                  (candidate) =>
                    candidate.codigo === item.codigo
                );

                return (
                  <details
                    className={styles.examItem}
                    key={item.codigo}
                  >
                    <summary>
                      <span
                        className={`${styles.statusDot} ${
                          styles[
                            `vaccineStatus_${item.status}`
                          ]
                        }`}
                      />
                      <div>
                        <strong>{item.nome}</strong>
                        <small>
                          {config?.semanaInicio
                            ? `A partir da ${config.semanaInicio}ª semana`
                            : config?.condicaoAplicacao ??
                              "Conforme histórico"}
                          {item.origem &&
                            ` · Origem: ${item.origem}`}
                        </small>
                      </div>
                      <span className={styles.statusLabel}>
                        {
                          vaccineStatuses.find(
                            ([value]) =>
                              value === item.status
                          )?.[1]
                        }
                      </span>
                      <ChevronDown size={17} />
                    </summary>

                    <div className={styles.examFields}>
                      <Field label="Situação">
                        <select
                          value={item.status}
                          onChange={(event) =>
                            updateVaccine(item.codigo, {
                              status: event.target
                                .value as VaccineItem["status"],
                            })
                          }
                        >
                          {vaccineStatuses.map(
                            ([value, label]) => (
                              <option
                                value={value}
                                key={value}
                              >
                                {label}
                              </option>
                            )
                          )}
                        </select>
                      </Field>

                      <Field label="Dose">
                        <input
                          type="text"
                          value={item.dose}
                          onChange={(event) =>
                            updateVaccine(item.codigo, {
                              dose: event.target.value,
                            })
                          }
                        />
                      </Field>

                      <Field label="Data da aplicação">
                        <input
                          type="date"
                          value={item.dataAplicacao}
                          onChange={(event) =>
                            updateVaccine(item.codigo, {
                              dataAplicacao:
                                event.target.value,
                            })
                          }
                        />
                      </Field>

                      <Field label="Lote">
                        <input
                          type="text"
                          value={item.lote}
                          onChange={(event) =>
                            updateVaccine(item.codigo, {
                              lote: event.target.value,
                            })
                          }
                        />
                      </Field>

                      <Field label="Unidade aplicadora">
                        <input
                          type="text"
                          value={item.unidadeAplicadora}
                          onChange={(event) =>
                            updateVaccine(item.codigo, {
                              unidadeAplicadora:
                                event.target.value,
                            })
                          }
                        />
                      </Field>

                      <Field label="Observação">
                        <input
                          type="text"
                          value={item.observacao}
                          onChange={(event) =>
                            updateVaccine(item.codigo, {
                              observacao:
                                event.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "alta" && (
          <section>
            <div className={styles.sectionHeading}>
              <div>
                <ShieldCheck size={21} />
                <span>
                  <h2>Alta do acompanhamento</h2>
                  <p>
                    A alta preserva o histórico e move a
                    gestante para os cards azuis minimizados.
                  </p>
                </span>
              </div>
            </div>

            <div
              className={`${styles.dischargeBox} ${
                record.alta.ativa
                  ? styles.dischargeActive
                  : ""
              }`}
            >
              <label className={styles.dischargeToggle}>
                <input
                  type="checkbox"
                  checked={record.alta.ativa}
                  onChange={(event) =>
                    setRecord((current) => ({
                      ...current,
                      alta: {
                        ...current.alta,
                        ativa: event.target.checked,
                        data:
                          event.target.checked &&
                          !current.alta.data
                            ? toInputDate(new Date())
                            : current.alta.data,
                      },
                    }))
                  }
                />
                <span>
                  <strong>Registrar alta da gestante</strong>
                  <small>
                    O registro continua disponível no filtro
                    “Com alta”.
                  </small>
                </span>
              </label>

              {record.alta.ativa && (
                <div className={styles.fieldGrid}>
                  <Field label="Data da alta" required>
                    <input
                      type="date"
                      value={record.alta.data}
                      onChange={(event) =>
                        setRecord((current) => ({
                          ...current,
                          alta: {
                            ...current.alta,
                            data: event.target.value,
                          },
                        }))
                      }
                    />
                  </Field>

                  <Field label="Motivo" required>
                    <select
                      value={record.alta.motivo}
                      onChange={(event) =>
                        setRecord((current) => ({
                          ...current,
                          alta: {
                            ...current.alta,
                            motivo: event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">
                        Selecione
                      </option>
                      <option value="encerramento_puerperio">
                        Encerramento do puerpério
                      </option>
                      <option value="parto_ocorrido">
                        Parto ocorrido
                      </option>
                      <option value="transferencia">
                        Transferência
                      </option>
                      <option value="mudanca_territorio">
                        Mudança de território
                      </option>
                      <option value="perda_gestacional">
                        Perda gestacional
                      </option>
                      <option value="outro">Outro</option>
                    </select>
                  </Field>

                  <Field label="Situação final">
                    <input
                      type="text"
                      value={
                        record.alta.situacaoFinal
                      }
                      onChange={(event) =>
                        setRecord((current) => ({
                          ...current,
                          alta: {
                            ...current.alta,
                            situacaoFinal:
                              event.target.value,
                          },
                        }))
                      }
                    />
                  </Field>

                  <Field label="Observação">
                    <textarea
                      rows={3}
                      value={record.alta.observacao}
                      onChange={(event) =>
                        setRecord((current) => ({
                          ...current,
                          alta: {
                            ...current.alta,
                            observacao:
                              event.target.value,
                          },
                        }))
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {message && (
        <div
          className={`${styles.message} ${
            message.tone === "success"
              ? styles.messageSuccess
              : styles.messageError
          }`}
        >
          {message.tone === "success" ? (
            <CheckCircle2 size={19} />
          ) : (
            <AlertCircle size={19} />
          )}
          <span>{message.text}</span>
          {message.existingId && (
            <Link
              href={`/dashboard/cadastro-clinico?gestante=${message.existingId}`}
            >
              Abrir cadastro existente
            </Link>
          )}
        </div>
      )}

      <footer className={styles.actionBar}>
        <Link
          href="/dashboard/gestantes"
          className={styles.cancelButton}
        >
          Voltar para gestantes
        </Link>

        <span>
          Alterações manuais são registradas para auditoria e
          preservadas em novas importações.
        </span>

        <button
          type="submit"
          className={styles.saveButton}
          disabled={saving}
        >
          {saving ? (
            <LoaderCircle
              size={19}
              className={styles.spin}
            />
          ) : (
            <Save size={19} />
          )}
          {record.id
            ? "Salvar acompanhamento"
            : "Cadastrar gestante"}
        </button>
      </footer>
    </form>
  );
}
