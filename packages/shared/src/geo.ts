export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distância em metros entre dois pontos (fórmula de haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LocationCheck {
  /** true quando a foto foi tirada longe do local registrado na ficha */
  mismatch: boolean;
  distanceMeters: number;
  thresholdMeters: number;
}

/**
 * Compara onde a foto foi tirada com o local da ficha válido naquele momento.
 * A precisão do GPS (accuracy) é somada ao limite para evitar falso alarme
 * com sinal ruim dentro de casa.
 */
export function checkPhotoLocation(
  plantLocation: LatLng,
  photoLocation: LatLng & { accuracyMeters?: number | null },
  thresholdMeters: number,
): LocationCheck {
  const d = distanceMeters(plantLocation, photoLocation);
  const effective = thresholdMeters + Math.max(0, photoLocation.accuracyMeters ?? 0);
  return { mismatch: d > effective, distanceMeters: Math.round(d), thresholdMeters: effective };
}

export function isValidLatLng(p: LatLng): boolean {
  return (
    Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180
  );
}
