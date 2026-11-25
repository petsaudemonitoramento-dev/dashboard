export type ImportHistoryRow = {
  id:string; total_linhas:number; total_processadas:number; total_erros:number; status:string; criado_em:string;
};
const dateFormat = new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Fortaleza"});
const monthFormat = new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric",timeZone:"America/Fortaleza"});
function label(row:ImportHistoryRow){
  if(row.status==="concluida") return row.total_erros>0?"Concluída com erros":"Concluída";
  if(row.status==="erro"||row.status==="falha")return "Com erro";
  if(row.status==="processando")return "Processando";
  if(row.status==="pendente")return "Pendente";
  return row.status.replaceAll("_"," ");
}
export function ImportHistory({rows,unavailable}:{rows:ImportHistoryRow[];unavailable:boolean}){
  return <section className="pec-card ga-pec-history" aria-labelledby="pec-history-title">
    <header><div><small>RASTREABILIDADE</small><h2 id="pec-history-title">Histórico recente</h2></div><span>Minha conta</span></header>
    {unavailable?<p role="alert">Não foi possível consultar o histórico agora. Atualize a página para tentar novamente.</p>:rows.length===0?<div className="ga-pec-history-empty">Nenhuma importação registrada. Os lotes aparecerão aqui após o envio.</div>:<div className="pec-table-wrap"><table className="pec-table">
      <caption>Últimas importações da sua conta</caption>
      <thead><tr><th scope="col">Arquivo / lote</th><th scope="col">Mês de envio</th><th scope="col">Registros</th><th scope="col">Status</th><th scope="col">Recebido em</th></tr></thead>
      <tbody>{rows.map(row=><tr key={row.id}><td><strong>Lote {row.id.slice(0,8).toUpperCase()}</strong></td><td>{monthFormat.format(new Date(row.criado_em))}</td><td>{row.total_processadas} / {row.total_linhas}{row.total_erros>0&&<small className="ga-history-errors">{row.total_erros} com erro</small>}</td><td><span className="ga-history-status" data-tone={row.status==="concluida"&&row.total_erros===0?"ok":row.total_erros>0||row.status==="erro"?"warning":"neutral"}>{label(row)}</span></td><td>{dateFormat.format(new Date(row.criado_em))}</td></tr>)}</tbody>
    </table></div>}
    <p className="ga-history-note">Até 15 lotes recentes. O mês corresponde à data de envio, não à competência do relatório. Os nomes originais dos arquivos não são exibidos para evitar exposição de identificadores.</p>
  </section>;
}
