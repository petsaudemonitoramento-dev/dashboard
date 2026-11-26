import {expect,test} from "@playwright/test";
test("abertura automática, pular, rever e Escape",async({page})=>{
 await page.emulateMedia({reducedMotion:"no-preference"});
 await page.goto("/login");
 const dialog=page.getByRole("dialog",{name:"Abertura do Gestário APS"});
 await expect(dialog).toBeVisible();
 await dialog.getByRole("button",{name:"Pular"}).click();
 await expect(dialog).not.toBeVisible();
 await expect(page.getByRole("button",{name:"Entrar",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Rever abertura"}).click();
 await expect(dialog).toBeVisible();
 await page.keyboard.press("Escape");
 await expect(dialog).not.toBeVisible();
});
test("abertura encerra automaticamente",async({page})=>{
 await page.emulateMedia({reducedMotion:"no-preference"});
 await page.goto("/login");
 const dialog=page.getByRole("dialog",{name:"Abertura do Gestário APS"});
 await expect(dialog).toBeVisible();
 await expect(dialog).not.toBeVisible({timeout:8000});
});
test("movimento reduzido não bloqueia o login",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.goto("/login");
 await expect(page.getByRole("dialog",{name:"Abertura do Gestário APS"})).not.toBeVisible();
 await expect(page.getByRole("button",{name:"Entrar",exact:true})).toBeVisible();
});

test("fase final estática e transição sem deslocar o login",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:"no-preference"});
 await page.goto("/login");
 const dialog=page.getByRole("dialog",{name:"Abertura do Gestário APS"});
 await expect(dialog).toBeVisible();
 const login=page.locator(".ga-login-page .login-card");
 const before=await login.boundingBox();
 // Scrub the animations to the end of the wipe, before the opacity-only exit.
 await dialog.evaluate(el=>{
   for(const a of el.getAnimations({subtree:true})){
     a.pause();
     a.currentTime=4900;
   }
 });
 const phase=await dialog.evaluate(el=>{
   const light=el.children[0],dark=el.children[1];
   return {light:getComputedStyle(light).visibility,clip:getComputedStyle(dark).clipPath,opacity:getComputedStyle(el).opacity};
 });
 expect(phase).toEqual({light:"hidden",clip:"none",opacity:"1"});
 expect(await login.boundingBox()).toEqual(before);
 await dialog.getByRole("button",{name:"Pular"}).click();
 await expect(dialog).not.toBeVisible();
 expect(await login.boundingBox()).toEqual(before);
 await expect(page.getByRole("button",{name:"Entrar",exact:true})).toBeVisible();
});
