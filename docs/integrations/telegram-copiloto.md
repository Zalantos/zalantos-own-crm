# Integración Telegram ↔ Copiloto CRM

Canal para conversar con el copiloto IA del CRM desde Telegram. **n8n actúa como
cartero**: recibe el mensaje de Telegram (texto o voz), transcribe la voz si hace
falta, y llama a nuestro backend por HTTP. Toda la lógica del agente y del
multi-tenant vive en el backend.

## Modelo de identidad

El vínculo es `telegram_chat_id ↔ User.id`; de ahí se deriva `organizationId`.
Un mensaje de Telegram no trae sesión web, así que el backend resuelve
tenant/usuario a partir del `chat_id` usando la tabla puente `telegram_links`
(vía `prismaSystem`, owner exento de RLS). La memoria conversacional vive en un
`AgentChatThread` persistente por chat (`telegram_links.agentThreadId`, creado
lazy en el primer mensaje) — reemplaza la "Window Buffer Memory" de n8n.

Tablas: `telegram_links` (vínculo permanente) y `telegram_link_codes` (código
efímero de un solo uso para el handshake). Ambas con RLS `tenant_isolation`.

## Autenticación (n8n → backend)

Todos los endpoints validan `Authorization: Bearer <INTEGRATION_GATEWAY_SECRET>`
(timing-safe). Se reutiliza el secreto del gateway de integraciones, el mismo que
n8n ya usa para el canal saliente. Sin token o token inválido → `401`.

## Endpoints

Todos son `POST`. Los resultados de negocio responden `200`; solo fallos reales
de server → `500`.

### `POST /api/telegram/link`
Handshake de vinculación (`/vincular <código>`).

- Request: `{ "code": "ABC123", "chat_id": 123456789, "username": "juan" }`
- Response:
  - OK → `{ "success": true, "full_name": "Juan Pérez" }`
  - código inexistente/expirado/usado → `{ "success": false, "error": "invalid_code" }`
  - chat ya vinculado (con código válido) → `{ "success": false, "error": "already_linked" }`

### `POST /api/telegram/context`
Gate barato: n8n lo llama **antes** de transcribir voz o invocar al modelo.

- Request: `{ "chat_id": 123456789 }`
- Response:
  - no vinculado → `{}` (objeto vacío)
  - vinculado → `{ "user_id": "...", "org_id": "...", "full_name": "..." }`

### `POST /api/telegram/message`
Conversación con el copiloto. Reconstruye el historial desde la DB (n8n solo
manda el texto actual). Sin streaming.

- Request: `{ "chat_id": 123456789, "text": "¿cuántas oportunidades abiertas tengo?" }`
- Response: `{ "output": "Tenés 4 oportunidades abiertas." }`

## Flujo en n8n

```
Telegram Trigger
  ├─ ¿texto empieza con "/vincular"?
  │    sí → Extraer código → POST /api/telegram/link → Switch(success/invalid_code/already_linked)
  │    no → POST /api/telegram/context
  │           ├─ {}  → responder "no vinculado, generá tu código en el CRM"
  │           └─ vinculado → (si voz: Speech to Text) → POST /api/telegram/message → responder output
```

Notas de configuración n8n:
- Header `Authorization: Bearer {INTEGRATION_GATEWAY_SECRET}` en los 3 HTTP Request.
- Si el nodo HTTP usa `fullResponse: true`, la respuesta queda en `$json.body.*`
  (p. ej. `{{ $json.body.output }}` para el mensaje final de Telegram).
- Voz → texto se resuelve en n8n; el backend siempre recibe texto plano.

## Vinculación desde el CRM

Un usuario admin genera su código en **Configuración → Telegram**
(`/admin/settings/telegram`): código de 6 caracteres, TTL 10 min, un solo uso.
Lo envía al bot con `/vincular <código>`. Desde ahí la sección lista los chats
vinculados y permite desvincularlos (soft-delete: `isActive = false`).

## Variables de entorno

- `INTEGRATION_GATEWAY_SECRET` (requerida) — Bearer compartido con n8n.
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (opcional) — handle del bot para mostrarlo
  en la UI de vinculación. Si falta, se usa un texto genérico.
