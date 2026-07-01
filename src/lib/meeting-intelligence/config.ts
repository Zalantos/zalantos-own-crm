// Centralized, lazily-validated access to Meeting Intelligence env vars.
// Reads happen at call time (not module load) so the app still boots when a
// feature isn't configured yet — the failure surfaces where the feature runs.

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

export const groqConfig = {
  get apiKey() {
    return required("GROQ_API_KEY");
  },
  get transcriptionModel() {
    return process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3";
  },
  get reasoningModel() {
    return process.env.GROQ_REASONING_MODEL || "llama-3.3-70b-versatile";
  },
};

export const r2Config = {
  get accountId() {
    return required("R2_ACCOUNT_ID");
  },
  get accessKeyId() {
    return required("R2_ACCESS_KEY_ID");
  },
  get secretAccessKey() {
    return required("R2_SECRET_ACCESS_KEY");
  },
  get bucket() {
    return required("R2_BUCKET");
  },
  get endpoint() {
    return `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
  },
};

// Public base URL, used to build the internal pipeline callback.
export function appUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
