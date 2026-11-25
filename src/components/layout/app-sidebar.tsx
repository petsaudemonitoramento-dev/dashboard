"use client";

import {
  FileSpreadsheet,
  Home,
  CalendarDays,
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
  {href:"/dashboard/importacoes",label:"Importar PEC",icon:FileSpreadsheet},
  {href:"/dashboard/gestantes",label:"Minhas gestantes",icon:UsersRound},
  {
    href: "/dashboard/atendimentos",
    label: "Agenda",
    icon: CalendarDays,
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
  profile, onNavigate,
}: {
  profile: SidebarProfile; onNavigate?:()=>void;
}) {
  const pathname = usePathname();
  const visibleItems =
    profile === "equipe_ubs" ? professionalItems : [];

  return (
    <aside className="sidebar" id="gestario-sidebar" aria-label="Menu lateral">
      <div className="sidebar-main">
        <Link className="side-brand ga-brand" href="/dashboard" onClick={()=>{onNavigate?.();if(pathname==="/dashboard")window.scrollTo({top:0,behavior:"auto"})}}><Image src="/brand/gestario-original.png" alt="Gestário APS" width={1377} height={785} priority/></Link>
        <nav
          className="sidebar-navigation"
          aria-label="Menu principal"
        >
          {visibleItems.map(({ href, label, icon: Icon }) => (
            <Link
              aria-current={
                isActive(pathname, href) ? "page" : undefined
              }
              className={
                isActive(pathname, href) ? "active" : ""
              }
              href={href}
              onClick={onNavigate}
              key={href}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="ga-quote"><span aria-hidden="true">☀️</span><div><b>Frase do dia</b><p>“Cada cuidado hoje constrói um amanhã mais seguro.”</p></div></div>
      <footer className="sidebar-footer">
        <span>Versão {APP_CONFIG.version}</span>
        <span>Desenvolvido por {APP_CONFIG.developer}</span>
      </footer>
    </aside>
  );
}
