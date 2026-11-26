import {LoginBrandPanel} from "@/components/auth/login-brand-panel";
import {LoginForm} from "@/components/auth/login-form";
import {GestarioIntro} from "@/components/auth/gestario-intro";
import {LoginCompliance} from "@/components/auth/login-compliance";
export default function Page(){return <main className="login-page ga-login-page"><LoginBrandPanel/><section className="access ga-login-access"><LoginForm/><GestarioIntro/></section><LoginCompliance/></main>}
