"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Baby,
  Building2,
  ClipboardList,
  FilePlus2,
  FileSpreadsheet,
  HeartPulse,
  Home,
  LayoutDashboard,
  Map,
  MapPinned,
  Settings,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { APP_CONFIG } from "@/config/app";

type SidebarProfile =
  | "administrador"
  | "profissional_ubs"
  | "equipe_ubs"
  | "acs"
  | "aluno"
  | string;

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof Home;
  roles: SidebarProfile[];
};

const items: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Início",
    icon: Home,
    roles: ["administrador", "profissional_ubs", "equipe_ubs", "acs", "aluno"],
  },
  {
    href: "/dashboard/indicadores",
    label: "Indicadores",
    icon: LayoutDashboard,
    roles: ["administrador", "profissional_ubs", "equipe_ubs", "aluno"],
  },
  {
    href: "/dashboard/territorio",
    label: "Território",
    icon: MapPinned,
    roles: ["acs"],
  },
  {
    href: "/dashboard/cadastro-clinico",
    label: "Cadastro clínico",
    icon: FilePlus2,
    roles: ["profissional_ubs", "equipe_ubs"],
  },
  {
    href: "/dashboard/classificacao-risco",
    label: "Classificar risco",
    icon: HeartPulse,
    roles: ["profissional_ubs", "equipe_ubs"],
  },
  {
    href: "/dashboard/importacoes",
    label: "Importar PEC",
    icon: FileSpreadsheet,
    roles: ["profissional_ubs", "equipe_ubs"],
  },
  {
    href: "/dashboard/gestantes",
    label: "Gestantes",
    icon: Baby,
    roles: ["profissional_ubs", "equipe_ubs"],
  },
  {
    href: "/dashboard/lixeira",
    label: "Lixeira",
    icon: Trash2,
    roles: ["profissional_ubs", "equipe_ubs"],
  },
  {
    href: "/dashboard/atendimentos",
    label: "Atendimentos",
    icon: Stethoscope,
    roles: ["profissional_ubs", "equipe_ubs"],
  },
  {
    href: "/dashboard/visitas",
    label: "Visitas",
    icon: ClipboardList,
    roles: ["profissional_ubs", "equipe_ubs"],
  },
  {
    href: "/dashboard/autorizacoes",
    label: "Autorizações",
    icon: UserCheck,
    roles: ["administrador"],
  },
  {
    href: "/dashboard/usuarios",
    label: "Usuários",
    icon: Users,
    roles: ["administrador"],
  },
  {
    href: "/dashboard/ubs",
    label: "UBS e microáreas",
    icon: Building2,
    roles: ["administrador"],
  },
  {
    href: "/dashboard/mapa",
    label: "Mapa",
    icon: Map,
    roles: ["profissional_ubs", "equipe_ubs"],
  },
  {
    href: "/dashboard/configuracoes",
    label: "Configurações",
    icon: Settings,
    roles: ["administrador", "profissional_ubs", "equipe_ubs", "acs", "aluno"],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ profile }: { profile: SidebarProfile }) {
  const pathname = usePathname();
  const visibleItems = items.filter((item) => item.roles.includes(profile));

  return (
    <aside className="sidebar">
      <div className="sidebar-main">
        <div className="side-brand">
          <div className="side-brand-logo">
            <Image
              src="/brand/pet-saude-white-v10.png"
              alt="Símbolo PET-Saúde"
              width={48}
              height={48}
              priority
            />
          </div>

          <span>
            Cuidado na Gestação
            <br />
            <small>APS • Indicador 2026</small>
          </span>
        </div>

        <nav className="sidebar-navigation" aria-label="Menu principal">
          {visibleItems.map(({ href, label, icon: Icon }) => (
            <Link
              className={isActive(pathname, href) ? "active" : ""}
              href={href}
              key={href}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <footer className="sidebar-footer">
        <span>Versão {APP_CONFIG.version}</span>
        <span>Desenvolvido por {APP_CONFIG.developer}</span>
      </footer>
    </aside>
  );
}
