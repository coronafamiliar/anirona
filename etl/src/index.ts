import axios from "axios";
import chalk from "chalk";
import CliProgress from "cli-progress";
import { Command } from "commander";
import { startOfToday } from "date-fns";
import dotenv from "dotenv";
import { constants, default as fs, promises as fsP } from "fs";
import type { FeatureCollection } from "geojson";
import produce from "immer";
import { keyBy, mapValues, max, min } from "lodash";
import ora from "ora";
import path from "path";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray";
import type { Fips, RegionSummaryWithTimeseries } from "typings/CovidActNow";
import { promisify } from "util";
import { gzip as _gzip } from "zlib";
dotenv.config();
const gzip = promisify(_gzip);

const progress = new CliProgress.SingleBar({}, CliProgress.Presets.shades_classic);

const DATA_BASE_PATH = path.join(process.cwd(), "..", "data");
const DATA_TIMESERIES_PATH = path.join(DATA_BASE_PATH, "counties.timeseries.json");
const DATA_TIMESERIES_PARTIAL_PATH = path.join(DATA_BASE_PATH, "counties.timeseries.json.part");
const DATA_LAST_FETCHED_PATH = path.join(DATA_BASE_PATH, "lastFetched.txt");
const DEFAULT_DESTINATION_PATH = path.join("..", "web", "public", "data");
const GEOJSON_BASE_PATH = path.join(process.cwd(), "static", "counties.geojson");
const buildDataPath = (outPath: string, category: string) => path.join(outPath, category);
const buildDataFilePath = (outPath: string, category: string, metric: string) =>
  path.join(buildDataPath(outPath, category), `${metric}.json.gz`);
const buildDataFilePartialPath = (outPath: string, category: string, metric: string) =>
  `${buildDataFilePath(outPath, category, metric)}.part`;

const COVIDACTNOW_BASE_URL = `https://api.covidactnow.org/v2/`;
const countyTimeseriesUrl = (apiKey: string) =>
  `${COVIDACTNOW_BASE_URL}counties.timeseries.json?apiKey=${apiKey}`;

async function downloadCovidActNowTimeseries(): Promise<void> {
  console.log(chalk`{green prereq:} downloading timeseries data from CovidActNow...`);
  const apiKey = process.env.COVIDACTNOW_API_KEY;
  if (apiKey == null) {
    throw new Error("No API key provided");
  }

  try {
    await fsP.access(DATA_BASE_PATH);
  } catch (err) {
    console.log(chalk`{green prereq:} {yellow [note]} creating timeseries cache`);
    await fsP.mkdir(DATA_BASE_PATH);
  }

  try {
    await fsP.access(DATA_TIMESERIES_PARTIAL_PATH, constants.F_OK);
    console.log(chalk`{green prereq:} {yellow [note]} deleting previously unfinished download`);
    await fsP.unlink(DATA_TIMESERIES_PARTIAL_PATH);
  } catch (err) {}

  const apiResponse = await axios.get<NodeJS.ReadableStream>(countyTimeseriesUrl(apiKey), {
    responseType: "stream",
    onDownloadProgress: (event) => {
      event;
    },
  });

  progress.start(apiResponse.headers["content-length"], 0);

  apiResponse.data.on("data", (chunk: Buffer) => progress.increment(chunk.length));
  apiResponse.data.pipe(fs.createWriteStream(DATA_TIMESERIES_PARTIAL_PATH, { encoding: "utf-8" }));

  return new Promise((resolve, reject) => {
    apiResponse.data.on("error", (err) => {
      if (err) {
        reject(err);
      }
    });

    apiResponse.data.on("close", async () => {
      await fsP.writeFile(DATA_LAST_FETCHED_PATH, new Date().toISOString(), { encoding: "utf-8" });
      await fsP.rename(DATA_TIMESERIES_PARTIAL_PATH, DATA_TIMESERIES_PATH);
      progress.stop();
      resolve();
    });
  });
}

interface TimeseriesSliceRow {
  date: Date;
  value: number | null;
}

interface TimeseriesSlice {
  fips: Fips;
  rows: TimeseriesSliceRow[];
}

const METRICS_TIMESERIES_PATHS = [
  "testPositivityRatio",
  "caseDensity",
  "contactTracerCapacityRatio",
  "infectionRate",
  "infectionRateCI90",
  "icuHeadroomRatio",
  "icuCapacityRatio",
  "vaccinationsInitiatedRatio",
  "vaccinationsCompletedRatio",
] as const;
type MetricsTimeseriesPaths = typeof METRICS_TIMESERIES_PATHS[number];

const ACTUALS_TIMESERIES_PATHS = [
  "cases",
  "deaths",
  "positiveTests",
  "negativeTests",
  "contactTracers",
  "hospitalBeds",
  "icuBeds",
  "newCases",
  "newDeaths",
  "vaccinesDistributed",
  "vaccinationsInitiated",
  "vaccinationsCompleted",
  "vaccinesAdministered",
  "vaccinesAdministeredDemographics",
  "vaccinationsInitiatedDemographics",
] as const;
type ActualsTimeseriesPaths = typeof ACTUALS_TIMESERIES_PATHS[number];

const RISK_LEVELS_TIMESERIES_PATHS = ["overall", "caseDensity"] as const;
type RiskLevelTimeseriesPaths = typeof RISK_LEVELS_TIMESERIES_PATHS[number];

type TimeseriesCategory = "metrics" | "actuals" | "riskLevels";
const TIMESERIES_PATHS: { [k in TimeseriesCategory]: readonly string[] } = {
  metrics: METRICS_TIMESERIES_PATHS,
  actuals: ACTUALS_TIMESERIES_PATHS,
  riskLevels: RISK_LEVELS_TIMESERIES_PATHS,
};

async function mapTimeseriesPropertyToGeojson(
  category: TimeseriesCategory,
  path: string,
  timeseries: RegionSummaryWithTimeseries[],
  geojsonBase: FeatureCollection
): Promise<FeatureCollection> {
  if (TIMESERIES_PATHS[category].indexOf(path) < 0) {
    throw new Error(`Path ${path} not in category ${category}`);
  }

  const timeseriesKeyedByFips = keyBy(timeseries, (region) => region.fips);

  console.log(
    chalk`{green map:} mapping timeseries for ${category}.${path} with {cyan ${geojsonBase.features.length}} counties`
  );
  //console.log("debug: keys", Object.keys(timeseriesKeyedByFips).slice(0, 50));
  progress.start(geojsonBase.features.length, 0, { county: "N/A" });

  const newGeoJSON = produce(geojsonBase, (draft) => {
    for (const feature of draft.features) {
      if (feature.properties == null) {
        throw new Error("Expected geojson features to have properties");
      }

      const fips: string = feature.properties.STATE + feature.properties.COUNTY;
      if (fips.length != 5) {
        throw new Error(
          "Expected 2-digit STATE property and 3-digit COUNTY property to assemble 5-digit FIPS"
        );
      }

      const entry = timeseriesKeyedByFips[fips];
      if (entry == null) {
        continue;
      }

      const categoryTimeseries = entry[`${category}Timeseries`] as any;
      const timeseriesForPath = mapValues(
        keyBy(categoryTimeseries, (elem) => elem.date),
        (elem) => elem[path]
      );

      feature.properties[`${category}.${path}`] = {
        ...timeseriesForPath,
        max: max(Object.values(timeseriesForPath)),
        min: min(Object.values(timeseriesForPath)),
      };

      progress.increment(1, { county: feature.properties["NAME"] });
    }
  });
  progress.stop();

  return newGeoJSON;
}

async function getTimeseriesFile(): Promise<RegionSummaryWithTimeseries[]> {
  try {
    console.log(chalk`{green prereq:} checking timeseries file`);
    await fsP.access(DATA_TIMESERIES_PATH);
  } catch (err) {
    console.log(chalk`{green prereq:} {yellow [note]} couldn't find timeseries file, downloading`);
    await downloadCovidActNowTimeseries();
  }

  try {
    console.log(chalk`{green prereq:} checking last updated time`);
    await fsP.access(DATA_LAST_FETCHED_PATH);
  } catch (err) {
    console.log(
      chalk`{green prereq:} {yellow [note]} couldn't find last updated file, redownloading`
    );
    await downloadCovidActNowTimeseries();
  }

  console.log(chalk`{green prereq:} checking last updated time file`);
  const lastFetched = new Date(await fsP.readFile(DATA_LAST_FETCHED_PATH, { encoding: "utf-8" }));
  if (lastFetched < startOfToday()) {
    console.log(
      chalk`{green prereq:} {yellow [note]} last fetched was before today, redownloading`
    );
    await downloadCovidActNowTimeseries();
  }

  console.log(chalk`{green prereq:} parsing timeseries file...`);
  const spinner = ora("parsing...").start();
  return new Promise<RegionSummaryWithTimeseries[]>((resolve, reject) => {
    const assembler: RegionSummaryWithTimeseries[] = [];
    const pipeline = chain([
      fs.createReadStream(DATA_TIMESERIES_PATH, {
        highWaterMark: 1 * 1024 * 1024, // buffer size
      }),
      parser(),
      streamArray(),
      (data) => data.value,
    ]);
    pipeline.on("data", (data) => {
      assembler.push(data);
      spinner.text = chalk`parsed {blue ${assembler.length}} so far`;
    });
    pipeline.on("end", () => {
      spinner.stop();
      resolve(assembler);
    });
    pipeline.on("error", (err) => reject(err));
  });
}

async function getGeoJSONBase(): Promise<FeatureCollection> {
  return JSON.parse(await fsP.readFile(GEOJSON_BASE_PATH, { encoding: "utf-8" }));
}

interface Options {
  out: string;
}

async function build(options: Options) {
  const outPath = path.resolve(process.cwd(), options.out);
  console.log(chalk`{blue options:} output path: "${outPath}"`);

  const geojsonBase = await getGeoJSONBase();
  const timeseries = await getTimeseriesFile();
  for (const category in TIMESERIES_PATHS) {
    for (const metric of TIMESERIES_PATHS[category as TimeseriesCategory]) {
      const newFeatures = await mapTimeseriesPropertyToGeojson(
        category as TimeseriesCategory,
        metric,
        timeseries,
        geojsonBase
      );

      try {
        await fsP.access(buildDataPath(outPath, category));
      } catch (err) {
        await fsP.mkdir(buildDataPath(outPath, category));
      }

      const filePath = buildDataFilePath(outPath, category, metric);
      const partialFilePath = buildDataFilePartialPath(outPath, category, metric);

      try {
        await fsP.access(filePath);
        console.log(chalk`{green prereq:} {yellow [cleanup]} cleaning up previous files`);
        await fsP.unlink(filePath);
      } catch (err) {
        // do nothing
      }

      try {
        await fsP.access(partialFilePath);
        console.log(
          chalk`{green prereq:} {yellow [cleanup]} cleaning up previously incomplete files`
        );
        await fsP.unlink(partialFilePath);
      } catch (err) {
        // do nothing
      }

      console.log(chalk`{green build:} writing file to ${filePath}...`);
      const payload = JSON.stringify(newFeatures);
      const gzippedPayload = await gzip(payload);
      await fsP.writeFile(partialFilePath, gzippedPayload);
      await fsP.rename(partialFilePath, filePath);
    }
  }
}

const program = new Command();
program.version("0.0.1");
program
  .command("build", { isDefault: true })
  .option("-o, --out [path]", "destination path for geojson files", DEFAULT_DESTINATION_PATH)
  .description("download and assemble GeoJSON files for all CovidActNow metrics")
  .action(build);

program.parse();
