# Contexto del proyecto — CRM Zalantos

## Qué hace

CRM B2B multi-tenant que permite a cada organización gestionar empresas,
personas, oportunidades, actividades, notas y reuniones. Incluye:

- **Pipeline configurable** por etapas (`PipelineStage`).
- **Meeting Intelligence**: subir evidencia (audio, video, PDF, etc.), transcribir,
  analizar con IA y generar propuestas de cambio al CRM para revisión humana.
- **Agente IA copiloto**: chat contextual con herramientas de lectura/escritura
  del CRM y propuestas de cambio.
- **Workflows**: automatización por eventos de entidades.
- **Gateway de integraciones**: despacho de eventos a un webhook externo (email,
  Slack, etc. vía n8n u otro).

## Para quién

- Equipos comerciales de clientes Zalantos (tenants).
- Staff Zalantos como super-admins de plataforma.

## Problema de negocio

Unificar pipeline comercial, inteligencia de reuniones y automatización en una
sola aplicación con aislamiento multi-tenant y trazabilidad de cambios
propuestos por IA.

## Usuarios principales

| Rol | Capacidades |
|-----|-------------|
| MEMBER | CRM operativo (empresas, personas, oportunidades, reuniones, agente) |
| ADMIN | + configuración (usuarios, equipo, campos, workflows, etapas, org) |
| Super-admin | Gestión de organizaciones en `/superadmin` |

## Flujos principales

1. **Pipeline comercial**: crear empresa → personas → oportunidad → actividades.
2. **Reunión con IA**: crear meeting → subir evidencia → pipeline automático →
   revisar propuesta → aplicar cambios al CRM.
3. **Agente**: abrir chat en contexto de entidad → consultar/actualizar CRM →
   revisar propuestas del agente.
4. **Workflows**: evento en entidad → evaluar condiciones → ejecutar acciones
   (ej. crear actividad).
5. **Integraciones**: evento de negocio → `IntegrationDelivery` → webhook externo.

## Stack

Next.js 16, React 19, Prisma 7, PostgreSQL, Auth.js v5, Vercel AI SDK, Groq,
Cloudflare R2, Tailwind/shadcn.

## Estado actual

Versión 0.1.0 en desarrollo activo. Funcional en local y desplegable en Railway
(supuesto: plataforma principal según comentarios en `.env.example`).

## Qué no debe cambiar sin autorización

- Modelo multi-tenant (`organizationId` en todas las entidades de tenant).
- Doble barrera de aislamiento (filtro app + RLS opcional).
- Flujo de propuestas CRM (revisión humana antes de aplicar).
- Separación `prismaSystem` vs cliente tenant (`forOrg`).
- Migraciones ya aplicadas en producción.

## Decisiones clave

- Etapas de pipeline como filas configurables, no enum fijo.
- Propuestas de cambio (`CRMChangeProposal` / `CRMChangeItem`) con estados y
  reversión.
- Gateway único externo para integraciones; el CRM conserva dedupe y auditoría.
- Credenciales locales (email/password); sin OAuth social en v1.

## Gaps

- GAP: estrategia de billing/suscripciones.
- GAP: tests automatizados.
- GAP: documentación de infra Railway versionada.
- GAP: observabilidad centralizada (APM, alertas).
