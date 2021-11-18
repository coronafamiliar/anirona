import DeckGL from "@deck.gl/react";
import { Menu, MenuButton, MenuItem, MenuList } from "@reach/menu-button";
import "@reach/menu-button/styles.css";
import chroma from "chroma-js";
import { add, differenceInDays, formatISO, startOfToday } from "date-fns";
import { GeoJsonLayer, RGBAColor } from "deck.gl";
import type { Feature } from "geojson";
import router from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { GiBurningDot } from "react-icons/gi";
import { IoIosFastforward, IoIosPause, IoIosPlay } from "react-icons/io";
import { IoChevronDown, IoChevronUp } from "react-icons/io5";
import { StaticMap } from "react-map-gl";
import { useRafLoop } from "react-use";
import styles from "styles/AnimatedMap.module.css";
import { SCALE_RYB, SCALE_RYB_INVERT, SCALE_TURBO_INVERT } from "utils/colors";
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
    description: "(WIP) Total cases",
    colorScale: SCALE_TURBO_INVERT,
  },
  "actuals.newCases": {
    min: 0,
    max: 1000,
    description: "New cases",
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
    max: 150,
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
    colorScale: SCALE_RYB,
  },
  "riskLevels.caseDensity": {
    min: 0,
    max: 5,
    description: "Case density risk level",
    colorScale: SCALE_RYB,
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

const DEFAULT_DATE_ANIMATION_START = new Date("2020-03-01");
const DATE_DATA_AVAILABLE = new Date("2020-03-15");
const DATA_ANIMATION_DATE_OFFSET = differenceInDays(
  DATE_DATA_AVAILABLE,
  DEFAULT_DATE_ANIMATION_START
);
const DAYS_SINCE_START = differenceInDays(
  DEFAULT_DATE_ANIMATION_START,
  startOfToday()
);
const DEFAULT_DAYS_PER_SECOND = 10;
const DAYS_PER_SECOND_OPTIONS = {
  slow: 10,
  medium: 30,
  fast: 60,
};

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
  const [tick, setTick] = useState(0);
  const [animationStartDate, setAnimationStartDate] = useState<Date>(
    DEFAULT_DATE_ANIMATION_START
  );
  const [animationEndDate, setAnimationEndDate] = useState<Date>(
    startOfToday()
  );
  const [dayCount, setDayCount] = useState(0);
  const [daysPerSecond, setDaysPerSecond] = useState(DEFAULT_DAYS_PER_SECOND);
  const [previousFrameTs, setPreviousFrameTs] = useState(performance.now());
  const msPerDay = useMemo(
    () => Math.ceil(1000 / daysPerSecond),
    [daysPerSecond]
  );
  const { currentAnimationDateStr, currentAnimationDate } = useMemo(() => {
    const currentAnimationDate = add(DEFAULT_DATE_ANIMATION_START, {
      days: dayCount,
    });
    const currentAnimationDateStr = formatISO(currentAnimationDate, {
      representation: "date",
    });

    return {
      currentAnimationDate,
      currentAnimationDateStr,
    };
  }, [dayCount]);
  const { wholeMetric, splitMetric, config, category, dataMetric } =
    useMemo(() => {
      const wholeMetric = metric[0];
      const splitMetric = wholeMetric.split(".");
      const config = CONFIGS[wholeMetric];
      const [category, dataMetric] = splitMetric;
      return {
        wholeMetric,
        splitMetric,
        config,
        category,
        dataMetric,
      };
    }, [metric]);
  const dataDayCount = dayCount - DATA_ANIMATION_DATE_OFFSET;
  const isEndOfTime = currentAnimationDate >= animationEndDate;

  const tryAdvanceFrame = useCallback(
    (currentTs: number) => {
      // Compare frame timings to determine if we should increment the date
      // (attempt to maintain consistent animation performance across devices)
      const animationTimespan = currentTs - previousFrameTs;
      if (animationTimespan > msPerDay) {
        setDayCount(dayCount + 1);
        setPreviousFrameTs(currentTs);
      }
    },
    [dayCount, msPerDay, previousFrameTs]
  );

  const [stopLoop, startLoop, getLoopStatus] = useRafLoop((time) => {
    const nextTick = tick + 1;
    setTick(nextTick);
    tryAdvanceFrame(time);
  }, false);

  const setPause = useCallback(() => {
    setPlaying(false);
    stopLoop();
  }, [setPlaying, stopLoop]);

  // TODO tidy this up
  const togglePlay = useCallback(() => {
    if (playing && daysPerSecond === DAYS_PER_SECOND_OPTIONS.slow) {
      setPause();
    } else {
      setDaysPerSecond(DAYS_PER_SECOND_OPTIONS.slow);
      setPlaying(true);
      startLoop();
    }
  }, [daysPerSecond, playing, setPause, setPlaying, startLoop]);

  const toggleMediumSpeed = useCallback(() => {
    if (playing && daysPerSecond === DAYS_PER_SECOND_OPTIONS.medium) {
      setPause();
    } else {
      setDaysPerSecond(DAYS_PER_SECOND_OPTIONS.medium);
      setPlaying(true);
      startLoop();
    }
  }, [daysPerSecond, playing, setPause, startLoop]);

  const toggleFastSpeed = useCallback(() => {
    if (playing && daysPerSecond === DAYS_PER_SECOND_OPTIONS.fast) {
      setPause();
    } else {
      setDaysPerSecond(DAYS_PER_SECOND_OPTIONS.fast);
      setPlaying(true);
      startLoop();
    }
  }, [daysPerSecond, playing, setPause, startLoop]);

  const restartAnimation = useCallback(() => {
    setDayCount(0);
  }, [setDayCount]);

  useEffect(() => {
    if (isEndOfTime) {
      setPause();
    }
  }, [isEndOfTime, setPause]);

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
    const valueAtTimestep = series[currentAnimationDateStr];
    const fips = f.properties.STATE + f.properties.COUNTY;

    if (valueAtTimestep == null) {
      // No data available at the current animation date
      const priorDataForFips = priorData?.data[fips];

      if (fips != null && priorDataForFips != null) {
        // Data exists at prior dates, use that data
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
        date: currentAnimationDateStr,
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
        getFillColor: currentAnimationDateStr,
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
        <div style={{ display: "flex", flexDirection: "row" }}>
          <div
            className={styles.transportControl}
            style={{
              fontSize: 48,
              color: "white",
              marginBottom: "10px",
              marginRight: "10px",
              cursor: "pointer",
              transition: "opacity 1s",
              opacity: playing ? 0.5 : 1,
            }}
            role="button"
            title="Pause"
            onClick={() => setPause()}
          >
            <IoIosPause />
          </div>
          <div
            className={styles.transportControl}
            style={{
              fontSize: 48,
              color: "white",
              marginBottom: "10px",
              marginRight: "10px",
              cursor: "pointer",
              transition: "opacity 1s",
              opacity:
                playing && daysPerSecond === DAYS_PER_SECOND_OPTIONS.slow
                  ? 1
                  : 0.2,
              pointerEvents: isEndOfTime ? "none" : "inherit",
            }}
            role="button"
            title="10 days per second"
            onClick={() => togglePlay()}
          >
            <IoIosPlay />
          </div>
          <div
            className={styles.transportControl}
            style={{
              fontSize: 48,
              color: "white",
              marginBottom: "10px",
              marginRight: "10px",
              cursor: "pointer",
              transition: "opacity 1s",
              opacity:
                playing && daysPerSecond === DAYS_PER_SECOND_OPTIONS.medium
                  ? 1
                  : 0.2,
              pointerEvents: isEndOfTime ? "none" : "inherit",
            }}
            role="button"
            title="30 days per second"
            onClick={() => toggleMediumSpeed()}
          >
            <IoIosFastforward />
          </div>
          <div
            className={styles.transportControl}
            style={{
              fontSize: 48,
              color: "white",
              marginBottom: "10px",
              cursor: "pointer",
              transition: "opacity 1s",
              opacity:
                playing && daysPerSecond === DAYS_PER_SECOND_OPTIONS.fast
                  ? 1
                  : 0.2,
              pointerEvents: isEndOfTime ? "none" : "inherit",
            }}
            role="button"
            title="60 days per second"
            onClick={() => toggleFastSpeed()}
          >
            <GiBurningDot />
          </div>
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
        >
          {currentAnimationDateStr}
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
          {isEndOfTime ? (
            <span>
              The <em>End of Times</em> (today){" "}
              <a href="#" onClick={restartAnimation}>
                (restart?)
              </a>
            </span>
          ) : dataDayCount >= 0 && dataDayCount <= 365 ? (
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
