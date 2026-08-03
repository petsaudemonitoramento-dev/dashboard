"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Command, CornerDownLeft, LogOut, Search, X } from "lucide-react";
import { searchableNavigation } from "@/config/navigation";
import { createClient } from "@/lib/supabase/client";
import { profileLabel } from "@/lib/auth/roles";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function AppHeader({
  name,
  profile,
}: {
  name: string;
  profile: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const items = useMemo(() => searchableNavigation(profile), [profile]);

  const results = useMemo(() => {
    const normalized = normalize(query);
    if (!normalized) return items.slice(0, 6);

    return items
      .map((item) => {
        const label = normalize(item.label);
        const keywords = normalize(item.keywords.join(" "));
        const score =
          label === normalized
            ? 0
            : label.startsWith(normalized)
              ? 1
              : label.includes(normalized)
                ? 2
                : keywords.includes(normalized)
                  ? 3
                  : 99;

        return { item, score };
      })
      .filter(({ score }) => score < 99)
      .sort((a, b) => a.score - b.score)
      .map(({ item }) => item)
      .slice(0, 7);
  }, [items, query]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }

      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }

    function handleOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        event.target instanceof Node &&
        !searchRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    window.addEventListener("mousedown", handleOutside);

    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener("mousedown", handleOutside);
    };
  }, []);
function navigate(href: string) {
    setQuery("");
    setOpen(false);
    router.push(href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        results.length ? (current + 1) % results.length : 0
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        results.length
          ? (current - 1 + results.length) % results.length
          : 0
      );
    }

    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      navigate(results[activeIndex].href);
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="app-header">
      <div className="app-search" ref={searchRef}>
        <div className="app-search-field">
          <Search aria-hidden="true" />
          <input
            aria-autocomplete="list"
            aria-controls="app-search-results"
            aria-expanded={open}
            aria-label="Pesquisar módulos do sistema"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Pesquisar módulos..."
            ref={inputRef}
            role="combobox"
            value={query}
          />

          {query ? (
            <button
              aria-label="Limpar busca"
              className="app-search-clear"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              type="button"
            >
              <X />
            </button>
          ) : (
            <span className="app-search-shortcut">
              <Command />
              K
            </span>
          )}
        </div>

        {open && (
          <div
            className="app-search-results"
            id="app-search-results"
            role="listbox"
          >
            <small>Áreas disponíveis para seu perfil</small>

            {results.map((item, index) => {
              const Icon = item.icon;

              return (
                <button
                  aria-selected={activeIndex === index}
                  className={activeIndex === index ? "active" : ""}
                  key={item.href}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => navigate(item.href)}
                  role="option"
                  type="button"
                >
                  <Icon />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.keywords.slice(0, 3).join(" · ")}</small>
                  </span>
                  <CornerDownLeft />
                </button>
              );
            })}

            {results.length === 0 && (
              <div className="app-search-empty">
                Nenhum módulo permitido corresponde à pesquisa.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="user">
        <span>
          <b>{name}</b>
          <small>{profileLabel(profile)}</small>
        </span>

        <button
          aria-label="Sair da conta"
          onClick={signOut}
          title="Sair"
          type="button"
        >
          <LogOut />
        </button>
      </div>
    </header>
  );
}
