/** CLI args after `pnpm run x -- …` (drops the bare `--` separator). */
export function scriptArgv(): string[] {
  return process.argv.slice(2).filter((a) => a !== "--");
}
