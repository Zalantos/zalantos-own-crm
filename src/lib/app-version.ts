export const DEVELOPMENT_BUILD_ID = "development";

// El id "unknown" aparece si producción no pudo leer `.next/BUILD_ID` ni un id
// de deploy. Compararlo mostraría la barra en cada chequeo, así que se ignora.
export function isNewerBuild(
  loadedBuildId: string,
  serverBuildId: string,
): boolean {
  if (
    loadedBuildId.length === 0 ||
    serverBuildId.length === 0 ||
    loadedBuildId === DEVELOPMENT_BUILD_ID ||
    serverBuildId === DEVELOPMENT_BUILD_ID ||
    loadedBuildId === "unknown" ||
    serverBuildId === "unknown"
  ) {
    return false;
  }

  return loadedBuildId !== serverBuildId;
}
