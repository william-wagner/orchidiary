import { Hono } from "hono";
import { formatLocality, latLngSchema } from "@orchidiary/shared";
import { z } from "zod";
import { type AppEnv, requireUser } from "../auth/session.ts";
import { zValidator } from "../lib/validate.ts";
import { reverseGeocode } from "../services/geocode.ts";

const query = z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).pipe(latLngSchema);

export const geoRoutes = new Hono<AppEnv>()
  .use(requireUser)

  // Cidade/estado/país de um ponto, para mostrar na hora de marcar a localização.
  // Nada é gravado aqui; sem resposta do serviço, `locality` vem null.
  .get("/reverse", zValidator("query", query), async (c) => {
    const { lat, lng } = c.req.valid("query");
    const locality = await reverseGeocode(lat, lng);
    return c.json({ locality, label: formatLocality(locality) });
  });
