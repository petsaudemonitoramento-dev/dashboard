import Image from "next/image";
import {APP_CONFIG} from "@/config/app";
export function LoginBrandPanel(){
 return <section className="ga-login-brand" aria-label="Apresentação institucional do Gestário APS">
   <h1><Image src="/brand/gestario-original.png" alt="Gestário APS" width={1377} height={785} priority/></h1>
   <p>Seu dia de cuidado, organizado em um só lugar.</p>
   <div className="ga-login-institutions">
     <Image src="/brand/pet-saude-color.png" alt="PET-Saúde Informação e Saúde Digital" width={150} height={150}/>
     <Image src="/brand/ufcg-horizontal-v10.png" alt="Universidade Federal de Campina Grande" width={220} height={70}/>
   </div>
   <small className="ga-login-credit">Versão {APP_CONFIG.version} · Desenvolvido por {APP_CONFIG.developer}</small>
 </section>;
}
