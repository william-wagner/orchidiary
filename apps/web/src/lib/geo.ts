export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * Localização do aparelho. Exige HTTPS (o Tailscale resolve isso no celular).
 * Devolve null em vez de falhar: a foto continua sendo salva sem GPS.
 */
export function getPosition(timeoutMs = 10_000): Promise<Position | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

export const formatDistance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);
