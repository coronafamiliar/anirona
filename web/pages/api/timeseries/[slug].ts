import fs from "fs";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import type { RegionSummaryWithTimeseries } from "typings/codegen/CovidActNow";
import { ApiErrorResponse } from "typings/errors";
import { fileExists } from "utils/node-stdlib";

const DATA_PATH = path.resolve("./public/data");
export const resolveDataPathFromSlug = async (
  slug: string
): Promise<string | null> => {
  const [category, metric] = slug.split(".");
  const dataPath = path.join(DATA_PATH, category, `${metric}.json.gz`);
  if (!(await fileExists(dataPath))) {
    return null;
  }

  return dataPath;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RegionSummaryWithTimeseries | ApiErrorResponse>
) {
  const { slug } = req.query;
  const timeseriesPath = await resolveDataPathFromSlug(slug as string);
  if (timeseriesPath == null) {
    const error: ApiErrorResponse = {
      type: "invalid_request",
      code: "invalid_metric",
      message: `No such metric ${slug}`,
    };
    return res.status(404).json(error);
  }

  const readStream = fs.createReadStream(timeseriesPath);
  res.setHeader("content-encoding", "gzip");
  res.setHeader("content-type", "application/json");
  res.status(200);
  readStream.pipe(res);
}
