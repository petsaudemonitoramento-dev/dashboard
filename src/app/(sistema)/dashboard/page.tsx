import { WorkspaceData } from "@/components/home/workspace-data";
export const dynamic="force-dynamic";
export const revalidate=0;
export default async function DashboardPage({searchParams}:{searchParams:Promise<{entrada?:string|string[]}>}){const p=await searchParams;return <WorkspaceData entry={p.entrada==="1"}/>;}
