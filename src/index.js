function removeQuotationMarks(text) {
  // Check if the first and last characters are both double quotes
  if (text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1); // Remove the first and last characters
  }
  return text; // Return the original text if it doesn't start and end with quotes
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

export default {
  async fetch(request, env, ctx) {
    // Get the URL of the request
    const url = new URL(request.url);

    // Split the pathname part of the URL into segments
    const pathSegments = url.pathname.split("/").filter((p) => p);

    // Check if a term parameter is provided
    if (pathSegments.length === 0) {
      // No term provided, generate HTML for the current and surrounding years
      const currentYear = new Date().getFullYear();
      let html =
        '<!doctypehtml><html lang=en><meta charset=UTF-8><meta content="width=device-width,initial-scale=1"name=viewport><title>GT Academic Calendars</title><link href=https://cdn.simplecss.org/simple.min.css rel=stylesheet></head><body><h1>Georgia Tech Academic Calendars</h1><ul>';

      // Generate links for three years: last year, this year, and next year
      for (let year = currentYear - 2; year <= currentYear; year++) {
        html += `<li><a href="/${year}02">Spring ${year}</a></li>`;
        html += `<li><a href="/${year}05">Summer ${year}</a></li>`;
        html += `<li><a href="/${year}08">Fall ${year}</a></li>`;
      }

      html +=
        '</ul><footer><p>Made with ❤️ by <a href="https://about.shangen.org">Shang En</a><p>Licensed under the MIT license.</p><a href="https://github.com/12458/gtcal">Source Code</a></p></footer></body></html>';

      // Return the HTML response
      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // Assume the first path segment is the term code
    const term = pathSegments[0]; // This would be the `term` in the path `/{term}`

    const url_new = `https://ro-blob.azureedge.net/ro-calendar-data/public/txt/${term}.txt`;

    try {
      const response = await fetch(url_new);
      // Check if the URL is not found
      if (response.status === 404) {
        return new Response("The requested URL was not found on the server.", {
          status: 404,
        });
      }
      const data = await response.text();

      // Split the data into rows
      const rows = data.split("\r\n");

      // Extract the headers
      const headers = rows[0].split("\t");

      const calendarName = `GT ${mapTermToSeason(term)} Calendar`;

      // Initialize an array to hold the iCalendar events
      let icsEvents = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Sim Shang En//sim@shangen.org//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${calendarName}`,
        "X-WR-TIMEZONE:America/New_York",
      ];

      // Parse each row into an iCalendar event
      rows.slice(1).forEach((row) => {
        const values = row.split("\t");
        if (values.length < headers.length) return; // Skip incomplete rows

        const event = values.reduce((obj, value, index) => {
          obj[headers[index].trim()] = value;
          return obj;
        }, {});

        // Format dates from MM/DD/YYYY to YYYYMMDD and time to HHMMSS
        const formatDateTime = (date, time) => {
          if (!date) return "";
          const [month, day, year] = date.split("/");
          const formattedDate = `${year}${month.padStart(2, "0")}${day.padStart(
            2,
            "0"
          )}`;
          if (!time || time === "null") return `${formattedDate}`;

          // Convert time to 24-hour format and append to date
          const timeString = time.replace(/(AM|PM)/i, "").trim();
          const [hours, minutes] = timeString.split(":");
          const isPM = time.match(/PM/i) && parseInt(hours) < 12;
          const isAM = time.match(/AM/i) && parseInt(hours) === 12;
          const formattedHour = isPM
            ? parseInt(hours) + 12
            : isAM
            ? "00"
            : hours.padStart(2, "0");
          return `${formattedDate}T${formattedHour}${minutes}00`;
        };

        if (event.Date && event.Title) {
          const description = `${
            event.EventCategory === "null"
              ? ""
              : "<b>Category: " +
                removeQuotationMarks(event.EventCategory) +
                "</b>\n"
          }${event.Body === "null" ? "" : removeQuotationMarks(event.Body)}`;

          // Calculate event duration in days
          const startDate = new Date(event.Date);
          const endDate = new Date(event.EndDate);
          const durationInDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

          // If duration exceeds 5 days, split into two events
          if (durationInDays > 5) {
            // Create "start" event
            icsEvents.push(
              "BEGIN:VEVENT",
              `SUMMARY:Start - ${event.Title}`,
              `DTSTART;TZID=America/New_York:${formatDateTime(
                event.Date,
                event.Time
              )}`,
              `DTEND;TZID=America/New_York:${formatDateTime(
                event.Date,
                event.Time
              )}`,
              `DESCRIPTION:${description}`,
              `LOCATION:${
                event.EventLocation === "null"
                  ? ""
                  : removeQuotationMarks(event.EventLocation)
              }`,
              "END:VEVENT"
            );

            // Create "end" event
            icsEvents.push(
              "BEGIN:VEVENT",
              `SUMMARY:End - ${event.Title}`,
              `DTSTART;TZID=America/New_York:${formatDateTime(
                event.EndDate,
                event.EndTime
              )}`,
              `DTEND;TZID=America/New_York:${formatDateTime(
                event.EndDate,
                event.EndTime
              )}`,
              `DESCRIPTION:${description}`,
              `LOCATION:${
                event.EventLocation === "null"
                  ? ""
                  : removeQuotationMarks(event.EventLocation)
              }`,
              "END:VEVENT"
            );
          } else {
            icsEvents.push(
              "BEGIN:VEVENT",
              `SUMMARY:${event.Title}`,
              `DTSTART;TZID=America/New_York:${formatDateTime(
                event.Date,
                event.Time
              )}`,
              `DTEND;TZID=America/New_York:${formatDateTime(
                event.EndDate,
                event.EndTime
              )}`,
              `DESCRIPTION:${description}`,
              `LOCATION:${
                event.EventLocation === "null"
                  ? ""
                  : removeQuotationMarks(event.EventLocation)
              }`,
              "END:VEVENT"
            );
          }
        }
      });

      icsEvents.push("END:VCALENDAR");

      // Join all events into a single string to form the complete iCalendar content
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
