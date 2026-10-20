import type { Photo, Plant } from "./api.ts";

/** Capa: a foto escolhida ou, na falta dela, a primeira (a timeline vem da mais recente para a mais antiga). */
export function coverOf(plant: Pick<Plant, "coverPhotoId">, photos: Photo[]): Photo | undefined {
  return (plant.coverPhotoId && photos.find((p) => p.id === plant.coverPhotoId)) || photos[photos.length - 1];
}

/** Quando a prancha botânica da foto ficou pronta (versiona a URL); null se ainda não existe. */
export function plateOf(photo: Photo | undefined): string | null {
  return photo?.illustrationStatus === "ready" && photo.illustrationUpdatedAt ? photo.illustrationUpdatedAt : null;
}
