import DeckGL from "@deck.gl/react";
import chroma from "chroma-js";
import { add, differenceInDays, formatISO, startOfToday } from "date-fns";
import { GeoJsonLayer, RGBAColor } from "deck.gl";
import type { Feature } from "geojson";
import router from "next/router";
import React, { useState } from "react";
import { StaticMap } from "react-map-gl";
import { useRafState } from "react-use";

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
  "riskLevels.overall": {
    min: 0,
    max: 5,
  },
};

const START_OF_PANDEMIC = new Date("2020-03-01");
const DAYS_SINCE_START = differenceInDays(START_OF_PANDEMIC, startOfToday());

const AnimatedMap: React.FC<AnimatedMapProps> = ({ metric }) => {
  const [playing, setPlaying] = useState(false);
  const [animationCounter, setAnimationCounter] = useRafState(0);
  const timestep = animationCounter % DAYS_SINCE_START;

  const wholeMetric = metric[0];
  const splitMetric = wholeMetric.split(".");

  if (metric.length > 1 || splitMetric.length != 2) {
    // Invalid, return to the homepage
    router.replace("/");
    return null;
  }

  const domain = DOMAINS[wholeMetric];

  const [category, dataMetric] = splitMetric;
  const currentAnimationDate = formatISO(
    add(START_OF_PANDEMIC, { days: timestep }),
    {
      representation: "date",
    }
  );

  if (playing) {
    setAnimationCounter(animationCounter + 1);
  }

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

    if (valueAtTimestep == null) {
      return [33, 33, 33];
    }

    const scaledValue = 1 - (valueAtTimestep - min) / max;

    return chroma.scale("RdYlBu")(scaledValue).rgb();
  };

  const layers = [
    new GeoJsonLayer({
      id: "choropleth",
      data: `/api/timeseries/${category}.${dataMetric}`,
      filled: true,
      parameters: {
        depthTest: false,
      },
      getFillColor,
      updateTriggers: {
        getFillColor: [currentAnimationDate],
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
          height: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 48,
            fontFamily: "Iosevka",
            color: "white",
            margin: "1em",
            cursor: "pointer",
          }}
          onClick={() => setPlaying(!playing)}
        >
          {currentAnimationDate}
        </div>
      </div>
    </div>
  );
};

export default AnimatedMap;
