"use client";

import {
  useActionState,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  saveCommercialOffer,
  type CommercialFormState,
} from "@/app/(dashboard)/commercial/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";

type LineItem = {
  type: string;
  description: string;
  quantity?: number;
  amount: number;
  pricingUnit: string;
  frequency?: string;
  startMonth?: number;
  endMonth?: number;
  billingTrigger?: string;
};

type OfferDocument = {
  name: string;
  documentType?: string;
  externalUrl?: string;
  entityContextSourceId?: string;
  versionLabel?: string;
  notes?: string;
};

type Share = {
  beneficiaryType: "organization" | "partner";
  commercialPartnerId?: string;
  beneficiaryNameSnapshot: string;
  percentage: number;
};

export type CommercialOfferFormValue = {
  id: string;
  status: string;
  offerorName: string;
  presenterTeamMemberId: string | null;
  presenterNameSnapshot: string | null;
  productName: string | null;
  sentAt: string;
  validBusinessDays: number | null;
  validUntil: string;
  pricingUnit: string;
  plusVat: boolean;
  exchangeRateToClp: string;
  exchangeRateDate: string;
  exchangeRateSource: string | null;
  executiveSummary: string | null;
  painSummary: string | null;
  solutionSummary: string | null;
  implementationPlan: string | null;
  outOfScope: string | null;
  commercialTerms: string | null;
  risks: string | null;
  nextSteps: string | null;
  economicScope: string | null;
  economicScopeLabel: string | null;
  economicBaseNetAmount: string;
  projectCostAmount: string;
  distributableProfitAmount: string;
  lineItems: LineItem[];
  documents: OfferDocument[];
  profitShares: Share[];
};

type PartnerOption = {
  id: string;
  name: string;
  defaultPercentage: number;
};

export function CommercialOfferForm({
  opportunityId,
  organizationName,
  teamMembers,
  partners,
  contextSources,
  offer,
  readOnly = false,
}: {
  opportunityId: string;
  organizationName: string;
  teamMembers: Array<{ id: string; name: string }>;
  partners: PartnerOption[];
  contextSources: Array<{ id: string; name: string }>;
  offer?: CommercialOfferFormValue;
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState<CommercialFormState, FormData>(
    saveCommercialOffer,
    undefined,
  );
  const [pricingUnit, setPricingUnit] = useState(offer?.pricingUnit ?? "UF");
  const [baseAmount, setBaseAmount] = useState(
    offer?.economicBaseNetAmount ?? "",
  );
  const [costAmount, setCostAmount] = useState(offer?.projectCostAmount ?? "");
  const [profitAmount, setProfitAmount] = useState(
    offer?.distributableProfitAmount ?? "",
  );
  const [lineItems, setLineItems] = useState<LineItem[]>(
    offer?.lineItems ?? [],
  );
  const [documents, setDocuments] = useState<OfferDocument[]>(
    offer?.documents ?? [],
  );
  const defaultShares = useMemo<Share[]>(() => {
    if (offer?.profitShares.length) return offer.profitShares;
    if (partners.length === 0) {
      return [
        {
          beneficiaryType: "organization",
          beneficiaryNameSnapshot: organizationName,
          percentage: 100,
        },
      ];
    }
    const partnerTotal = partners.reduce(
      (sum, partner) => sum + partner.defaultPercentage,
      0,
    );
    return [
      {
        beneficiaryType: "organization",
        beneficiaryNameSnapshot: organizationName,
        percentage: Math.max(0, 100 - partnerTotal),
      },
      ...partners.map((partner) => ({
        beneficiaryType: "partner" as const,
        commercialPartnerId: partner.id,
        beneficiaryNameSnapshot: partner.name,
        percentage: partner.defaultPercentage,
      })),
    ];
  }, [offer, organizationName, partners]);
  const [shares, setShares] = useState(defaultShares);
  const shareTotal = shares.reduce((sum, share) => sum + share.percentage, 0);
  const profitNumber = Number(profitAmount || 0);

  function updateBase(value: string) {
    setBaseAmount(value);
    if (value !== "" && costAmount !== "") {
      setProfitAmount(String(Number(value) - Number(costAmount)));
    }
  }

  function updateCost(value: string) {
    setCostAmount(value);
    if (value !== "" && baseAmount !== "") {
      setProfitAmount(String(Number(baseAmount) - Number(value)));
    }
  }

  function updateProfit(value: string) {
    setProfitAmount(value);
    if (value !== "" && costAmount !== "") {
      setBaseAmount(String(Number(costAmount) + Number(value)));
    }
  }

  return (
    <form action={formAction}>
      <fieldset disabled={readOnly} className="space-y-8">
        <input type="hidden" name="opportunityId" value={opportunityId} />
        {offer && <input type="hidden" name="id" value={offer.id} />}
        <input
          type="hidden"
          name="lineItemsJson"
          value={JSON.stringify(lineItems)}
        />
        <input
          type="hidden"
          name="documentsJson"
          value={JSON.stringify(documents)}
        />
        <input
          type="hidden"
          name="profitSharesJson"
          value={JSON.stringify(shares)}
        />

        <section className="grid gap-4 rounded-md border p-5 sm:grid-cols-2 lg:grid-cols-3">
          <SectionTitle title="Datos de la oferta" />
          <Field
            name="offerorName"
            label="Oferente"
            defaultValue={offer?.offerorName ?? organizationName}
            required
          />
          <Field
            name="productName"
            label="Producto / servicio"
            defaultValue={offer?.productName}
          />
          <SelectField
            name="status"
            label="Estado"
            defaultValue={offer?.status ?? "draft"}
            options={[
              ["draft", "Borrador"],
              ["sent", "Enviada"],
              ["accepted", "Aceptada"],
              ["rejected", "Rechazada"],
              ["expired", "Vencida"],
              ["superseded", "Reemplazada"],
            ]}
          />
          <div className="space-y-2">
            <Label htmlFor="presenterTeamMemberId">Presentador</Label>
            <select
              id="presenterTeamMemberId"
              name="presenterTeamMemberId"
              defaultValue={offer?.presenterTeamMemberId ?? ""}
              className="bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="">Sin definir</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <Field
            name="presenterNameSnapshot"
            label="Nombre del presentador"
            defaultValue={offer?.presenterNameSnapshot}
          />
          <Field
            name="sentAt"
            label="Fecha de envío"
            type="date"
            defaultValue={offer?.sentAt}
          />
          <Field
            name="validBusinessDays"
            label="Vigencia (días hábiles)"
            type="number"
            defaultValue={offer?.validBusinessDays?.toString()}
          />
          <Field
            name="validUntil"
            label="Vencimiento manual"
            type="date"
            defaultValue={offer?.validUntil}
          />
          <div className="space-y-2">
            <Label htmlFor="pricingUnit">Unidad monetaria</Label>
            <Input
              id="pricingUnit"
              name="pricingUnit"
              value={pricingUnit}
              onChange={(event) =>
                setPricingUnit(event.target.value.toUpperCase())
              }
              required
            />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              name="plusVat"
              defaultChecked={offer?.plusVat ?? true}
            />
            Valores más IVA
          </label>
          <Field
            name="exchangeRateToClp"
            label="Valor en CLP de la unidad"
            type="number"
            step="0.000001"
            defaultValue={offer?.exchangeRateToClp}
          />
          <Field
            name="exchangeRateDate"
            label="Fecha valor unidad"
            type="date"
            defaultValue={offer?.exchangeRateDate}
          />
          <Field
            name="exchangeRateSource"
            label="Fuente valor unidad"
            defaultValue={offer?.exchangeRateSource}
          />
        </section>

        <section className="grid gap-4 rounded-md border p-5 sm:grid-cols-2 lg:grid-cols-3">
          <SectionTitle
            title="Costo, utilidad y precio"
            description="No se guarda desglose del costo. Todos los montos son netos y usan la unidad de la oferta."
          />
          <SelectField
            name="economicScope"
            label="Alcance"
            defaultValue={offer?.economicScope ?? "implementation"}
            options={[
              ["implementation", "Implementación"],
              ["first_year", "Año 1"],
              ["custom", "Otro"],
            ]}
          />
          <Field
            name="economicScopeLabel"
            label="Etiqueta del alcance"
            defaultValue={offer?.economicScopeLabel}
          />
          <div />
          <ControlledMoney
            label="Precio neto"
            name="economicBaseNetAmount"
            value={baseAmount}
            onChange={updateBase}
            unit={pricingUnit}
          />
          <ControlledMoney
            label="Costo del proyecto"
            name="projectCostAmount"
            value={costAmount}
            onChange={updateCost}
            unit={pricingUnit}
          />
          <ControlledMoney
            label="Utilidad a dividir"
            name="distributableProfitAmount"
            value={profitAmount}
            onChange={updateProfit}
            unit={pricingUnit}
          />
        </section>

        <section className="space-y-4 rounded-md border p-5">
          <SectionTitle
            title="Reparto de utilidad"
            description="Los porcentajes deben sumar exactamente 100%."
          />
          <div
            className={
              shareTotal === 100
                ? "text-sm text-emerald-700"
                : "text-destructive text-sm"
            }
          >
            Total asignado: {shareTotal}%
          </div>
          {shares.map((share, index) => (
            <div
              key={`${share.beneficiaryType}-${share.commercialPartnerId ?? "org"}`}
              className="grid items-end gap-3 sm:grid-cols-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {share.beneficiaryNameSnapshot}
                </p>
                <p className="text-muted-foreground text-xs">
                  {share.beneficiaryType === "organization"
                    ? "Organización"
                    : "Partner"}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Porcentaje</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={share.percentage}
                  onChange={(event) =>
                    setShares((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, percentage: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="pb-2 text-sm font-medium">
                Monto proyectado:{" "}
                {Number.isFinite(profitNumber)
                  ? ((profitNumber * share.percentage) / 100).toLocaleString(
                      "es-CL",
                      { maximumFractionDigits: 4 },
                    )
                  : "0"}{" "}
                {pricingUnit}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-4 rounded-md border p-5">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle title="Partidas comerciales" />
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setLineItems((current) => [
                  ...current,
                  { type: "other", description: "", amount: 0, pricingUnit },
                ])
              }
            >
              Agregar partida
            </Button>
          </div>
          {lineItems.map((item, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Input
                placeholder="Tipo"
                value={item.type}
                onChange={(event) =>
                  updateLineItem(setLineItems, index, {
                    type: event.target.value,
                  })
                }
              />
              <Input
                className="sm:col-span-2 lg:col-span-3"
                placeholder="Descripción"
                value={item.description}
                onChange={(event) =>
                  updateLineItem(setLineItems, index, {
                    description: event.target.value,
                  })
                }
              />
              <Input
                type="number"
                min="0"
                step="0.0001"
                placeholder="Cantidad"
                value={item.quantity ?? ""}
                onChange={(event) =>
                  updateLineItem(setLineItems, index, {
                    quantity: optionalNumber(event.target.value),
                  })
                }
              />
              <Input
                type="number"
                min="0"
                step="0.0001"
                placeholder="Monto"
                value={item.amount}
                onChange={(event) =>
                  updateLineItem(setLineItems, index, {
                    amount: Number(event.target.value),
                  })
                }
              />
              <Input
                placeholder="Unidad (UF/CLP/USD)"
                value={item.pricingUnit}
                onChange={(event) =>
                  updateLineItem(setLineItems, index, {
                    pricingUnit: event.target.value.toUpperCase(),
                  })
                }
              />
              <Input
                placeholder="Frecuencia"
                value={item.frequency ?? ""}
                onChange={(event) =>
                  updateLineItem(setLineItems, index, {
                    frequency: event.target.value || undefined,
                  })
                }
              />
              <Input
                type="number"
                min="1"
                placeholder="Mes inicial"
                value={item.startMonth ?? ""}
                onChange={(event) =>
                  updateLineItem(setLineItems, index, {
                    startMonth: optionalNumber(event.target.value),
                  })
                }
              />
              <Input
                type="number"
                min="1"
                placeholder="Mes final"
                value={item.endMonth ?? ""}
                onChange={(event) =>
                  updateLineItem(setLineItems, index, {
                    endMonth: optionalNumber(event.target.value),
                  })
                }
              />
              <Input
                className="sm:col-span-2"
                placeholder="Hito o condición de cobro"
                value={item.billingTrigger ?? ""}
                onChange={(event) =>
                  updateLineItem(setLineItems, index, {
                    billingTrigger: event.target.value || undefined,
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setLineItems((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                Quitar
              </Button>
            </div>
          ))}
        </section>

        <section className="grid gap-4 rounded-md border p-5 sm:grid-cols-2">
          <SectionTitle title="Contenido comercial" />
          <TextAreaField
            name="executiveSummary"
            label="Resumen ejecutivo"
            defaultValue={offer?.executiveSummary}
          />
          <TextAreaField
            name="painSummary"
            label="Dolor"
            defaultValue={offer?.painSummary}
          />
          <TextAreaField
            name="solutionSummary"
            label="Solución propuesta"
            defaultValue={offer?.solutionSummary}
          />
          <TextAreaField
            name="implementationPlan"
            label="Implementación"
            defaultValue={offer?.implementationPlan}
          />
          <TextAreaField
            name="outOfScope"
            label="Fuera de alcance"
            defaultValue={offer?.outOfScope}
          />
          <TextAreaField
            name="commercialTerms"
            label="Condiciones comerciales"
            defaultValue={offer?.commercialTerms}
          />
          <TextAreaField
            name="risks"
            label="Riesgos"
            defaultValue={offer?.risks}
          />
          <TextAreaField
            name="nextSteps"
            label="Próximos pasos"
            defaultValue={offer?.nextSteps}
          />
        </section>

        <section className="space-y-4 rounded-md border p-5">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle title="Documentos" />
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setDocuments((current) => [
                  ...current,
                  { name: "", externalUrl: "" },
                ])
              }
            >
              Agregar documento
            </Button>
          </div>
          {documents.map((document, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Input
                placeholder="Nombre"
                value={document.name}
                onChange={(event) =>
                  updateDocument(setDocuments, index, {
                    name: event.target.value,
                  })
                }
              />
              <Input
                placeholder="Tipo de documento"
                value={document.documentType ?? ""}
                onChange={(event) =>
                  updateDocument(setDocuments, index, {
                    documentType: event.target.value || undefined,
                  })
                }
              />
              <Input
                placeholder="Versión"
                value={document.versionLabel ?? ""}
                onChange={(event) =>
                  updateDocument(setDocuments, index, {
                    versionLabel: event.target.value || undefined,
                  })
                }
              />
              <Input
                placeholder="URL"
                value={document.externalUrl ?? ""}
                onChange={(event) =>
                  updateDocument(setDocuments, index, {
                    externalUrl: event.target.value,
                  })
                }
              />
              <select
                value={document.entityContextSourceId ?? ""}
                onChange={(event) =>
                  updateDocument(setDocuments, index, {
                    entityContextSourceId: event.target.value || undefined,
                  })
                }
                className="bg-background h-9 rounded-md border px-3 text-sm"
              >
                <option value="">Sin archivo de Contexto</option>
                {contextSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
              <Input
                className="sm:col-span-2"
                placeholder="Notas"
                value={document.notes ?? ""}
                onChange={(event) =>
                  updateDocument(setDocuments, index, {
                    notes: event.target.value || undefined,
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setDocuments((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                Quitar
              </Button>
            </div>
          ))}
        </section>

        {state && "error" in state && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
        {!readOnly && (
          <SubmitButton>
            {offer ? "Guardar oferta" : "Crear oferta"}
          </SubmitButton>
        )}
      </fieldset>
    </form>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <h2 className="font-medium">{title}</h2>
      {description && (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  step,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  type?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue ?? ""}
        required={required}
      />
    </div>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: Array<[string, string]>;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="bg-background h-9 w-full rounded-md border px-3 text-sm"
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function ControlledMoney({
  label,
  name,
  value,
  onChange,
  unit,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label} ({unit})
      </Label>
      <Input
        id={name}
        name={name}
        type="number"
        min="0"
        step="0.0001"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function TextAreaField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        name={name}
        rows={5}
        defaultValue={defaultValue ?? ""}
      />
    </div>
  );
}

function updateLineItem(
  setter: Dispatch<SetStateAction<LineItem[]>>,
  index: number,
  patch: Partial<LineItem>,
) {
  setter((current) =>
    current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item,
    ),
  );
}

function updateDocument(
  setter: Dispatch<SetStateAction<OfferDocument[]>>,
  index: number,
  patch: Partial<OfferDocument>,
) {
  setter((current) =>
    current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item,
    ),
  );
}

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}
