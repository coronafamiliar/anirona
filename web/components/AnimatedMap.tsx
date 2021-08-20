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

const DOMAINS: { [metric: string]: { min: number; max: number } } = {
  "actuals.cases": {
    min: 0,
    max: 1000,
  },
  "actuals.newCases": {
    min: 0,
    max: 1000,
  },
  "metrics.caseDensity": {
    min: 0,
    max: 100,
  },
  "metrics.infectionRate": {
    min: 0,
    max: 2,
  },
  "metrics.infectionRateCI90": {
    min: 0,
    max: 2,
  },
  "riskLevels.overall": {
    min: 0,
    max: 5,
  },
  "riskLevels.caseDensity": {
    min: 0,
    max: 5,
  },
};

const DESCRIPTIONS: { [metric: string]: string } = {
  "actuals.newCases": "New cases",
  "actuals.newDeaths": "New deaths",
  "metrics.caseDensity": "Cases per 100k, 7 day average",
  "metrics.contactTracerCapacityRatio":
    "Hired tracers to tracers needed, 7 day average",
  "metrics.icuCapacityRatio": "% of ICU beds in use, 7 day average",
  "metrics.icuHeadroomRatio": "% of ICU beds available, 7 day average",
  "metrics.infectionRate": "Estimated Rt (effective transmission rate)",
  "metrics.infectionRateCI90":
    "Estimated Rt (90th percentile confidence interval)",
  "metrics.testPositivityRatio": "% of positive tests, 7 day average",
  "metrics.vaccinationsCompletedRatio":
    "% of population fully vaccinated (completed all doses to date)",
  "metrics.vaccinationsInitiatedRatio":
    "% of population partially vaccinated (one dose, but not complete)",
  "riskLevels.caseDensity": "Case density risk level",
  "riskLevels.overall": "Overall risk level",
};

const START_OF_ANIMATION = new Date("2020-01-01");
const START_OF_DATA = new Date("2020-01-20");
const DATA_ANIMATION_DATE_OFFSET = differenceInDays(
  START_OF_DATA,
  START_OF_ANIMATION
);
const DAYS_SINCE_START = differenceInDays(START_OF_ANIMATION, startOfToday());
const speedModifier = 5;

const COLOR_SCALE = chroma.scale("RdYlBu");

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
  const timestep = animationCounter % (DAYS_SINCE_START * speedModifier);

  const wholeMetric = metric[0];
  const splitMetric = wholeMetric.split(".");

  const domain = DOMAINS[wholeMetric] || { max: 1, min: 0 };

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

    const max = domain.max;
    const min = domain.min;
    const valueAtTimestep = series[currentAnimationDate];
    const fips = f.properties.STATE + f.properties.COUNTY;

    if (valueAtTimestep == null) {
      // No data available at the current animation date
      const priorDataForFips = priorData?.data[fips];

      if (fips != null && priorDataForFips != null) {
        // Data exists at prior dates, tastefully fade it out

        const priorValue: number = series[priorDataForFips.date];
        const scaledValue = 1 - (priorValue - min) / max;
        return COLOR_SCALE(Math.min(1, scaledValue)).rgb();
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

      return COLOR_SCALE(scaledValue).rgb();
    }
  };

  if (
    metric.length > 1 ||
    splitMetric.length != 2 ||
    !DESCRIPTIONS[wholeMetric]
  ) {
    // Invalid, return to the homepage
    router.replace("/");
    return null;
  }

  const layers = [
    new GeoJsonLayer({
      id: "choropleth",
      data: `/api/timeseries/${category}.${dataMetric}`,
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
                {DESCRIPTIONS[wholeMetric]}
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
                {Object.keys(DESCRIPTIONS).map((key) => (
                  <MenuItem onSelect={() => router.push(`/${key}`)} key={key}>
                    {DESCRIPTIONS[key]}
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
        <LegendColorBar metric={wholeMetric} colorScale={COLOR_SCALE} />
      </div>
    </div>
  );
};

interface LegendColorBarProps {
  metric: string;
  colorScale: chroma.Scale;
}

const LegendColorBar: React.FC<LegendColorBarProps> = ({
  metric,
  colorScale,
}) => {
  const domain = DOMAINS[metric] || { min: 0, max: 1 };

  // If domain.max = 1, then we're dealing with a ratio, otherwise there may be
  // smaller steps (e.g. risk levels 0-5)
  const numSteps = domain.max > 4 ? Math.min(10, domain.max) : 10;

  const colorSteps = [...Array(numSteps).keys()].map((i) => {
    return colorScale(1 - i / numSteps).css();
  });

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          color: "white",
          fontSize: 11,
          marginBottom: "1ex",
        }}
      >
        <span>{domain.min}</span>
        <span>{(domain.min + domain.max) / 2}</span>
        <span>{domain.max}</span>
      </div>
      <div
        style={{
          height: "1ex",
          width: "30vw",
          minWidth: 200,
          maxWidth: 500,
          display: "flex",
        }}
      >
        {colorSteps.map((rgba, i) => (
          <div
            key={`color-bar-${i}`}
            style={{
              width: `${100 / numSteps}%`,
              backgroundColor: rgba,
              height: "100%",
            }}
          ></div>
        ))}
      </div>
    </div>
  );
};

export default AnimatedMap;
