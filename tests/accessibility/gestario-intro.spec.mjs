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
