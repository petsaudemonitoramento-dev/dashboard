"use client";

import {
  Building2,
  Check,
  MapPinned,
  Pencil,
  Plus,
  Power,
  Save,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type ManagedMicroarea = {
  id: string;
  codigo: string;
  nome: string | null;
  ativa: boolean;
};

export type ManagedUbs = {
  id: string;
  nome: string;
  ativa: boolean;
  microareas: ManagedMicroarea[];
};

export function UbsManager({ units }: { units: ManagedUbs[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [editingUbs, setEditingUbs] = useState<string | null>(null);
  const [editingMicroarea, setEditingMicroarea] = useState<string | null>(null);

  async function request(body: Record<string, unknown>) {
    setWorking(String(body.id ?? body.ubsId ?? body.action ?? "action"));
    setMessage(null);

    try {
      const response = await fetch("/api/admin/ubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível concluir a operação.");
      }

      setMessage("Alteração salva com sucesso.");
      setEditingUbs(null);
      setEditingMicroarea(null);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a operação."
      );
    } finally {
      setWorking(null);
    }
  }

  function createUbs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void request({
      action: "create_ubs",
      nome: String(form.get("nome") ?? ""),
    });
    event.currentTarget.reset();
  }

  function createMicroarea(event: FormEvent<HTMLFormElement>, ubsId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void request({
      action: "create_microarea",
      ubsId,
      codigo: String(form.get("codigo") ?? ""),
      nome: String(form.get("nome") ?? ""),
    });
    event.currentTarget.reset();
  }

  return (
    <div className="v20-admin-page">
      <section className="v20-admin-card">
        <div className="v20-page-heading">
          <div>
            <h2>Adicionar UBS</h2>
            <p>Cadastre uma nova unidade antes de criar suas microáreas.</p>
          </div>
        </div>

        <form className="v20-inline-form" onSubmit={createUbs}>
          <input
            name="nome"
            placeholder="Nome completo da UBS"
            required
          />
          <button className="v20-primary-button" type="submit">
            <Plus size={17} />
            Adicionar UBS
          </button>
        </form>

        {message && <div className="v20-message v20-message-success">{message}</div>}
      </section>

      {units.map((unit) => (
        <section className="v20-admin-card" key={unit.id}>
          <header className="v20-unit-header">
            <div>
              <span className="v20-unit-icon">
                <Building2 size={20} />
              </span>

              {editingUbs === unit.id ? (
                <form
                  className="v20-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void request({
                      action: "update_ubs",
                      id: unit.id,
                      nome: String(form.get("nome") ?? ""),
                    });
                  }}
                >
                  <input defaultValue={unit.nome} name="nome" required />
                  <button
                    className="v20-success-button"
                    disabled={working === unit.id}
                    type="submit"
                  >
                    <Save size={15} />
                    Salvar
                  </button>
                </form>
              ) : (
                <div>
                  <h2>{unit.nome}</h2>
                  <p>{unit.ativa ? "Unidade ativa" : "Unidade desativada"}</p>
                </div>
              )}
            </div>

            <div className="v20-admin-actions">
              <button
                className="v20-secondary-button"
                onClick={() => setEditingUbs(unit.id)}
                type="button"
              >
                <Pencil size={15} />
                Editar
              </button>
              <button
                className={unit.ativa ? "v20-danger-button" : "v20-success-button"}
                onClick={() =>
                  void request({
                    action: "toggle_ubs",
                    id: unit.id,
                    ativa: !unit.ativa,
                  })
                }
                type="button"
              >
                <Power size={15} />
                {unit.ativa ? "Desativar" : "Reativar"}
              </button>
            </div>
          </header>

          <div className="v20-microarea-list">
            {unit.microareas.map((microarea) => (
              <div className="v20-microarea-row" key={microarea.id}>
                {editingMicroarea === microarea.id ? (
                  <form
                    className="v20-inline-form v20-inline-form-grow"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void request({
                        action: "update_microarea",
                        id: microarea.id,
                        codigo: String(form.get("codigo") ?? ""),
                        nome: String(form.get("nome") ?? ""),
                      });
                    }}
                  >
                    <input
                      defaultValue={microarea.codigo}
                      name="codigo"
                      placeholder="Código"
                      required
                    />
                    <input
                      defaultValue={microarea.nome ?? ""}
                      name="nome"
                      placeholder="Nome opcional"
                    />
                    <button className="v20-success-button" type="submit">
                      <Check size={15} />
                      Salvar
                    </button>
                  </form>
                ) : (
                  <>
                    <div>
                      <MapPinned size={17} />
                      <span>
                        <strong>Microárea {microarea.codigo}</strong>
                        <small>{microarea.nome || "Sem nome adicional"}</small>
                      </span>
                    </div>
                    <div className="v20-admin-actions">
                      <span
                        className={
                          microarea.ativa
                            ? "v20-badge v20-badge-approved"
                            : "v20-badge v20-badge-disabled"
                        }
                      >
                        {microarea.ativa ? "Ativa" : "Removida"}
                      </span>
                      <button
                        className="v20-secondary-button"
                        onClick={() => setEditingMicroarea(microarea.id)}
                        type="button"
                      >
                        <Pencil size={14} />
                        Editar
                      </button>
                      <button
                        className={
                          microarea.ativa
                            ? "v20-danger-button"
                            : "v20-success-button"
                        }
                        onClick={() =>
                          void request({
                            action: "toggle_microarea",
                            id: microarea.id,
                            ativa: !microarea.ativa,
                          })
                        }
                        type="button"
                      >
                        <Power size={14} />
                        {microarea.ativa ? "Remover" : "Restaurar"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {unit.microareas.length === 0 && (
              <div className="v20-empty-admin">
                Nenhuma microárea cadastrada.
              </div>
            )}
          </div>

          <form
            className="v20-inline-form v20-add-microarea"
            onSubmit={(event) => createMicroarea(event, unit.id)}
          >
            <input
              name="codigo"
              placeholder="Código, ex.: 07"
              required
            />
            <input
              name="nome"
              placeholder="Nome opcional"
            />
            <button className="v20-secondary-button" type="submit">
              <Plus size={16} />
              Adicionar microárea
            </button>
          </form>
        </section>
      ))}
    </div>
  );
}
