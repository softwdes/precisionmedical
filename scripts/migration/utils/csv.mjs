import { createReadStream } from 'fs'
import { createInterface } from 'readline'

/**
 * Parse a CSV file and return array of objects.
 * Handles quoted fields with commas inside.
 */
export async function parseCSV(filePath) {
  const rows = []
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  let headers = null
  for await (const line of rl) {
    const fields = parseCSVLine(line)
    if (!headers) {
      headers = fields
    } else {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = fields[i] ?? null })
      rows.push(obj)
    }
  }
  return rows
}

function parseCSVLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current === '' ? null : current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current === '' ? null : current)
  return fields
}
