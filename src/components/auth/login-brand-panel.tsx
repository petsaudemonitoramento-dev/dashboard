import Image from "next/image";
import { APP_CONFIG } from "@/config/app";

export function LoginBrandPanel() {
  return (
    <section
      className="presentation-panel"
      aria-label="Apresentação institucional do PET Saúde Digital"
    >
      <div className="presentation-glow presentation-glow-one" />
      <div className="presentation-glow presentation-glow-two" />
      <div className="presentation-dots presentation-dots-top" />
      <div className="presentation-dots presentation-dots-bottom" />
      <div className="presentation-wave presentation-wave-one" />
      <div className="presentation-wave presentation-wave-two" />

      <div className="pet-brand">
        <Image
          src="/brand/pet-saude-white-v10.png"
          alt="PET-Saúde Informação e Saúde Digital"
          width={150}
          height={150}
          priority
        />
      </div>

      <div className="presentation-copy">
        <p className="presentation-program">PET Saúde Digital</p>
        <h1>Cuidado na Gestação na APS</h1>
        <div className="presentation-line" />
        <p className="presentation-description">
          Monitoramento inteligente para uma atenção primária mais eficiente,
          acolhedora e baseada em dados.
        </p>
      </div>

      <div className="presentation-illustration">
        <Image
          src="/brand/gestante-graficos-v10.png"
          alt="Gestante acompanhada por gráficos e indicadores"
          width={470}
          height={590}
          priority
        />
      </div>

      <div className="presentation-ufcg-card">
        <Image
          src="/brand/ufcg-horizontal-v10.png"
          alt="Universidade Federal de Campina Grande"
          width={220}
          height={70}
          priority
        />
      </div>

      <div className="presentation-credit">
        <span className="presentation-credit-version">
          Versão {APP_CONFIG.version}
        </span>
        <span aria-hidden="true">•</span>
        <span>
          Desenvolvido por {APP_CONFIG.developer}
        </span>
      </div>
    </section>
  );
}
