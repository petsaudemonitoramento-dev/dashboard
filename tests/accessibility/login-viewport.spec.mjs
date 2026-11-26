import {expect,test} from "@playwright/test";
for(const viewport of [{width:1194,height:650},{width:1024,height:600},{width:820,height:1040},{width:1440,height:768}]){
 test(`login completo sem rolagem em ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/login");
  const dialog=page.getByRole("dialog",{name:"Abertura do Gestário APS"});
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"Pular"}).click();
  await expect(dialog).not.toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  for(const locator of [page.getByRole("heading",{name:"Gestário APS"}),page.getByRole("button",{name:"Entrar",exact:true}),page.getByRole("link",{name:"Criar conta"}),page.getByRole("button",{name:"Reenviar e-mail de confirmação"}),page.getByRole("link",{name:"LGPD — Lei nº 13.709/2018"}),page.getByRole("button",{name:"Rever abertura"})]){
   await expect(locator).toBeInViewport({ratio:1});
  }
  await expect(page.getByRole("link",{name:"Manual v5.6 (09/11/2026)"})).toBeInViewport({ratio:1});
  const metrics=await page.evaluate(()=>({h:document.documentElement.scrollHeight,v:window.innerHeight,w:document.documentElement.scrollWidth,vw:window.innerWidth}));
  expect(metrics.h).toBeLessThanOrEqual(metrics.v+1);
  expect(metrics.w).toBeLessThanOrEqual(metrics.vw+1);
 });
}
test("em celular pequeno, referências e autenticação continuam acessíveis",async({page})=>{
 await page.setViewportSize({width:360,height:640});
 await page.emulateMedia({reducedMotion:"reduce"});
 await page.goto("/login");
 await expect(page.getByRole("button",{name:"Entrar",exact:true})).toBeVisible();
 const law=page.getByRole("link",{name:"LGPD — Lei nº 13.709/2018"});
 await law.scrollIntoViewIfNeeded();await expect(law).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
});

test("reenvio de confirmação utiliza o e-mail do login sem submeter a senha",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"});
 let requestBody;
 await page.route("**/api/auth/reenviar-confirmacao",async(route)=>{
  requestBody=route.request().postDataJSON();
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,message:"Se houver uma confirmação pendente, enviaremos um novo e-mail."})});
 });
 await page.goto("/login");
 await page.getByLabel("E-mail ou usuário").fill("teste@example.test");
 await page.getByRole("button",{name:"Reenviar e-mail de confirmação"}).click();
 await expect(page.getByText("Se houver uma confirmação pendente, enviaremos um novo e-mail.")).toBeVisible();
 expect(requestBody).toEqual({email:"teste@example.test"});
});
