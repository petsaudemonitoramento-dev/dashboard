"use client";
import { Printer } from "lucide-react";
export function PrintSummaryButton(){
  return <button type="button" onClick={()=>window.print()}>
    <Printer size={16}/> Imprimir / salvar em PDF
  </button>;
}
