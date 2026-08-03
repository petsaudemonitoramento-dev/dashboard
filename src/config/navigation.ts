import {
  Baby,
  Building2,
  ClipboardList,
  FilePlus2,
  FileSpreadsheet,
  HeartPulse,
  Home,
  LayoutDashboard,
  MapPinned,
  Settings,
  Trash2,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  keywords: string[];
  icon: LucideIcon;
};

export type NavigationSection = {
  label: string;
  items: NavigationItem[];
};

const overview: NavigationItem = {
  href: "/dashboard",
  label: "Visão Geral",
  keywords: ["inicio", "resumo", "painel", "visao geral"],
  icon: Home,
};

const settings: NavigationItem = {
  href: "/dashboard/configuracoes",
  label: "Configurações",
  keywords: ["conta", "senha", "preferencias", "seguranca"],
  icon: Settings,
};

export const NAVIGATION_BY_PROFILE: Record<string, NavigationSection[]> = {
  gestao_municipal: [
    {
      label: "Principal",
      items: [
        overview,
        {
          href: "/dashboard/indicadores",
          label: "Indicadores",
          keywords: ["analytics", "dados", "metricas"],
          icon: LayoutDashboard,
        },
        {
          href: "/dashboard/mapa",
          label: "Mapa e território",
          keywords: ["mapa", "territorio", "campina grande"],
          icon: MapPinned,
        },
      ],
    },
    {
      label: "Gestão",
      items: [
        {
          href: "/dashboard/autorizacoes",
          label: "Autorizações",
          keywords: ["aprovar", "solicitacoes", "credenciais"],
          icon: UserCheck,
        },
        {
          href: "/dashboard/usuarios",
          label: "Usuários",
          keywords: ["pessoas", "perfis", "acessos"],
          icon: Users,
        },
        {
          href: "/dashboard/ubs",
          label: "UBS e microáreas",
          keywords: ["unidades", "microareas", "territorios"],
          icon: Building2,
        },
      ],
    },
    { label: "Conta", items: [settings] },
  ],
  equipe_ubs: [
    {
      label: "Principal",
      items: [
        overview,
        {
          href: "/dashboard/gestantes",
          label: "Gestantes",
          keywords: ["pacientes", "acompanhamento", "cadastros"],
          icon: Baby,
        },
        {
          href: "/dashboard/indicadores",
          label: "Indicadores",
          keywords: ["analytics", "dados", "metricas"],
          icon: LayoutDashboard,
        },
        {
          href: "/dashboard/mapa",
          label: "Mapa e território",
          keywords: ["mapa", "territorio", "microareas"],
          icon: MapPinned,
        },
      ],
    },
    {
      label: "Cuidado clínico",
      items: [
        {
          href: "/dashboard/cadastro-clinico",
          label: "Cadastro clínico",
          keywords: ["prontuario", "clinico", "gestacao"],
          icon: FilePlus2,
        },
        {
          href: "/dashboard/classificacao-risco",
          label: "Classificar risco",
          keywords: ["risco", "escore", "classificacao"],
          icon: HeartPulse,
        },
        {
          href: "/dashboard/visitas",
          label: "Visitas",
          keywords: ["acs", "domiciliar", "busca ativa", "territorio"],
          icon: ClipboardList,
        },
      ],
    },
    {
      label: "Dados",
      items: [
        {
          href: "/dashboard/importacoes",
          label: "Importar PEC",
          keywords: ["planilha", "csv", "pec", "importacao"],
          icon: FileSpreadsheet,
        },
        {
          href: "/dashboard/lixeira",
          label: "Lixeira",
          keywords: ["excluidas", "restaurar", "removidas"],
          icon: Trash2,
        },
      ],
    },
    { label: "Conta", items: [settings] },
  ],
  acs: [
    {
      label: "Principal",
      items: [
        overview,
        {
          href: "/dashboard/mapa",
          label: "Mapa e território",
          keywords: ["mapa", "territorio", "microarea"],
          icon: MapPinned,
        },
        {
          href: "/dashboard/visitas",
          label: "Visitas",
          keywords: ["domiciliar", "busca ativa", "gestantes"],
          icon: ClipboardList,
        },
      ],
    },
    { label: "Conta", items: [settings] },
  ],
  aluno: [
    {
      label: "Principal",
      items: [
        overview,
        {
          href: "/dashboard/indicadores",
          label: "Indicadores",
          keywords: ["analytics", "dados", "metricas"],
          icon: LayoutDashboard,
        },
      ],
    },
    { label: "Conta", items: [settings] },
  ],
  administrador: [
    { label: "Principal", items: [overview] },
    {
      label: "Administração técnica",
      items: [
        {
          href: "/dashboard/ubs",
          label: "UBS e microáreas",
          keywords: ["unidades", "microareas", "configuracao"],
          icon: Building2,
        },
      ],
    },
    { label: "Conta", items: [settings] },
  ],
};

export function navigationForProfile(profile: string): NavigationSection[] {
  return (
    NAVIGATION_BY_PROFILE[profile] ?? [
      { label: "Principal", items: [overview, settings] },
    ]
  );
}

export function searchableNavigation(profile: string): NavigationItem[] {
  const seen = new Set<string>();

  return navigationForProfile(profile)
    .flatMap((section) => section.items)
    .filter((item) => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    });
}
