import DeckGL from "@deck.gl/react";
import { Menu, MenuButton, MenuItem, MenuList } from "@reach/menu-button";
import "@reach/menu-button/styles.css";
import chroma from "chroma-js";
import { add, differenceInDays, formatISO, startOfToday } from "date-fns";
import { GeoJsonLayer, RGBAColor } from "deck.gl";
import type { Feature } from "geojson";
import router from "next/router";
import React, { useState } from "react";
import { IoIosPause, IoIosPlay } from "react-icons/io";
import { IoChevronDown, IoChevronUp } from "react-icons/io5";
import { StaticMap } from "react-map-gl";
import { useRafState } from "react-use";
import styles from "styles/AnimatedMap.module.css";
import {
  SCALE_RYB,
  SCALE_RYB_INVERT,
  SCALE_SPECTRAL_INVERT,
  SCALE_TURBO_INVERT,
} from "utils/colors";
import { LegendColorBar } from "./LegendColorBarProps";

interface AnimatedMapProps {
  metric: string[];
}

const INITIAL_VIEW_STATE = {
  latitude: 38,
  longitude: -95,
  zoom: 4,
  minZoom: 2,
  maxZoom: 8,
};

interface MetricConfig {
  min: number;
  max: number;
  description: string;
  colorScale: chroma.Scale;
}

export const CONFIGS: { [metric: string]: MetricConfig } = {
  "actuals.cases": {
    min: 0,
    max: 1000,
    description: "New cases",
    colorScale: SCALE_TURBO_INVERT,
  },
  "actuals.newCases": {
    min: 0,
    max: 1000,
    description: "Cases per 100k, 7 day average",
    colorScale: SCALE_TURBO_INVERT,
  },
  "actuals.newDeaths": {
    min: 0,
    max: 50,
    description: "New deaths",
    colorScale: SCALE_TURBO_INVERT,
  },
  "metrics.contactTracerCapacityRatio": {
    min: 0,
    max: 1,
    description: "Hired tracers to tracers needed, 7 day average",
    colorScale: SCALE_RYB,
  },
  "metrics.caseDensity": {
    min: 0,
    max: 1000,
    description: "Cases per 100k people, 7 day average",
    colorScale: SCALE_TURBO_INVERT,
  },
  "metrics.infectionRate": {
    min: 0,
    max: 5,
    description: "Estimated Rt (effective transmission rate)",
    colorScale: SCALE_TURBO_INVERT,
  },
  "metrics.infectionRateCI90": {
    min: 0,
    max: 5,
    description: "Estimated Rt (90th percentile confidence interval)",
    colorScale: SCALE_TURBO_INVERT,
  },
  "riskLevels.overall": {
    min: 0,
    max: 5,
    description: "Overall risk level",
    colorScale: SCALE_SPECTRAL_INVERT,
  },
  "riskLevels.caseDensity": {
    min: 0,
    max: 5,
    description: "Case density risk level",
    colorScale: SCALE_SPECTRAL_INVERT,
  },
  "metrics.icuCapacityRatio": {
    min: 0,
    max: 1,
    description: "% of ICU beds in use, 7 day average",
    colorScale: SCALE_RYB_INVERT,
  },
  "metrics.icuHeadroomRatio": {
    min: 0,
    max: 1,
    description: "% of ICU beds available, 7 day average",
    colorScale: SCALE_RYB_INVERT,
  },
  "metrics.testPositivityRatio": {
    min: 0,
    max: 1,
    description: "% of positive tests, 7 day average",
    colorScale: SCALE_RYB_INVERT,
  },
  "metrics.vaccinationsCompletedRatio": {
    min: 0,
    max: 1,
    description:
      "% of population fully vaccinated (completed all doses to date)",
    colorScale: SCALE_RYB_INVERT,
  },
  "metrics.vaccinationsInitiatedRatio": {
    min: 0,
    max: 1,
    description:
      "% of population partially vaccinated (one dose, but not complete)",
    colorScale: SCALE_RYB_INVERT,
  },
};

const START_OF_ANIMATION = new Date("2020-01-01");
const START_OF_DATA = new Date("2020-01-20");
const DATA_ANIMATION_DATE_OFFSET = differenceInDays(
  START_OF_DATA,
  START_OF_ANIMATION
);
const DAYS_SINCE_START = differenceInDays(START_OF_ANIMATION, startOfToday());
const speedModifier = 6;

/** In case there isn't data available for the current date, we'll fade out the data */
interface PriorData {
  mostRecentDayCount: number;
  data: {
    [fips: string]: {
      dayCount: number;
      date: string;
      value: number;
    };
  };
}

// explicitly not useState because we don't want to rerender upon change
// used to smooth out data gaps in the map
let priorData: PriorData | null = null;

const AnimatedMap: React.FC<AnimatedMapProps> = ({ metric }) => {
  const [playing, setPlaying] = useState(false);
  const [animationCounter, setAnimationCounter] = useRafState(0);

  // TODO this won't transition well as a speed transport control since
  // changing the speed modifier will alter the current date as a function of
  // the timestep. Need to rethink how to increment date from timestep
  const timestep = animationCounter % (DAYS_SINCE_START * speedModifier);

  const wholeMetric = metric[0];
  const splitMetric = wholeMetric.split(".");

  const config = CONFIGS[wholeMetric];

  const [category, dataMetric] = splitMetric;
  const dayCount = timestep / speedModifier;
  const dataDayCount = dayCount - DATA_ANIMATION_DATE_OFFSET;
  const currentAnimationDate = formatISO(
    add(START_OF_ANIMATION, { days: dayCount }),
    {
      representation: "date",
    }
  );

  if (playing) {
    setAnimationCounter(animationCounter + 1);
  }

  if (priorData != null && priorData.mostRecentDayCount > dayCount) {
    priorData = null;
  }

  // uwc-debug
  const getFillColor = (_f: any): RGBAColor => {
    const f = _f as Feature;
    if (f.properties == null) {
      return [0, 0, 0, 0];
    }

    const series = f.properties[wholeMetric];
    if (series == null) {
      return [0, 0, 0, 0];
    }

    const { max, min, colorScale } = config;
    const valueAtTimestep = series[currentAnimationDate];
    const fips = f.properties.STATE + f.properties.COUNTY;

    if (valueAtTimestep == null) {
      // No data available at the current animation date
      const priorDataForFips = priorData?.data[fips];

      if (fips != null && priorDataForFips != null) {
        // Data exists at prior dates, tastefully fade it out

        const priorValue: number = series[priorDataForFips.date];
        const scaledValue = 1 - (priorValue - min) / max;
        return colorScale(Math.min(1, scaledValue)).rgb();
      } else {
        return [33, 33, 33, 0.2];
      }
    } else {
      // Data is available at the current date, store this in data

      const scaledValue = 1 - (valueAtTimestep - min) / max;

      priorData = priorData || {
        mostRecentDayCount: dayCount,
        data: {},
      };
      priorData.mostRecentDayCount = dayCount;
      priorData.data[fips] = {
        date: currentAnimationDate,
        dayCount: dayCount,
        value: valueAtTimestep,
      };

      return colorScale(scaledValue).rgb();
    }
  };

  if (metric.length > 1 || splitMetric.length != 2 || !CONFIGS[wholeMetric]) {
    // Invalid, return to the homepage
    router.replace("/");
    return null;
  }

  const layers = [
    new GeoJsonLayer({
      id: "choropleth",
      data: `https://storage.googleapis.com/anirona-data/${category}/${dataMetric}.json.gz`,
      filled: true,
      parameters: {
        depthTest: false,
      },
      getLineColor: [0, 0, 0, 0.1],
      getFillColor,
      updateTriggers: {
        getFillColor: currentAnimationDate,
      },
    }),
  ];

  return (
    <div>
      <DeckGL
        layers={layers}
        pickingRadius={5}
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
      >
        <StaticMap
          reuseMaps
          mapStyle={
            "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json"
          }
          preventStyleDiffing={true}
        />
      </DeckGL>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          zIndex: 1,
        }}
      >
        <Menu>
          {({ isExpanded }) => (
            <React.Fragment>
              <MenuButton
                style={{
                  fontSize: 24,
                  fontFamily: "Iosevka Web",
                  backgroundColor: "transparent",
                  border: "none",
                  textShadow: "0 1px 2px rgba(0, 0, 0, 0.6)",
                  letterSpacing: 3,
                  color: "white",
                  marginTop: "2em",
                  cursor: "pointer",
                }}
              >
                {CONFIGS[wholeMetric].description}
                <span aria-hidden="true" style={{ marginLeft: "1em" }}>
                  {isExpanded ? <IoChevronUp /> : <IoChevronDown />}
                </span>
              </MenuButton>
              <MenuList
                style={{
                  backgroundColor: "rgba(0, 0, 0, 0.4)",
                  color: "white",
                  border: "none",
                  borderTop: "2px solid #0077d5",
                  marginTop: "1em",
                  textShadow: "0 1px 10px rgba(0, 0, 0, 0.4)",
                  boxShadow: "0 1px 5px rgba(0, 0, 0, 0.2)",
                  backdropFilter: "blur(50px)",
                }}
              >
                {Object.keys(CONFIGS).map((key) => (
                  <MenuItem onSelect={() => router.push(`/${key}`)} key={key}>
                    {CONFIGS[key].description}
                  </MenuItem>
                ))}
              </MenuList>
            </React.Fragment>
          )}
        </Menu>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          zIndex: 1,
        }}
      >
        <div
          className={styles.transportControl}
          style={{
            fontSize: 48,
            color: "white",
            marginBottom: "10px",
            cursor: "pointer",
            transition: "opacity 1s",
            opacity: playing ? 0.1 : 1,
          }}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <IoIosPause /> : <IoIosPlay />}
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 300,
            textShadow: "0 1px 4px rgba(0, 0, 0, 0.6)",
            letterSpacing: 5,
            color: "white",
            marginBottom: "10px",
            cursor: "pointer",
          }}
          onClick={() => setPlaying(!playing)}
        >
          {currentAnimationDate}
        </div>

        <div
          style={{
            fontSize: 24,
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.6)",
            letterSpacing: 3,
            color: "white",
            marginBottom: "2em",
          }}
        >
          {dataDayCount >= 0 && dataDayCount <= 365 ? (
            <span>Day {Math.floor(dataDayCount)}</span>
          ) : dataDayCount > 365 ? (
            <span>
              Year {Math.floor(dataDayCount / 365)} Day{" "}
              {Math.round(dataDayCount % 365)}
            </span>
          ) : (
            <span>
              The <em>Before-Times</em>
            </span>
          )}
        </div>
        <LegendColorBar metric={wholeMetric} colorScale={config.colorScale} />
      </div>
    </div>
  );
};

export default AnimatedMap;
