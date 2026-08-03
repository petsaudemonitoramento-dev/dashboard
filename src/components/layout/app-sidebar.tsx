"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_CONFIG } from "@/config/app";
import { navigationForProfile } from "@/config/navigation";
import type { UserProfile } from "@/lib/auth/roles";

type SidebarProfile = UserProfile | string;

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ profile }: { profile: SidebarProfile }) {
  const pathname = usePathname();
  const sections = navigationForProfile(profile);

  return (
    <aside className="sidebar">
      <div className="sidebar-main">
        <div className="side-brand">
          <Image
            className="side-brand-symbol"
            src="/brand/pet-saude-white-v10.png"
            alt="Símbolo PET-Saúde"
            width={45}
            height={45}
            priority
          />

          <span>
            Cuidado na Gestação
            <br />
            <small>APS • Indicador 2026</small>
          </span>
        </div>

        <nav className="sidebar-navigation" aria-label="Menu principal">
          {sections.map((section) => (
            <section className="sidebar-nav-section" key={section.label}>
              <span className="sidebar-section-label">{section.label}</span>

              <div className="sidebar-section-links">
                {section.items.map(({ href, label, icon: Icon }) => (
                  <Link
                    aria-current={isActive(pathname, href) ? "page" : undefined}
                    className={isActive(pathname, href) ? "active" : ""}
                    href={href}
                    key={href}
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </section>
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
