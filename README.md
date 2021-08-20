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

## how do i use it

i don't have this hosted anywhere yet (i'm figuring out some infrastructure stuff on my end), but you can run it locally!

- clone the repo
- `cd anirona/etl`
- `npm install`
- `npm run start -- build` to download the data and parse it
- `cd ../web`
- `npm run dev`
- visit `localhost:3000` in your browser

## contributions

please suggest any improvements in the issues or contribute PRs. always interested in seeing what ideas folks have

## license

licensed AGPL 3

## colophon

this software was built on unceded ohlone land

only trust your respirator