import type { Metadata } from "next";
import Link from "next/link";
import { LandingButton } from "@/components/landing/landing-button";
import { LandingMobileMenu } from "@/components/landing/landing-mobile-menu";
import { CopilotVisual, FeatureVisual } from "@/components/landing/landing-visuals";

const navItems = [
  { href: "#producto", label: "Producto" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#features", label: "Features" },
];

const features = [
  {
    eyebrow: "Copiloto IA contextual",
    title: "Pregunta sobre un lead sin reconstruir la historia.",
    body: "El chat vive anclado a la empresa, persona u oportunidad. Consulta el contexto, detecta vacíos y propone cambios al CRM con revisión humana.",
    visual: "copilot",
  },
  {
    eyebrow: "Recomendaciones con contexto",
    title: "Cada sugerencia llega con la evidencia que la sostiene.",
    body: "Documentos, notas e historial enriquecen el perfil comercial para sugerir cómo proceder sin convertir el CRM en una caja negra.",
    visual: "evidence",
  },
  {
    eyebrow: "Meeting Intelligence",
    title: "Convierte reuniones y documentos en propuestas claras.",
    body: "Audio, video y PDF pasan por análisis para extraer dolores, contactos, próximos pasos y cambios sugeridos antes de tocar los datos.",
    visual: "meeting",
  },
  {
    eyebrow: "Pipeline limpio",
    title: "La IA propone. El equipo mantiene el control.",
    body: "Empresas, personas, oportunidades y etapas se mantienen ordenadas. Nada se escribe en el pipeline sin que alguien lo revise y apruebe.",
    visual: "pipeline",
  },
];

export const metadata: Metadata = {
  title: "CRM Zalantos | Copiloto IA para equipos B2B",
  description:
    "CRM comercial B2B con un copiloto de IA que entiende reuniones, documentos e historial para recomendar cómo avanzar cada lead.",
};

export default function RootPage() {
  return (
    <main className="min-h-screen bg-[#fbfbf8] text-[#171717]">
      <header className="sticky top-0 z-40 border-b border-black/[0.07] bg-[#fbfbf8]/90 backdrop-blur-md">
        <nav
          aria-label="Navegación principal"
          className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8"
        >
          <Link
            href="/"
            className="font-display text-xl leading-none font-semibold tracking-normal text-[#171717] outline-none focus-visible:ring-2 focus-visible:ring-[#2d6cdf]/35"
          >
            Zalantos
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-[#4a4a45] transition-colors hover:text-[#171717] focus-visible:ring-2 focus-visible:ring-[#2d6cdf]/35 focus-visible:outline-none"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <LandingButton href="#demo" variant="primary">
              Solicitar demo
            </LandingButton>
          </div>

          <LandingMobileMenu items={navItems} />
        </nav>
      </header>

      <section className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-12 px-5 py-14 md:grid-cols-[0.95fr_1.05fr] md:px-8 md:py-20">
        <div className="max-w-3xl space-y-8">
          <div className="space-y-5">
            <p className="font-display text-3xl leading-none font-semibold text-[#171717] md:text-4xl">
              CRM Zalantos
            </p>
            <h1 className="font-display max-w-4xl text-5xl leading-[0.95] font-semibold tracking-normal text-balance md:text-7xl">
              El copiloto que sabe qué hacer con cada lead
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-[#55554f] md:text-xl">
              La IA usa reuniones, documentos e historial para sugerir el
              siguiente paso. Tú decides qué aplicar.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <LandingButton href="#demo" variant="primary" size="large">
              Solicitar demo
            </LandingButton>
            <LandingButton href="#como-funciona" variant="secondary" size="large">
              Ver cómo funciona
            </LandingButton>
          </div>
        </div>

        <CopilotVisual />
      </section>

      <section
        id="producto"
        className="border-y border-black/[0.07] bg-white px-5 py-20 md:px-8"
      >
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[0.7fr_1.3fr] md:items-end">
          <p className="text-sm font-medium tracking-[0.18em] text-[#2d6cdf] uppercase">
            El problema
          </p>
          <h2 className="font-display max-w-4xl text-4xl leading-[1.04] font-semibold text-balance md:text-6xl">
            Los equipos comerciales saltan entre notas, grabaciones y el CRM.
            El siguiente paso del lead se improvisa.
          </h2>
        </div>
      </section>

      <section id="features" className="px-5 py-10 md:px-8">
        <div className="mx-auto max-w-7xl">
          {features.map((feature, index) => (
            <section
              key={feature.eyebrow}
              className="landing-reveal grid gap-10 border-b border-black/[0.07] py-20 last:border-b-0 md:grid-cols-2 md:items-center md:gap-16"
            >
              <div className={index % 2 === 1 ? "md:order-2" : undefined}>
                <p className="mb-5 text-sm font-medium tracking-[0.18em] text-[#2d6cdf] uppercase">
                  {feature.eyebrow}
                </p>
                <h2 className="font-display max-w-xl text-4xl leading-[1.04] font-semibold text-balance md:text-5xl">
                  {feature.title}
                </h2>
                <p className="mt-6 max-w-xl text-lg leading-8 text-[#55554f]">
                  {feature.body}
                </p>
              </div>
              <FeatureVisual kind={feature.visual} />
            </section>
          ))}
        </div>
      </section>

      <section
        id="como-funciona"
        className="border-y border-black/[0.07] bg-[#111] px-5 py-20 text-white md:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="mb-5 text-sm font-medium tracking-[0.18em] text-[#8fb2ff] uppercase">
              Cómo funciona
            </p>
            <h2 className="font-display text-4xl leading-[1.04] font-semibold text-balance md:text-6xl">
              Tres movimientos para pasar de contexto disperso a avance claro.
            </h2>
          </div>

          <ol className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              "Centraliza leads, reuniones y documentos.",
              "El copiloto lee el contexto y recomienda el siguiente movimiento.",
              "Revisas y aplicas solo lo que tiene sentido.",
            ].map((step, index) => (
              <li key={step} className="border-t border-white/18 pt-6">
                <span className="font-display text-5xl text-[#8fb2ff]">
                  0{index + 1}
                </span>
                <p className="mt-6 text-xl leading-8 text-white/82">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-5 py-20 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[0.8fr_1.2fr] md:items-center">
          <h2 className="font-display text-4xl leading-[1.04] font-semibold md:text-5xl">
            Diseñado para equipos B2B que necesitan criterio, no ruido.
          </h2>
          <p className="text-xl leading-9 text-[#55554f]">
            CRM Zalantos mantiene el principio de control humano: la IA puede
            leer contexto, preparar propuestas y explicar por qué recomienda un
            cambio. Nada se escribe sin revisión.
          </p>
        </div>
      </section>

      <section id="demo" className="bg-white px-5 py-20 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 border-t border-black/[0.09] pt-14 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <div>
            <p className="mb-5 text-sm font-medium tracking-[0.18em] text-[#2d6cdf] uppercase">
              Siguiente paso
            </p>
            <h2 className="font-display max-w-3xl text-4xl leading-[1.04] font-semibold text-balance md:text-6xl">
              Evalúa cada lead con el contexto completo delante.
            </h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
            <LandingButton href="/login" variant="primary" size="large">
              Entrar al CRM
            </LandingButton>
            <LandingButton href="#producto" variant="secondary" size="large">
              Revisar producto
            </LandingButton>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/[0.07] px-5 py-8 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-[#66665f] sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-lg font-semibold text-[#171717]">
            Zalantos
          </p>
          <p>CRM B2B con IA contextual y revisión humana.</p>
        </div>
      </footer>
    </main>
  );
}
