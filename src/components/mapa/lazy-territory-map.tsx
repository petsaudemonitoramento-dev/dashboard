"use client";

import dynamic from "next/dynamic";

type TerritoryMapProps = {
  profile: string;
  profileLabel: string;
  scopeDescription: string;
  ubsName: string | null;
};

const TerritoryMap = dynamic<TerritoryMapProps>(() =>
  import("./territory-map").then((module) => module.TerritoryMap)
);

export function LazyTerritoryMap(props: TerritoryMapProps) {
  return <TerritoryMap {...props} />;
}
