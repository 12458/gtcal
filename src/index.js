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

  // Handle date ranges (take the start date)
  const startDate = dateString.split(" - ")[0];

  // Extract month and day from format like "January 20 (Mon)"
  const match = startDate.match(/([A-Za-z]+)\s+(\d+)/);
  if (!match) return null;

  const [, monthName, day] = match;
  const month = monthMap[monthName];

  if (!month) return null;

  return { month, day: day.padStart(2, "0") };
}

function filterEventsBySemester(events, term) {
  // Map term codes to semester codes
  const termYear = term.slice(0, 4);
  const termMonth = term.slice(4);

  let semesterCodes = [];
  switch (termMonth) {
    case "02": // Spring
      semesterCodes = ["2"];
      break;
    case "05": // Summer
      semesterCodes = ["5A", "5M", "5F", "5E", "5L", "Summer-All"];
      break;
    case "08": // Fall
      semesterCodes = ["8"];
      break;
  }

  return events.filter(
    (event) => event.year === termYear && semesterCodes.includes(event.semester)
  );
}

function stripHtmlTags(html) {
  // Simple HTML tag removal - replace with plain text
  return html.replace(/<[^>]*>/g, "").trim();
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
      for (let year = currentYear - 1; year <= currentYear + 1; year++) {
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

    // Determine if we should use the new JSON API based on the term
    const termYear = parseInt(term.slice(0, 4));
    const useNewApi = termYear >= 2025;

    try {
      let events = [];

      if (useNewApi) {
        const academicYear = `${termYear}-${termYear + 1}`;
        const timestamp = Date.now();
        const apiUrl = `https://registrar.gatech.edu/calevents/proxy?year=${academicYear}&status=current&_=${timestamp}`;

        const response = await fetch(apiUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
            Accept: "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            Referer: "https://registrar.gatech.edu/current-academic-calendar",
          },
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch JSON data. Status: ${response.status}`
          );
        }

        const jsonData = await response.json();
        const filteredEvents = filterEventsBySemester(jsonData.data, term);
        events = filteredEvents
          .map((event) => {
            const parsedDate = parseNaturalLanguageDate(event.date);
            if (!parsedDate) return null;

            const dateStr = `${parsedDate.month}/${parsedDate.day}/${event.year}`;
            return {
              Date: dateStr,
              EndDate: dateStr,
              Title: stripHtmlTags(event.event),
              EventCategory: event.category,
              Body: "null",
              Time: "null",
              EndTime: "null",
              EventLocation: "null",
            };
          })
          .filter((event) => event !== null);
      } else {
        const url_legacy = `https://ro-blob.azureedge.net/ro-calendar-data/public/txt/${term}.txt`;
        const response = await fetch(url_legacy);
        if (response.status === 404) {
          return new Response(
            "The requested URL was not found on the server.",
            {
              status: 404,
            }
          );
        }

        const data = await response.text();
        const rows = data.split("\r\n");
        const headers = rows[0].split("\t");

        events = rows
          .slice(1)
          .map((row) => {
            const values = row.split("\t");
            if (values.length < headers.length) return null;
            const event = values.reduce((obj, value, index) => {
              obj[headers[index].trim()] = value;
              return obj;
            }, {});
            return event;
          })
          .filter((event) => event !== null);
      }

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

      // Parse each event into an iCalendar event
      events.forEach((event) => {
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
