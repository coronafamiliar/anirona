import chroma from "chroma-js";
import React from "react";
import { CONFIGS } from "./AnimatedMap";

const DEFAULT_MAX_STEPS = 100;

interface LegendColorBarProps {
  metric: string;
  colorScale: chroma.Scale;
  maxSteps?: number;
}
export const LegendColorBar: React.FC<LegendColorBarProps> = ({
  metric,
  colorScale,
  maxSteps = DEFAULT_MAX_STEPS,
}) => {
  const domain = CONFIGS[metric] || { min: 0, max: 1 };

  // If domain.max = 1, then we're dealing with a ratio, otherwise there may be
  // smaller steps (e.g. risk levels 0-5)
  const numSteps = domain.max > 4 ? Math.min(maxSteps, domain.max) : maxSteps;

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
