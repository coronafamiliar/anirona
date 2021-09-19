# anirona

![Screenshot of anirona, showing the user interface and a map of the US with cases as of 2021-08-17](/docs/hero.jpg)

it's a web app to visualize covid data (from [CovidActNow](https://apidocs.covidactnow.org/)) over time. [see this video](https://www.youtube.com/watch?v=bTS0z4ziJCM) to see it in action (music warning).

## what is this

there are two parts to anirona:

### anirona/etl

this is a Node CLI tool to download and parse data from the CovidActNow API. since the complete timeseries data for all counties is well over 1.5GB in size, this tool downloads the data and separates out each individual metric for consumption by the web app.

### anirona/web

this is a Next.js app that displays an animated map of covid timeseries data. it's in very early stages of development, but some features include:

- play and pause of time elapsing
- legend bar with colors
- a dropdown to pick the metrics you want to see

## how do i use it

visit the hosted version here: https://anirona-wv5rtswotq-uw.a.run.app/

to run it locally:

- clone the repo
- `cd ../web`
- `npm run dev`
- visit `localhost:3000` in your browser

to run the ETL pipeline locally

- `cd anirona/etl`
- `npm install`
- `npm run start -- build`

## contributions

please suggest any improvements in the issues or contribute PRs. always interested in seeing what ideas folks have

## license

licensed AGPL 3

## colophon

this software was built on unceded ohlone land

only trust your respirator
