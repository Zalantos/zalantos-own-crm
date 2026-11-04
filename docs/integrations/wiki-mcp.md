# Wiki corporativa vía MCP

El copiloto del CRM consulta la Wiki de zalantos en tiempo real. El CRM sigue
siendo la verdad comercial estructurada; la Wiki aporta el conocimiento
documental, incluido lo que indexa desde SharePoint. No se copian documentos ni
embeddings al CRM y la Wiki es de solo lectura desde aquí.

## Cómo funciona

```text
Usuario → agente (web o Telegram)
  → wiki_search_knowledge / wiki_read_document     src/lib/agent/tools/wiki.ts
  → authorizeWikiAccess (organización, usuario, canal)
  → cliente MCP con lista blanca                   src/lib/wiki-mcp/client.ts
  → Bearer: WIKI_MCP_TOKEN, o Entra si no existe
  → <WIKI_MCP_BASE_URL>/mcp (Streamable HTTP)
  ← fragmentos con título y enlace → respuesta con citas
```

| Tool del agente | Herramienta remota | Parámetros remotos |
| --- | --- | --- |
| `wiki_search_knowledge` | `search_knowledge` | `query`, `client_id?`, `project_id?`, `limit` |
| `wiki_read_document` | `read_document` | `document_id` (UUID) |

El servidor publica más herramientas (`propose_*`, `create_page`, `update_page`,
etc.): `WIKI_ALLOWED_TOOLS` las deja fuera y nunca se listan al modelo. Las tools
de Wiki no se registran en el MCP público del CRM (`/api/mcp`).

### Vínculo con la empresa

`Company.wikiClientId` guarda el `client_id` de la Wiki. Lo edita un ADMIN en el
formulario de empresa, solo en organizaciones habilitadas; el agente no puede
cambiarlo porque no está en `field-registry`.

Con una empresa en contexto se hacen hasta dos búsquedas:

1. Con `client_id`, si hay `wikiClientId`.
2. Sin filtro, anteponiendo el nombre de la empresa, porque un documento de
   SharePoint puede no tener `client_id`.

Cada resultado indica cómo se vinculó (`clientMatch`):

| Valor | Significado |
| --- | --- |
| `client_id` | La Wiki lo etiquetó con ese cliente. Verificable |
| `name_mention` | El nombre aparece en título, ruta o fragmento. Sin confirmar |
| `unverified` | Lo trajo la búsqueda por nombre; nada confirma el vínculo |

La empresa sale de la ficha abierta (empresa, persona, oportunidad, prospecto,
lead) o de un `companyId` que se resuelve contra la base del tenant. El modelo
nunca envía un `client_id`. `companyId=null` busca conocimiento general.
`wikiProjectId` solo se acepta si salió de un documento leído en el mismo turno,
porque el CRM no guarda proyectos de la Wiki.

### Enlaces

SharePoint entrega una URL absoluta. Las páginas de la Wiki entregan una ruta
(`/p/...`) que se resuelve contra `WIKI_MCP_BASE_URL` (supuesto: la web de la Wiki
se sirve en ese dominio). Otros esquemas se descartan y `url` queda en `null`.

## Control de acceso

La credencial de la Wiki ve lo mismo sea quien sea el usuario del CRM, así que el
acceso se decide en el CRM, en `src/lib/wiki-mcp/authorization.ts`, en cada llamada:

- La organización debe estar en `WIKI_MCP_ALLOWED_ORG_IDS`. Vacía o sin definir, la
  integración queda apagada para todos.
- El usuario debe existir, pertenecer a esa organización y estar activo, igual que
  la organización. Telegram no lo comprueba al resolver el vínculo.
- El canal debe ser `web` o `telegram`.

Un tenant no autorizado no recibe las tools ni la sección del prompt.

**Las ACL por usuario del CRM no aplican.** Todo usuario de la organización
autorizada ve lo que ve la credencial configurada: con `WIKI_MCP_TOKEN`, todo lo que
puede leer la persona dueña del token.

Un filtro por nombre nunca es control de acceso: lo que se puede leer lo deciden
`authorizeWikiAccess` y las ACL de la Wiki.

## Contenido no confiable

- El prompt trata todo lo recuperado como datos, nunca como instrucciones.
- `guardCriticalWikiActions` no depende del modelo: si en el turno entró contenido
  de la Wiki, no ejecuta `change_stage`, `set_opportunity_status`,
  `convert_lead_to_opportunity`, `confirm_pending_proposal` ni un
  `update_record_fields` que toque `stage`. Devuelve `confirmation_required` y la
  confirmación del usuario llega en un turno nuevo.
- El chat web quita el texto de la Wiki de los mensajes que reenvía el navegador,
  para que un documento de un turno anterior no siga a la vista del modelo.
- `agent_chat_messages` guarda solo la cita (`documentId`, título, enlace). El texto
  no se persiste; el agente relee el documento si lo necesita. Lo que quede en la
  respuesta escrita por el agente sí se guarda, como cualquier mensaje.

## Fallos

La Wiki es una dependencia externa: un fallo vuelve a la tool como resultado y el
agente sigue con el CRM.

| `error_type` | Causa | Qué revisar |
| --- | --- | --- |
| `not_configured` | Falta una variable, o la URL no es https en producción | Variables de entorno |
| `access_denied` | Organización, usuario o canal no autorizados en el CRM | `WIKI_MCP_ALLOWED_ORG_IDS` |
| `unauthorized` | La Wiki rechazó el token (caducó o se revocó), o Entra rechazó las credenciales | `WIKI_MCP_TOKEN`; con Entra, secreto y `WIKI_ENTRA_RESOURCE` |
| `forbidden` | Rol ausente, host rechazado, o documento fuera de la ACL o inexistente | `MCP_ALLOWED_HOSTS`, rol `knowledge.read` |
| `not_found` | El documento ya no existe | — |
| `rate_limited` | Límite por actor de la Wiki | `MCP_RATE_LIMIT_PER_MINUTE` |
| `timeout` | Sin respuesta en `WIKI_MCP_TIMEOUT_MS` | Estado de la Wiki |
| `unavailable` | Red, 5xx, o endpoint inexistente (404 HTTP) | `WIKI_MCP_BASE_URL`, `MCP_ENABLED` |
| `invalid_response` | Respuesta malformada, o la Wiki dejó de publicar una herramienta | Contrato de `schemas.ts` |

`no_evidence: true` no es un error. Ojo: **la Wiki responde igual si la identidad no
tiene espacios asignados**. Si todo devuelve "sin evidencia", revisá primero los
permisos de la credencial.

Los logs (`[wiki-mcp]`) registran herramienta, duración, estado y tipo de error.
Nunca consultas, texto recuperado ni tokens.

Con Entra, el token vive en memoria del proceso, se renueva 60 s antes de caducar y
un 401 se reintenta una sola vez con uno nuevo. La conexión MCP se comparte entre peticiones
y se descarta ante un fallo de red o de autenticación.

## Configuración

### Opción A: token de la Wiki (la más simple)

1. En la web de la Wiki: **Conectar asistente → Crear token** (`zwiki_…`). Se muestra
   una sola vez.
2. Cargar en el CRM:

   | Variable | Valor |
   | --- | --- |
   | `WIKI_MCP_BASE_URL` | `https://<dominio-wiki>`, sin `/mcp` |
   | `WIKI_MCP_TOKEN` | El token |
   | `WIKI_MCP_ALLOWED_ORG_IDS` | `id` de la organización zalantos en el CRM |
   | `WIKI_MCP_TIMEOUT_MS` | Opcional, default `8000` |

3. En la Wiki, confirmar que `MCP_ENABLED=true` y que `MCP_ALLOWED_HOSTS` incluye el
   dominio.

Qué implica:

- **Caduca** a los 365 días (`PERSONAL_TOKEN_TTL_DAYS` en la Wiki). Al vencer, el agente avisa
  que la Wiki rechazó la credencial y sigue con el CRM hasta que se cargue otro.
- Actúa **como esa persona**: todo el equipo ve lo que ella puede leer, y si pierde el
  acceso, la integración se corta.
- El token tiene también permisos de escritura. El CRM no los usa (lista blanca),
  pero si el token se filtra, sirve para escribir en la Wiki. Guardalo como secreto y
  revocalo si hay dudas.
- Comparte con esa persona el límite de peticiones por minuto.

### Opción B: identidad de servicio de Entra

No caduca a mano, queda limitada a `knowledge.read` y no depende de una persona. Se
usa solo si `WIKI_MCP_TOKEN` está vacío. El detalle del lado Wiki está en su
`docs/operations.md`, Paso 7.

1. **Entra:** crear un registro propio, con un secreto y solo el permiso de aplicación
   `knowledge.read` sobre la API de la Wiki, con consentimiento de administrador.
2. **CRM:** cargar `WIKI_ENTRA_TENANT_ID`, `WIKI_ENTRA_CLIENT_ID`,
   `WIKI_ENTRA_CLIENT_SECRET` y `WIKI_ENTRA_RESOURCE` (normalmente `api://<GUID>`, no
   Microsoft Graph). El token se pide con `{WIKI_ENTRA_RESOURCE}/.default`.
3. **Wiki:** obtener `actor_id` con `GET /v1/me`, agregarlo a `politica.json` con los
   espacios necesarios y comprobar que `spaces` ya no sale vacío.

### Despliegue

Aplicar la migración `20261106120000_company_wiki_client_id` con
`npm run prisma:migrate:deploy` antes de iniciar la versión nueva. Es aditiva: una
columna nullable y un índice único.

## Verificación con la Wiki real

1. Abrir el copiloto en una oportunidad con `wikiClientId` y preguntar "¿Qué
   acordamos en nuestra última reunión?". Debe mostrar el chip "Consultó la Wiki" y
   citar título y enlace, sin pedir el nombre del cliente.
2. Abrir el enlace citado: debe llevar al documento correcto.
3. Revisar que el log muestre `[wiki-mcp]` con `status: success`.
4. Preguntar por un cliente que no existe: debe decir que no encontró evidencia.
5. Pedir un dato solo del CRM: no debe consultar la Wiki.
6. Con un usuario de otra organización: no debe aparecer ninguna tool de Wiki.
7. Cambiar temporalmente `WIKI_MCP_BASE_URL` por un host inválido: debe avisar que la
   Wiki no está disponible y seguir respondiendo con el CRM.

### Preguntas comerciales

| # | Pregunta | Comportamiento esperado |
| --- | --- | --- |
| 1 | ¿Qué acordamos en la última reunión con Prisma? | Busca, lee la minuta más reciente, cita |
| 2 | ¿Qué documentación tenemos de Traza? | Busca por empresa y lista con enlaces |
| 3 | ¿Qué condiciones se definieron en el contrato de APV? | Lee el contrato y cita. Sin `wikiClientId`, advierte si no puede confirmar |
| 4 | ¿Qué problema quería resolver Induquim? | Busca y cita |
| 5 | ¿Qué compromisos quedaron pendientes con un cliente? | Wiki más actividades del CRM, separados |
| 6 | ¿Qué antecedentes tenemos de una oportunidad? | Usa la ficha; CRM más Wiki |
| 7 | ¿Qué deberíamos hacer después con esta oportunidad? | CRM más Wiki; sugiere, no ejecuta |
| 8 | ¿Qué proyectos similares hemos realizado? | Búsqueda general, `companyId=null` |
| 9 | ¿Qué procedimiento seguimos para preparar propuestas? | Búsqueda general aunque esté en una ficha |
| 10 | ¿Existe un contrato sobre un cliente inexistente? | Dice que no hay evidencia; no inventa |

## Extensión futura

- Otra organización: agregarla a `WIKI_MCP_ALLOWED_ORG_IDS` solo con una identidad y
  espacios propios; hoy todas compartirían la identidad corporativa.
- Permisos por rol o grupo: `WIKI_ALLOWED_ROLES` en `authorization.ts` es el único
  punto a cambiar.
