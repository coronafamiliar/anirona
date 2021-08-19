/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config) => {
    config.resolve.alias["mapbox-gl"] = "maplibre-gl";
    return config;
  },
};
