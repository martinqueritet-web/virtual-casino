import type { Config } from "@netlify/functions";
import { handle } from "../../server/api.js";

export default async (req: Request) => handle(req);

export const config: Config = {
  path: "/api/*",
};
