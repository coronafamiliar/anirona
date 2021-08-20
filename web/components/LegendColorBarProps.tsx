import chroma from "chroma-js";
import React from "react";
import { DOMAINS } from "./AnimatedMap";

interface LegendColorBarProps {
  metric: string;
  colorScale: chroma.Scale;
}
export const LegendColorBar: React.FC<LegendColorBarProps> = ({
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
