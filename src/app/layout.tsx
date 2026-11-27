import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
const inter=Inter({subsets:["latin"],variable:"--font-interface"});
const manrope=Manrope({subsets:["latin"],variable:"--font-heading"});
export const metadata:Metadata={title:"Cuidado na Gestação na APS",description:"Sistema de monitoramento do cuidado pré-natal",icons:{icon:[{url:"/brand/gestario-favicon-v2.png",type:"image/png",sizes:"64x64"}],shortcut:"/brand/gestario-favicon-v2.png"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body className={`${inter.variable} ${manrope.variable}`}>{children}</body></html>}
