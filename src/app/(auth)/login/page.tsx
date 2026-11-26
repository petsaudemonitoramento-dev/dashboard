import {LoginBrandPanel,LoginInstitutionalCredits} from "@/components/auth/login-brand-panel";
import {LoginForm} from "@/components/auth/login-form";
import {GestarioIntro} from "@/components/auth/gestario-intro";
import {LoginCompliance} from "@/components/auth/login-compliance";
export default function Page(){return <main className="login-page ga-login-page"><LoginBrandPanel/><section className="access ga-login-access"><LoginForm/></section><footer className="ga-login-bottom"><LoginInstitutionalCredits/><LoginCompliance/><div className="ga-login-replay"><GestarioIntro/></div></footer></main>}
