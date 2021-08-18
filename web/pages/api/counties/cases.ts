import type { NextApiRequest, NextApiResponse } from "next";
import type { RegionSummaryWithTimeseries } from "typings/codegen/CovidActNow";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RegionSummaryWithTimeseries>
) {
  const timeseries = await getExternalTimeseries();
  res.status(200).json(timeseries);
}
