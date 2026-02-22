#!/usr/bin/env node

/**
 * Generate CSV report from Google Sheets boarding data
 * Columns: date, num dogs day, num dogs night, employee assigned, total, total * 65%
 */

const SPREADSHEET_ID = '13bcw4_HwkxuNJ2XR3s-zJ80oVUioe2HCOlByqFljE1Y';
const SHEET_GIDS = [
  { gid: '0', description: 'Nov 18 - Nov 29' },
  { gid: '7893528', description: 'Nov 30 - Dec 13' },
  { gid: '196567038', description: 'Dec 14 - Dec 27' },
  { gid: '1731530850', description: 'Dec 28 - Jan 10' },
];

const EMPLOYEE_NAMES = ['Kat', 'Max', 'Myles', 'Kintaro', 'Kentaro', 'Stephen', 'Sierra'];

async function fetchSheetCSV(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet: ${response.status}`);
  }
  return response.text();
}

function parseCSV(csvText) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        currentCell += char;
      }
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// Parse dates like "Mon  18 Nov", "Tue  19 Nov", "Sat  28 Dec", "Wed  1 Jan"
function parseDateFromHeader(header, defaultYear = 2025) {
  // Match patterns like "Mon  18 Nov" or "Wed  1 Jan"
  const match = header.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const monthStr = match[2].toLowerCase();
  const monthMap = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  const month = monthMap[monthStr];

  // If month is January, it's 2026
  const year = month === 1 ? 2026 : defaultYear;

  return { month, day, year };
}

function formatDate(dateObj) {
  const { year, month, day } = dateObj;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseSheetForReport(rows) {
  const reportData = {}; // keyed by date string

  if (rows.length < 2) return reportData;

  const headerRow = rows[0] || [];
  const subHeaderRow = rows[1] || [];

  // Build column mapping: colIndex -> { date, type: 'day'|'night' }
  const columnMap = {};
  let currentDate = null;

  for (let col = 0; col < Math.max(headerRow.length, subHeaderRow.length); col++) {
    const headerCell = (headerRow[col] || '').trim();
    const subHeaderCell = (subHeaderRow[col] || '').trim().toLowerCase();

    // Check if this column has a date header
    const dateObj = parseDateFromHeader(headerCell);
    if (dateObj) {
      currentDate = dateObj;
    }

    // Check for n/d in subheader
    let type = null;
    if (subHeaderCell === 'n' || subHeaderCell === 'night') {
      type = 'night';
    } else if (subHeaderCell === 'd' || subHeaderCell === 'day') {
      type = 'day';
    }

    // If we have a current date and a type, map this column
    if (currentDate && type) {
      columnMap[col] = { dateObj: currentDate, type };
      const dateStr = formatDate(currentDate);
      if (!reportData[dateStr]) {
        reportData[dateStr] = {
          date: dateStr,
          numDogsDay: 0,
          numDogsNight: 0,
          dayTotal: 0,
          nightTotal: 0,
          employees: new Set()
        };
      }
    }
  }

  // Parse data rows (skip header rows)
  for (let rowIdx = 2; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    // Get dog name from column 1 (column 0 is often empty)
    const dogName = (row[1] || '').trim().toLowerCase();

    if (!dogName) continue;

    // Check if this is an employee row
    const isEmployee = EMPLOYEE_NAMES.some(name => dogName.includes(name.toLowerCase()));

    // Skip total/summary rows
    if (dogName.includes('total') || dogName.includes('sum') || dogName.includes('daily')) {
      continue;
    }

    // Parse values in each mapped column
    for (let col = 0; col < row.length; col++) {
      const mapping = columnMap[col];
      if (!mapping) continue;

      const cellValue = (row[col] || '').trim();
      if (cellValue) {
        const numValue = parseFloat(cellValue.replace(/[$,]/g, ''));
        if (!isNaN(numValue) && numValue > 0) {
          const dateStr = formatDate(mapping.dateObj);
          if (reportData[dateStr]) {
            if (isEmployee) {
              // This is an employee assignment
              reportData[dateStr].employees.add(row[1].trim());
            } else {
              // This is a dog
              if (mapping.type === 'day') {
                reportData[dateStr].numDogsDay++;
                reportData[dateStr].dayTotal += numValue;
              } else {
                reportData[dateStr].numDogsNight++;
                reportData[dateStr].nightTotal += numValue;
              }
            }
          }
        }
      }
    }
  }

  return reportData;
}

async function generateReport() {
  console.error('Fetching sheets and generating report...\n');

  const allData = {};

  for (const sheet of SHEET_GIDS) {
    console.error(`📥 Fetching sheet: ${sheet.description} (gid=${sheet.gid})...`);
    const csvText = await fetchSheetCSV(sheet.gid);
    const rows = parseCSV(csvText);
    const sheetData = parseSheetForReport(rows);

    const dateCount = Object.keys(sheetData).length;
    console.error(`   Found ${dateCount} dates`);

    // Merge into allData
    for (const [date, data] of Object.entries(sheetData)) {
      if (!allData[date]) {
        allData[date] = data;
      } else {
        // Merge (shouldn't happen but just in case)
        allData[date].numDogsDay += data.numDogsDay;
        allData[date].numDogsNight += data.numDogsNight;
        allData[date].dayTotal += data.dayTotal;
        allData[date].nightTotal += data.nightTotal;
        data.employees.forEach(e => allData[date].employees.add(e));
      }
    }
  }

  // Sort by date and generate CSV
  const sortedDates = Object.keys(allData).sort();

  // Output CSV header
  console.log('date,num_dogs_day,num_dogs_night,employee_assigned,total,total_65_percent');

  for (const date of sortedDates) {
    const data = allData[date];
    const total = data.dayTotal + data.nightTotal;
    const total65 = total * 0.65;
    const employees = Array.from(data.employees).join('; ');

    console.log(`${date},${data.numDogsDay},${data.numDogsNight},"${employees}",${total.toFixed(2)},${total65.toFixed(2)}`);
  }

  console.error(`\n✅ Generated report for ${sortedDates.length} dates`);
}

generateReport().catch(console.error);
