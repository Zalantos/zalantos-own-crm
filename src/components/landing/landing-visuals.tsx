import { cn } from "@/lib/utils";

type FeatureVisualProps = {
  kind: string;
};

const visualCopy = {
  copilot: {
    label: "Copiloto",
    title: "Recomendación para Norte Labs",
    lines: ["Dolor principal: visibilidad del pipeline", "Riesgo: decisión sin sponsor claro"],
    action: "Proponer tarea con responsable",
  },
  evidence: {
    label: "Evidencia",
    title: "Contexto conectado",
    lines: ["PDF comercial revisado", "Nota de llamada incorporada"],
    action: "Sugerir siguiente paso",
  },
  meeting: {
    label: "Reunión",
    title: "Análisis pendiente de revisión",
    lines: ["Contacto nuevo detectado", "Próximo paso mencionado al cierre"],
    action: "Preparar propuesta CRM",
  },
  pipeline: {
    label: "Pipeline",
    title: "Cambio listo para aprobar",
    lines: ["Etapa sugerida: Evaluación", "Fecha de seguimiento propuesta"],
    action: "Mantener bajo revisión humana",
  },
};

export function CopilotVisual() {
  return (
    <div
      aria-label="Mockup editorial de ficha de lead con recomendación del copiloto"
      className="landing-reveal relative min-h-[470px] overflow-hidden rounded-[2rem] border border-black/[0.08] bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.07)] md:min-h-[560px] md:p-7"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-[#2d6cdf]" />
      <div className="grid gap-5 md:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-3xl border border-black/[0.07] bg-[#fbfbf8] p-5">
          <p className="text-xs font-medium tracking-[0.18em] text-[#2d6cdf] uppercase">
            Ficha de lead
          </p>
          <h2 className="mt-7 font-display text-3xl leading-tight font-semibold">
            Norte Labs
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#66665f]">
            Oportunidad B2B en evaluación. Última reunión con dirección
            comercial y operaciones.
          </p>

          <div className="mt-8 space-y-4">
            {[
              ["Dolor", "Forecast disperso entre equipos"],
              ["Documento", "Propuesta revisada"],
              ["Próximo paso", "Validar sponsor interno"],
            ].map(([label, value]) => (
              <div key={label} className="border-t border-black/[0.07] pt-4">
                <p className="text-xs text-[#85857d]">{label}</p>
                <p className="mt-1 text-sm font-medium text-[#292925]">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-3xl border border-black/[0.07] bg-[#111] p-5 text-white">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-[#8fb2ff] uppercase">
              Copiloto
            </p>
            <p className="mt-8 max-w-sm font-display text-3xl leading-tight font-semibold">
              Recomiendo avanzar con una reunión de validación.
            </p>
            <p className="mt-4 text-sm leading-6 text-white/70">
              Hay evidencia de interés, pero falta confirmar quién aprueba y qué
              criterio usará operaciones.
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-white/12 bg-white/[0.04] p-4">
            <p className="text-xs text-white/52">Propuesta pendiente</p>
            <p className="mt-2 text-sm leading-6 text-white/88">
              Crear tarea para contactar sponsor antes del viernes y actualizar
              el próximo paso del lead.
            </p>
            <div className="mt-5 flex gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#111]">
                Revisar
              </span>
              <span className="rounded-full border border-white/18 px-3 py-1 text-xs text-white/74">
                No aplicar aún
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {["Reunión", "Documento", "Historial"].map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-black/[0.07] bg-[#fbfbf8] px-4 py-3 text-sm text-[#55554f]"
          >
            {item} conectado
          </div>
        ))}
      </div>
    </div>
  );
}

export function FeatureVisual({ kind }: FeatureVisualProps) {
  const copy = visualCopy[kind as keyof typeof visualCopy] ?? visualCopy.copilot;

  return (
    <div className="rounded-[2rem] border border-black/[0.08] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.045)]">
      <div className="rounded-3xl border border-black/[0.07] bg-[#fbfbf8] p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-medium tracking-[0.18em] text-[#2d6cdf] uppercase">
            {copy.label}
          </p>
          <span className="h-px flex-1 bg-black/[0.08]" />
        </div>
        <h3 className="mt-8 font-display text-3xl leading-tight font-semibold">
          {copy.title}
        </h3>
        <div className="mt-8 space-y-3">
          {copy.lines.map((line, index) => (
            <div
              key={line}
              className={cn(
                "rounded-2xl border border-black/[0.07] bg-white p-4 text-sm text-[#454540]",
                index === 1 && "ml-8",
              )}
            >
              {line}
            </div>
          ))}
        </div>
        <div className="mt-8 border-t border-black/[0.08] pt-5">
          <p className="text-xs text-[#85857d]">Acción sugerida</p>
          <p className="mt-2 text-base font-medium text-[#171717]">
            {copy.action}
          </p>
        </div>
      </div>
    </div>
  );
}
