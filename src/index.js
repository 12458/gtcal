async function getFutureCalendarData(env, term) {
  const termYear = parseInt(term.slice(0, 4), 10);
  const academicYear = `${termYear}-${termYear + 1}`;

  const cacheKey = `calendar-data/json-${academicYear}`;
  const cacheTTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  // 1. Check cache first
  const cached = await env.CALENDAR_CACHE.get(cacheKey);
  if (cached) {
    const { cachedAt, data } = JSON.parse(await cached.text());
    if (Date.now() - new Date(cachedAt).getTime() < cacheTTL) {
      console.log(`Returning ${academicYear} data from cache.`);
      return data;
    }
  }

  // 2. If cache is stale or missing, fetch from the API
  console.log(`Fetching new ${academicYear} data from registrar's JSON API...`);

  const timestamp = Date.now();
  const apiUrl = `https://registrar.gatech.edu/calevents/proxy?year=${academicYear}&status=current&_=${timestamp}`;

  const response = await fetch(apiUrl, {
    headers: {
      // Mimic a browser request
      "User-Agent":
        "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://registrar.gatech.edu/current-academic-calendar",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JSON data. Status: ${response.status}`);
  }

  const jsonData = await response.json();

  // 3. Cache the new data
  const cachePayload = {
    cachedAt: new Date().toISOString(),
    data: jsonData.data,
  };
  await env.CALENDAR_CACHE.put(cacheKey, JSON.stringify(cachePayload));
  console.log(`Successfully fetched and cached ${academicYear} data.`);

  return jsonData.data;
}

function filterJsonEventsByTerm(events, term) {
  const termYear = term.slice(0, 4);
  const termMonth = term.slice(4);

  let semesterCodes = [];
  switch (termMonth) {
    case "02":
      semesterCodes = ["2"];
      break; // Spring
    case "05":
      semesterCodes = ["5A", "5M", "5F", "5E", "5L", "Summer-All"];
      break; // Summer sessions
    case "08":
      semesterCodes = ["8"];
      break; // Fall
  }

  return events.filter(
    (event) => event.year === termYear && semesterCodes.includes(event.semester)
  );
}

function mapTermToSeason(term) {
  // Extract year and month from the term string
  const year = term.slice(0, 4);
  const month = term.slice(4);

  // Map month to season
  let season;
  switch (month) {
    case "02":
      season = "Spring";
      break;
    case "05":
      season = "Summer";
      break;
    case "08":
      season = "Fall";
      break;
    default:
      season = "Unknown";
  }

  return `${season} ${year}`;
}

function parseNaturalLanguageDate(dateString) {
  // Parse dates like "January 20 (Mon)" or "April 14 (Mon) - May 16 (Fri)"
  const monthMap = {
    January: "01",
    February: "02",
    March: "03",
    April: "04",
    May: "05",
    June: "06",
    July: "07",
    August: "08",
    September: "09",
    October: "10",
    November: "11",
    December: "12",
  };
  const startDate = dateString.split(" - ")[0];
  const match = startDate.match(/([A-Za-z]+)\s+(\d+)/);
  if (!match) return null;
  const [, monthName, day] = match;
  const month = monthMap[monthName];
  if (!month) return null;
  return { month, day: day.padStart(2, "0") };
}

function stripHtmlTags(html) {
  return html.replace(/<[^>]*>/g, "").trim();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/").filter((p) => p);

    if (pathSegments.length === 0) {
      const currentYear = new Date().getFullYear();
      let html =
        '<!doctypehtml><html lang=en><meta charset=UTF-8><meta content="width=device-width,initial-scale=1"name=viewport><title>GT Academic Calendars</title><link href=https://cdn.simplecss.org/simple.min.css rel=stylesheet></head><body><h1>Georgia Tech Academic Calendars</h1><ul>';
      for (let year = currentYear - 1; year <= currentYear + 2; year++) {
        html += `<li><a href="/${year}02">Spring ${year}</a></li>`;
        html += `<li><a href="/${year}05">Summer ${year}</a></li>`;
        html += `<li><a href="/${year}08">Fall ${year}</a></li>`;
      }
      html +=
        '</ul><footer><p>Made with ❤️ by <a href="https://about.shangen.org">Shang En</a><p>Licensed under the MIT license.</p><a href="https://github.com/12458/gtcal">Source Code</a></p></footer></body></html>';
      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    const term = pathSegments[0];
    const termYear = parseInt(term.slice(0, 4), 10);
    const useNewMethod = termYear >= 2025;

    try {
      let events = [];

      if (useNewMethod) {
        const allEventsForYear = await getFutureCalendarData(env, term);
        const filteredEvents = filterJsonEventsByTerm(allEventsForYear, term);

        events = filteredEvents
          .map((event) => {
            const parsedDate = parseNaturalLanguageDate(event.date);
            if (!parsedDate) return null;
            return {
              Date: `${parsedDate.month}/${parsedDate.day}/${event.year}`,
              EndDate: `${parsedDate.month}/${parsedDate.day}/${event.year}`, // Assume single day for now
              Title: stripHtmlTags(event.event),
              EventCategory: event.category,
            };
          })
          .filter(Boolean);
      } else {
        // Legacy method
        // Parse TSV data
        const legacyUrl = `https://ro-blob.azureedge.net/ro-calendar-data/public/txt/${term}.txt`;
        const response = await fetch(legacyUrl);
        if (!response.ok)
          return new Response("Calendar data not found.", { status: 404 });

        const data = await response.text();
        const rows = data.split("\r\n");
        const headers = rows[0].split("\t");
        events = rows
          .slice(1)
          .map((row) => {
            const values = row.split("\t");
            if (values.length < headers.length) return null;
            return values.reduce(
              (obj, val, i) => ({ ...obj, [headers[i].trim()]: val }),
              {}
            );
          })
          .filter(Boolean);
      }

      const calendarName = `GT ${mapTermToSeason(term)} Calendar`;

      // Initialize an array to hold the iCalendar events
      let icsEvents = [
        "BEGIN:VCALENDAR",
        "VERSION:3.0",
        "PRODID:-//Sim Shang En//sim@shangen.org//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${calendarName}`,
        "X-WR-TIMEZONE:America/New_York",
      ];

      // Parse each event into an iCalendar event
      events.forEach((event) => {
        if (event.Date && event.Title) {
          const formatDate = (dateStr) => {
            const [month, day, year] = dateStr.split("/");
            return `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
          };
          const description = event.EventCategory
            ? `Category: ${event.EventCategory}`
            : "";
          icsEvents.push(
            "BEGIN:VEVENT",
            `SUMMARY:${event.Title.replace(/,/g, "\\,")}`,
            `DTSTART;VALUE=DATE:${formatDate(event.Date)}`,
            `DTEND;VALUE=DATE:${formatDate(event.Date)}`,
            `DESCRIPTION:${description.replace(/,/g, "\\,")}`,
            "END:VEVENT"
          );
        }
      });

      icsEvents.push("END:VCALENDAR");
      const icsContent = icsEvents.join("\r\n");

      // Return the iCalendar response
      return new Response(icsContent, {
        headers: {
          "Content-Type": "text/calendar",
          "Content-Disposition": `attachment; filename="${calendarName}.ics"`,
        },
      });
    } catch (error) {
      return new Response(
        "Error fetching or parsing the file: " + error.message,
        { status: 500 }
      );
    }
  },
};
