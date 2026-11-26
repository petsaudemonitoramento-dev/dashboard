"use client";
import { useCallback, useEffect, useRef } from "react";
import styles from "./gestario-intro.module.css";

const DURATION=6000;
const FALLBACK=6400;

export function GestarioIntro(){
 const dialog=useRef<HTMLDialogElement>(null);
 const timer=useRef<number|null>(null);
 const finish=useCallback(()=>{
   if(timer.current!==null){window.clearTimeout(timer.current);timer.current=null}
   if(dialog.current?.open)dialog.current.close();
 },[]);
 const start=useCallback(()=>{
   if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
   const el=dialog.current;
   if(!el||typeof el.showModal!=="function")return;
   finish();
   try{el.showModal();timer.current=window.setTimeout(finish,FALLBACK)}
   catch{finish()}
 },[finish]);
 useEffect(()=>{
   const media=window.matchMedia("(prefers-reduced-motion: reduce)");
   const motionChange=()=>{if(media.matches)finish()};
   media.addEventListener("change",motionChange);
   start();
   return ()=>{media.removeEventListener("change",motionChange);finish()};
 },[start,finish]);
 return <>
   <button type="button" className={styles.replay} onClick={start}>↻ Rever abertura</button>
   <dialog ref={dialog} className={styles.intro} aria-label="Abertura do Gestário APS" data-intro-duration-ms={DURATION}
     onCancel={e=>{e.preventDefault();finish()}}
     onAnimationEnd={e=>{if(e.target===e.currentTarget)finish()}}>
     <div className={styles.light} aria-hidden="true"><span className={styles.logo}/></div>
     <div className={styles.dark} aria-hidden="true"><span className={styles.logo}/></div>
     <button type="button" className={styles.skip} onClick={finish} autoFocus>Pular <span aria-hidden="true">→</span></button>
   </dialog>
 </>;
}
