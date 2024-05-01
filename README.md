# GT Cal

> An ical generator for the official GT Academic Calendar \
> Download an iCalendar file for your academic term

## How to use?

Navigate to [gtcal.tools.shangen.org](https://gtcal.tools.shangen.org/) and select your academic year / semester you are interested in.

## Why?

- I was sick of waiting for the [official registrar calendar](https://registrar.gatech.edu/calendar/) page to load whenever I wanted to look something up
- I wanted to integrate the calendar with my own productivity suite

## How it works

- All code runs on [Cloudflare Workers](https://workers.cloudflare.com/) to keep costs low.

### Deployment

- Clone this repo: `git clone https://github.com/12458/gtcal.git`
- Change your directory: `cd gtcal`
- Install Dependencies: `npm install`
- Deploy to Cloudflare Workers: `npx wrangler deploy`

## License

All code in this repository is licensed under the [MIT License](https://github.com/12458/gtcal/blob/master/LICENSE)