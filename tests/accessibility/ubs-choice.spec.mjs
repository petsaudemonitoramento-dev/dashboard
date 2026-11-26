import {expect,test} from "@playwright/test";
test("cadastro permite selecionar outra UBS sem pedir nome, com aviso honesto no preview", async ({page})=>{
 await page.goto("/cadastro");
 const select=page.getByLabel("UBS",{exact:true});
 await expect(select.locator('option[value="outra"]')).toHaveText("Outra UBS / unidade não cadastrada");
 await select.selectOption("outra");
 await expect(select).toHaveValue("outra");
 await expect(page.getByText("Nesta prévia, a opção ainda não permite concluir o cadastro.",{exact:false})).toBeVisible();
});