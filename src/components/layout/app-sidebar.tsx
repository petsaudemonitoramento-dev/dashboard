"use client";

import {
  BellRing,
  FileSpreadsheet,
  Home,
  Stethoscope,
  UserRound,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_CONFIG } from "@/config/app";

type SidebarProfile = string;

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof Home;
};

const professionalItems: NavigationItem[] = [
  {
    href: "/dashboard",
    label: "Início",
    icon: Home,
  },
  {
    href: "/dashboard/gestantes",
    label: "Minhas gestantes",
    icon: UsersRound,
  },
  {
    href: "/dashboard/importacoes",
    label: "Importar PEC",
    icon: FileSpreadsheet,
  },
  {
    href: "/dashboard/alertas",
    label: "Alertas",
    icon: BellRing,
  },
  {
    href: "/dashboard/atendimentos",
    label: "Atendimentos",
    icon: Stethoscope,
  },
  {
    href: "/dashboard/perfil",
    label: "Perfil",
    icon: UserRound,
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({
  profile,
}: {
  profile: SidebarProfile;
}) {
  const pathname = usePathname();
  const visibleItems =
    profile === "equipe_ubs" ? professionalItems : [];

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
            <small>APS • Profissionais</small>
          </span>
        </div>

        <nav
          className="sidebar-navigation"
          aria-label="Menu principal"
        >
          {visibleItems.map(({ href, label, icon: Icon }) => (
            <Link
              className={
                isActive(pathname, href) ? "active" : ""
              }
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
