"use client";

import {
  Building2,
  Layers3,
  MapPinned,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import styles from "./territory-map.module.css";

const CAMPINA_GRANDE_CENTER: [number, number] = [-7.2307, -35.8817];
const INITIAL_ZOOM = 12;

type MapStatus = "loading" | "ready" | "error";

export function TerritoryMap({
  profile,
  profileLabel,
  scopeDescription,
  ubsName,
}: {
  profile: string;
  profileLabel: string;
  scopeDescription: string;
  ubsName: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      if (!containerRef.current || mapRef.current) return;

      try {
        const L = await import("leaflet");
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          attributionControl: true,
          center: CAMPINA_GRANDE_CENTER,
          preferCanvas: true,
          scrollWheelZoom: true,
          zoom: INITIAL_ZOOM,
          zoomControl: true,
        });

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        L.circleMarker(CAMPINA_GRANDE_CENTER, {
          color: "#623acb",
          fillColor: "#ffffff",
          fillOpacity: 1,
          radius: 8,
          weight: 4,
        })
          .addTo(map)
          .bindPopup(
            "<strong>Campina Grande — PB</strong><br/>Centro de referência do modo piloto."
          );

        L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
        mapRef.current = map;
        window.setTimeout(() => map.invalidateSize(), 0);
        setStatus("ready");
      } catch (error) {
        console.error("Erro ao inicializar mapa territorial V29:", error);
        setStatus("error");
      }
    }

    void initializeMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  function resetMap() {
    mapRef.current?.setView(CAMPINA_GRANDE_CENTER, INITIAL_ZOOM, {
      animate: true,
    });
  }

  const scopeTitle =
    profile === "gestao_municipal"
      ? "Município de Campina Grande"
      : ubsName ?? scopeDescription;

  return (
    <div className={styles.page}>
      <section className={styles.heading}>
        <div>
          <span>Visualização territorial</span>
          <h1>Mapa e território</h1>
          <p>
            Base cartográfica real de Campina Grande em modo piloto, sem
            localização individual de gestantes.
          </p>
        </div>
        <div className={styles.testBadge}>
          <Layers3 size={17} />Modo de teste
        </div>
      </section>

      <section className={styles.scopeBar}>
        <div>
          <MapPinned size={19} />
          <span><small>Escopo atual</small><strong>{scopeTitle}</strong></span>
        </div>
        <div>
          <ShieldCheck size={19} />
          <span><small>Perfil</small><strong>{profileLabel}</strong></span>
        </div>
      </section>

      <div className={styles.layout}>
        <section className={styles.mapCard}>
          <header className={styles.mapHeader}>
            <div>
              <h2>Campina Grande — PB</h2>
              <p>Mapa interativo com ruas e pontos existentes.</p>
            </div>
            <button onClick={resetMap} type="button">
              <RefreshCcw size={16} />Centralizar
            </button>
          </header>

          <div className={styles.mapFrame}>
            <div
              aria-label="Mapa interativo de Campina Grande"
              className={styles.map}
              ref={containerRef}
            />
            {status === "loading" && (
              <div className={styles.mapOverlay}>
                <span className={styles.loader} />
                <strong>Carregando mapa...</strong>
              </div>
            )}
            {status === "error" && (
              <div className={styles.mapOverlay}>
                <MapPinned size={31} />
                <strong>Não foi possível carregar o mapa</strong>
                <span>Verifique a conexão com a internet e tente novamente.</span>
              </div>
            )}
          </div>

          <footer className={styles.mapFooter}>
            <span>Os limites de UBS e microáreas ainda não foram incorporados.</span>
            <span>Base: OpenStreetMap</span>
          </footer>
        </section>

        <aside className={styles.sidePanel}>
          <article className={styles.infoCard}>
            <span className={styles.infoIcon}><Building2 size={21} /></span>
            <h2>Camadas da versão piloto</h2>
            <div className={styles.layerList}>
              <div>
                <span className={styles.enabledDot} />
                <strong>Mapa urbano real</strong>
                <small>Ruas, bairros e pontos cartográficos.</small>
              </div>
              <div>
                <span className={styles.pendingDot} />
                <strong>UBS georreferenciadas</strong>
                <small>Pendente de coordenadas institucionais validadas.</small>
              </div>
              <div>
                <span className={styles.pendingDot} />
                <strong>Limites de microáreas</strong>
                <small>Pendente de arquivos geográficos oficiais.</small>
              </div>
            </div>
          </article>

          <article className={styles.privacyCard}>
            <ShieldCheck size={20} />
            <div>
              <strong>Sem localização individual</strong>
              <p>
                Esta versão não apresenta residências, trajetos, posição do
                ACS ou marcadores de gestantes.
              </p>
            </div>
          </article>

          <article className={styles.nextCard}>
            <h2>Próxima evolução</h2>
            <p>
              Após validação institucional, o mapa poderá receber coordenadas
              das UBS, polígonos GeoJSON das microáreas e indicadores
              estritamente agregados.
            </p>
          </article>
        </aside>
      </div>
    </div>
  );
}
