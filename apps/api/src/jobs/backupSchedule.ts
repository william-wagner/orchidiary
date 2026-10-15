/**
 * Decide se o backup semanal deve rodar agora. A checagem roda de hora em hora,
 * então se o PC estava desligado no horário marcado, o backup acontece assim
 * que ele voltar (desde que o último sucesso tenha mais de 6 dias).
 */
export function shouldRunBackup(p: {
  now: Date;
  timeZone: string;
  weekday: number;
  hour: number;
  lastSuccessAt: Date | null;
}): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: p.timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(p.now);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((x) => x.type === "weekday")!.value);
  const hour = Number(parts.find((x) => x.type === "hour")!.value);

  const sinceLast = p.lastSuccessAt ? p.now.getTime() - p.lastSuccessAt.getTime() : Infinity;
  const SIX_DAYS = 6 * 86_400_000;
  const SEVEN_DAYS = 7 * 86_400_000;

  // Atrasado: passou mais de uma semana sem backup
  if (sinceLast > SEVEN_DAYS) return true;
  // No horário marcado e ainda não rodou nesta semana
  return wd === p.weekday && hour >= p.hour && sinceLast > SIX_DAYS;
}
