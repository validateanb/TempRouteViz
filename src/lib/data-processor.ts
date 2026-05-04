import { parse } from 'papaparse';
import * as XLSX from 'xlsx';
import { GPSData } from '../types';
import { fromZonedTime } from 'date-fns-tz';
import { parse as parseDate } from 'date-fns';

const TIMEZONE = 'Asia/Bangkok';

export const cleanGPSData = (data: any[]): { cleaned: GPSData[], locationCol: string | null } => {
  const colMap: Record<string, string[]> = {
    time: [],
    lat: [],
    long: [],
    temp: []
  };
  if (data.length === 0) return { cleaned: [], locationCol: null };

  const originalCols = Object.keys(data[0] || {});
  
  originalCols.forEach(c => {
    const lc = c.toLowerCase();
    // Use arrays to store multiple matches (e.g. "Date" and "Time")
    if (lc === 'date' || lc === 'time' || lc.includes('time') || lc.includes('date')) {
      colMap['time'].push(c);
    }
    else if (lc.includes('lat')) colMap['lat'].push(c);
    else if (lc.includes('long') || lc.includes('lng')) colMap['long'].push(c);
    else if (lc.includes('temp')) colMap['temp'].push(c);
  });

  const locationCol = originalCols.find(c => {
    const lc = c.toLowerCase();
    return lc.includes('location') || lc.includes('place') || lc.includes('address') || lc.includes('site') || lc.includes('point');
  }) || null;

  const cleaned: GPSData[] = data
    .map(row => {
      // Combine date/time columns if multiple found
      let timeStr = colMap['time'].map(c => String(row[c])).join(' ').trim();
      let time: Date | null = null;
      
      if (timeStr) {
        // Check if it's already a Date object or numeric timestamp
        const firstTimeVal = row[colMap['time'][0]];
        if (firstTimeVal instanceof Date) {
          const isoStr = firstTimeVal.toISOString().replace('Z', ''); 
          time = fromZonedTime(isoStr, TIMEZONE);
        } else if (typeof firstTimeVal === 'number' && firstTimeVal > 40000 && firstTimeVal < 60000) {
          // Excel date serial
          const ms = (firstTimeVal - 25569) * 86400 * 1000;
          const date = new Date(ms);
          const isoStr = date.toISOString().replace('Z', '');
          time = fromZonedTime(isoStr, TIMEZONE);
        } else {
          // Parse string combinations
          const cleanedTimeVal = timeStr.replace(/\s+/g, ' ');
          
          // Try common formats
          const formats = [
            'M/d/yyyy h:mm:ss a',
            'M/d/yyyy hh:mm:ss a',
            'M/d/yyyy HH:mm:ss',
            'd/M/yyyy h:mm:ss a',
            'd/M/yyyy hh:mm:ss a',
            'yyyy-MM-dd HH:mm:ss',
            'dd/MM/yyyy HH:mm:ss',
            'M/d/yyyy h:mm a',
            'MM/dd/yyyy HH:mm:ss',
            'd/M/yy HH:mm:ss',
            'M/d/yy HH:mm:ss'
          ];
          
          for (const fmt of formats) {
            try {
              const p = parseDate(cleanedTimeVal, fmt, new Date());
              if (!isNaN(p.getTime())) {
                const naiveStr = p.getFullYear() + '-' + 
                              String(p.getMonth() + 1).padStart(2, '0') + '-' + 
                              String(p.getDate()).padStart(2, '0') + ' ' + 
                              String(p.getHours()).padStart(2, '0') + ':' + 
                              String(p.getMinutes()).padStart(2, '0') + ':' + 
                              String(p.getSeconds()).padStart(2, '0');
                time = fromZonedTime(naiveStr, TIMEZONE);
                break;
              }
            } catch (e) {}
          }

          if (!time) {
            const parsed = fromZonedTime(cleanedTimeVal, TIMEZONE);
            if (!isNaN(parsed.getTime())) {
              time = parsed;
            }
          }
        }
      }

      const latCol = colMap['lat'][0];
      const longCol = colMap['long'][0];
      const tempCol = colMap['temp'][0];

      const lat = latCol ? parseFloat(String(row[latCol]).replace(/,/g, '')) : NaN;
      const long = longCol ? parseFloat(String(row[longCol]).replace(/,/g, '')) : NaN;
      const temp = tempCol ? parseFloat(String(row[tempCol]).replace(/,/g, '')) : NaN;
      const location = locationCol ? row[locationCol] : undefined;

      return { time: time || new Date(0), lat, long, temp, location };
    })
    .filter(row => 
      !isNaN(row.time.getTime()) && 
      row.time.getTime() !== 0 &&
      !isNaN(row.lat) && 
      !isNaN(row.long) && 
      !isNaN(row.temp)
    )
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  return { cleaned, locationCol };
};

export const parseFile = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    if (file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.txt')) {
      reader.onload = (e) => {
        const text = e.target?.result as string;
        // Auto detect delimiter or fallback to tab for .tsv/.txt
        let config: any = {
          header: true,
          skipEmptyLines: true,
          complete: (results: any) => resolve(results.data),
          error: (err: any) => reject(err)
        };
        
        if (file.name.endsWith('.tsv') || file.name.endsWith('.txt')) {
          config.delimiter = '\t';
        }
        
        parse(text, config);
      };
      reader.readAsText(file);
    } else {
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        resolve(jsonData);
      };
      reader.readAsArrayBuffer(file);
    }
  });
};

export const fetchGistData = async (url: string): Promise<{ data: any[], title: string }> => {
  // Use proxy to avoid CORS
  const response = await fetch(`/api/proxy-gist?url=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error('Failed to fetch Gist data via proxy');
  
  const json = await response.json();
  const { data: text, title } = json;
  
  return new Promise((resolve, reject) => {
    parse(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: "", // Auto-detect
      complete: (results) => resolve({ data: results.data, title }),
      error: (err) => reject(err)
    });
  });
};

export const getTempColor = (t: number): string => {
  if (isNaN(t)) return '#808080'; // Grey
  if (t < 20) return '#3b82f6';   // Blue
  if (t >= 40) return '#ef4444';  // Red
  
  if (t < 30) {
    const ratio = (t - 20) / 10;
    const r = Math.floor(59 + (34 - 59) * ratio);
    const g = Math.floor(130 + (197 - 130) * ratio);
    const b = Math.floor(246 + (94 - 246) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const ratio = (t - 30) / 10;
    const r = Math.floor(34 + (239 - 34) * ratio);
    const g = Math.floor(197 + (68 - 197) * ratio);
    const b = Math.floor(94 + (68 - 94) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  }
};
