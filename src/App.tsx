import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapDisplay } from './components/MapDisplay';
import { Legend } from './components/Legend';
import { parseFile, cleanGPSData, fetchGistData } from './lib/data-processor';
import { GPSData, Dataset } from './types';
import { Button, buttonVariants } from './components/ui/button';
import { Slider } from './components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Badge } from './components/ui/badge';
import { Switch } from './components/ui/switch';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Upload, 
  Thermometer, 
  Map as MapIcon, 
  Clock, 
  Zap,
  ChevronRight,
  ChevronLeft,
  SkipBack,
  SkipForward,
  Info,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Flame,
  FileText,
  Share2,
  Link as LinkIcon,
  Copy,
  Check,
  Pin,
  Download,
  AlertCircle
} from 'lucide-react';
import { fromZonedTime } from 'date-fns-tz';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { cn } from './lib/utils';
import LZString from 'lz-string';

const TIMEZONE = 'Asia/Bangkok';

export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [currentPlayTime, setCurrentPlayTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(300); 
  const [trailHours, setTrailHours] = useState(7);
  const [isPermanentTrail, setIsPermanentTrail] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [followMarker, setFollowMarker] = useState(false);
  const [showHighTempLayer, setShowHighTempLayer] = useState(false);
  const [focusedEventIndex, setFocusedEventIndex] = useState<{datasetId: string, eventIndex: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [gistUrlInput, setGistUrlInput] = useState("https://gist.github.com/phonanb/f32e85baed64bdf508f913bc6e64a7fe");

  const COLORS = useMemo(() => [
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#22c55e', // Green
    '#eab308', // Yellow
    '#a855f7', // Purple
    '#f97316', // Orange
    '#06b6d4', // Cyan
    '#ec4899', // Pink
    '#84cc16', // Lime
    '#6366f1'  // Indigo
  ], []);

  const timeRange = useMemo(() => {
    if (datasets.length === 0) return { min: 0, max: 0 };
    let min = Infinity;
    let max = -Infinity;
    datasets.forEach(d => {
      if (d.data.length > 0) {
        min = Math.min(min, d.data[0].time.getTime());
        max = Math.max(max, d.data[d.data.length - 1].time.getTime());
      }
    });
    return min === Infinity ? { min: 0, max: 0 } : { min, max };
  }, [datasets]);

  const activeDataset = useMemo(() => {
    return datasets.find(d => d.id === activeDatasetId) || datasets[0] || null;
  }, [datasets, activeDatasetId]);

  const findPointAtTime = (dataset: GPSData[], time: number) => {
    if (dataset.length === 0) return null;
    let low = 0;
    let high = dataset.length - 1;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midTime = dataset[mid].time.getTime();
      if (midTime === time) return dataset[mid];
      if (midTime < time) low = mid + 1;
      else high = mid - 1;
    }
    
    if (low >= dataset.length) return dataset[dataset.length - 1];
    if (high < 0) return dataset[0];
    
    const lowDiff = Math.abs(dataset[low].time.getTime() - time);
    const highDiff = Math.abs(dataset[high].time.getTime() - time);
    
    return lowDiff < highDiff ? dataset[low] : dataset[high];
  };

  const currentPoints = useMemo(() => {
    const points: Record<string, GPSData | null> = {};
    datasets.forEach(d => {
      points[d.id] = findPointAtTime(d.data, currentPlayTime);
    });
    return points;
  }, [datasets, currentPlayTime]);

  const exportToHtml = () => {
    if (!activeDataset) return;
    
    const jsonData = JSON.stringify(activeDataset.data);
    const title = `TempRoute Viz - ${activeDataset.name}`;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        #map { height: 100vh; width: 100vw; }
        .info-panel {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 1000;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 300px;
        }
        .legend {
            position: absolute;
            bottom: 30px;
            right: 10px;
            z-index: 1000;
            background: white;
            padding: 10px;
            border-radius: 4px;
            font-size: 12px;
        }
        .legend-item { display: flex; align-items: center; margin-bottom: 4px; }
        .legend-color { width: 20px; height: 10px; margin-right: 8px; border-radius: 2px; }
    </style>
</head>
<body>
    <div id="map"></div>
    <div class="info-panel">
        <h3 style="margin: 0 0 10px 0;">${title}</h3>
        <p style="font-size: 12px; color: #666; margin: 0;">Total Points: ${activeDataset.data.length}</p>
    </div>
    <div class="legend">
        <div class="legend-item"><div class="legend-color" style="background: #3b82f6;"></div> &lt; 20°C (Cool)</div>
        <div class="legend-item"><div class="legend-color" style="background: rgb(34, 197, 94);"></div> 30°C (Normal)</div>
        <div class="legend-item"><div class="legend-color" style="background: #ef4444;"></div> &gt; 40°C (Hot)</div>
    </div>

    <script>
        const data = ${jsonData};
        const map = L.map('map').setView([data[0].lat, data[0].long], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        function getTempColor(t) {
            if (t < 20) return '#3b82f6';
            if (t >= 40) return '#ef4444';
            if (t < 30) {
                const ratio = (t - 20) / 10;
                const r = Math.floor(59 + (34 - 59) * ratio);
                const g = Math.floor(130 + (197 - 130) * ratio);
                const b = Math.floor(246 + (94 - 246) * ratio);
                return "rgb(" + r + "," + g + "," + b + ")";
            } else {
                const ratio = (t - 30) / 10;
                const r = Math.floor(34 + (239 - 34) * ratio);
                const g = Math.floor(197 + (68 - 197) * ratio);
                const b = Math.floor(94 + (68 - 94) * ratio);
                return "rgb(" + r + "," + g + "," + b + ")";
            }
        }

        const points = data.map(p => [p.lat, p.long]);
        
        // Draw path
        for (let i = 1; i < data.length; i++) {
            L.polyline([
                [data[i-1].lat, data[i-1].long],
                [data[i].lat, data[i].long]
            ], {
                color: getTempColor(data[i].temp),
                weight: 4,
                opacity: 0.8
            }).addTo(map);
        }

        // Add markers for start and end
        L.marker([data[0].lat, data[0].long]).addTo(map).bindPopup('Start Point');
        L.marker([data[data.length-1].lat, data[data.length-1].long]).addTo(map).bindPopup('End Point');

        if (points.length > 0) {
            map.fitBounds(L.polyline(points).getBounds());
        }
    </script>
</body>
</html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDataset.name.split('.')[0]}_viz.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const heatEvents = useMemo(() => {
    const allEvents: Record<string, any[]> = {};
    
    datasets.forEach(d => {
      const data = d.data;
      if (data.length === 0) return;
      
      const events: any[] = [];
      let currentSequence: GPSData[] = [];
      let currentStartIndex = -1;
      
      const processSequence = (seq: GPSData[], startIndex: number) => {
        if (seq.length > 1) {
          const start = seq[0].time.getTime();
          const end = seq[seq.length - 1].time.getTime();
          const durationMinutes = (end - start) / (1000 * 60);
          
          if (durationMinutes >= 15) {
            const temps = seq.map(p => p.temp);
            const locations = Array.from(new Set(seq.map(p => p.location).filter(Boolean))) as string[];
            events.push({
              points: [...seq],
              startTime: seq[0].time,
              endTime: seq[seq.length - 1].time,
              durationMinutes,
              minTemp: Math.min(...temps),
              maxTemp: Math.max(...temps),
              avgTemp: temps.reduce((a, b) => a + b, 0) / temps.length,
              locations,
              startIndex
            });
          }
        }
      };
      
      for (let i = 0; i < data.length; i++) {
        const p = data[i];
        if (p.temp > 30) {
          if (currentSequence.length === 0) currentStartIndex = i;
          currentSequence.push(p);
        } else {
          processSequence(currentSequence, currentStartIndex);
          currentSequence = [];
          currentStartIndex = -1;
        }
      }
      processSequence(currentSequence, currentStartIndex);
      allEvents[d.id] = events;
    });
    
    return allEvents;
  }, [datasets]);

  const highTempPoints = useMemo(() => {
    const points: Record<string, GPSData[]> = {};
    datasets.forEach(d => {
      points[d.id] = (heatEvents[d.id] || []).flatMap(e => e.points);
    });
    return points;
  }, [datasets, heatEvents]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Load shared data from URL
  useEffect(() => {
    const loadFromUrl = async () => {
      // Try hash first (supports larger data), then fallback to query params for backward compatibility
      let encodedData = null;
      let encodedName = null;
      let gistUrls: string[] = [];
      let shortGistIds: string[] = [];

      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        encodedData = hashParams.get('d');
        encodedName = hashParams.get('n');
        gistUrls = hashParams.getAll('g');
        shortGistIds = hashParams.getAll('gi');
      } else {
        const queryParams = new URLSearchParams(window.location.search);
        encodedData = queryParams.get('d');
        encodedName = queryParams.get('n');
        gistUrls = queryParams.getAll('g');
        shortGistIds = queryParams.getAll('gi');
      }

      // Reconstruct full URLs from shortened IDs
      const allGists = [...gistUrls];
      shortGistIds.forEach(id => {
        allGists.push(`https://gist.github.com/${id}`);
      });

      const loadedDatasets: Dataset[] = [];

      // Priority: Gist URLs if present
      if (allGists.length > 0) {
        setIsLoading(true);
        try {
          for (const url of allGists) {
            const result = await fetchGistData(url);
            const { cleaned, locationCol } = cleanGPSData(result.data);
            
            if (cleaned.length > 0) {
              // Apply standard time filtering
              const filterStart = fromZonedTime('2026-03-20 07:00:00', TIMEZONE);
              const filterEnd = fromZonedTime('2026-03-27 20:00:00', TIMEZONE);

              const filtered = cleaned.filter(point => {
                const t = point.time.getTime();
                return t >= filterStart.getTime() && t <= filterEnd.getTime();
              });

              if (filtered.length > 0) {
                loadedDatasets.push({
                  id: `gist-${Date.now()}-${loadedDatasets.length}`,
                  name: result.title || `Gist Route`,
                  data: filtered,
                  color: COLORS[loadedDatasets.length % COLORS.length],
                  visible: true,
                  locationCol,
                  url
                });
              }
            }
          }
        } catch (err) {
          console.error("Failed to load Gist from URL", err);
          setError("Failed to load Gist from link.");
        } finally {
          setIsLoading(false);
        }
      } 
      
      // Fallback or addition: Compressed data
      if (encodedData && loadedDatasets.length === 0) {
        try {
          const decompressed = LZString.decompressFromEncodedURIComponent(encodedData);
          if (decompressed) {
            const parsed = JSON.parse(decompressed);
            let restored = [];

            // Handle Version 2 format (Delta-encoded array)
            if (parsed.v === 2 && Array.isArray(parsed.d)) {
              const locations = parsed.ls || [];
              const [bLat, bLong, bTime, bTemp] = parsed.b;
              
              let lastLat = bLat;
              let lastLong = bLong;
              let lastTime = bTime;
              let lastTemp = bTemp;

              restored = parsed.d.map((delta: any) => {
                const [dLat, dLong, dTime, dTemp, locIdx] = delta;
                lastLat += dLat;
                lastLong += dLong;
                lastTime += dTime;
                lastTemp += dTemp;

                return {
                  lat: lastLat / 1e6,
                  long: lastLong / 1e6,
                  time: new Date(lastTime),
                  temp: lastTemp / 10,
                  location: locations[locIdx] || ""
                };
              });
              
              restored.unshift({
                lat: bLat / 1e6,
                long: bLong / 1e6,
                time: new Date(bTime),
                temp: bTemp / 10,
                location: locations[parsed.bli] || ""
              });
            } else {
              restored = parsed.map((p: any) => ({
                lat: p.a !== undefined ? p.a : p.lat,
                long: p.o !== undefined ? p.o : p.long,
                temp: p.t !== undefined ? p.t : p.temp,
                time: p.m !== undefined ? new Date(p.m) : new Date(p.time),
                location: p.l !== undefined ? p.l : p.location
              }));
            }

            if (restored.length > 0) {
              loadedDatasets.push({
                id: `shared-${Date.now()}`,
                name: (encodedName ? decodeURIComponent(encodedName) : 'Shared Data'),
                data: restored,
                color: COLORS[loadedDatasets.length % COLORS.length],
                visible: true,
                locationCol: 'Location'
              });
            }
          }
        } catch (err) {
          console.error("Failed to load shared data", err);
          setError("Failed to load shared data from URL.");
        }
      }

      if (loadedDatasets.length > 0) {
        setDatasets(loadedDatasets);
        setActiveDatasetId(loadedDatasets[0].id);
        setCurrentPlayTime(loadedDatasets[0].data[0].time.getTime());
        setIsPlaying(true);
      }
    };

    loadFromUrl();
    // Listen for hash changes
    const onHashChange = () => loadFromUrl();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const generateShareLink = () => {
    if (!activeDataset) return;
    
    setIsSharing(true);
    try {
      const url = new URL(window.location.origin + window.location.pathname);
      const hashParams = new URLSearchParams();
      
      // 1. Handle Gist datasets (Shorten them)
      const gistIds: string[] = [];
      datasets.forEach((d) => {
        if (d.url) {
          // Extract ID from Gist URL: https://gist.github.com/user/ID
          const matches = d.url.match(/gist\.github\.com\/([^\/]+\/[a-f0-9]+)/i);
          if (matches && matches[1]) {
            gistIds.push(matches[1]);
          } else {
            hashParams.append('g', d.url); // Fallback to full URL
          }
        }
      });
      
      gistIds.forEach(id => hashParams.append('gi', id));

      // 2. Only encode local data if active dataset is local (no URL)
      if (!activeDataset.url) {
        const dataToShare = activeDataset.data;
        const locations: string[] = [];
        const getLocIdx = (loc: string) => {
          let idx = locations.indexOf(loc);
          if (idx === -1) {
            idx = locations.length;
            locations.push(loc);
          }
          return idx;
        };

        const bLat = Math.round(dataToShare[0].lat * 1e6);
        const bLong = Math.round(dataToShare[0].long * 1e6);
        const bTime = dataToShare[0].time.getTime();
        const bTemp = Math.round(dataToShare[0].temp * 10);
        const bLocIdx = getLocIdx(dataToShare[0].location || "");

        let lastLat = bLat;
        let lastLong = bLong;
        let lastTime = bTime;
        let lastTemp = bTemp;

        const deltas = [];
        for (let i = 1; i < dataToShare.length; i++) {
          const curLat = Math.round(dataToShare[i].lat * 1e6);
          const curLong = Math.round(dataToShare[i].long * 1e6);
          const curTime = dataToShare[i].time.getTime();
          const curTemp = Math.round(dataToShare[i].temp * 10);
          const curLocIdx = getLocIdx(dataToShare[i].location || "");

          deltas.push([
            curLat - lastLat,
            curLong - lastLong,
            curTime - lastTime,
            curTemp - lastTemp,
            curLocIdx
          ]);

          lastLat = curLat;
          lastLong = curLong;
          lastTime = curTime;
          lastTemp = curTemp;
        }

        const compactData = {
          v: 2,
          ls: locations,
          b: [bLat, bLong, bTime, bTemp],
          bli: bLocIdx,
          d: deltas
        };

        const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(compactData));
        hashParams.set('d', compressed);
        hashParams.set('n', activeDataset.name);
      }
      
      url.hash = hashParams.toString();
      navigator.clipboard.writeText(url.toString());
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to generate share link", err);
      setError("Failed to generate share link.");
    } finally {
      setIsSharing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    setError(null);
    
    try {
      const newDatasets: Dataset[] = [...datasets];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (newDatasets.length >= 10) {
          setError("Maximum of 10 files can be uploaded.");
          break;
        }
        
        const rawData = await parseFile(file);
        let { cleaned, locationCol } = cleanGPSData(rawData);
        
        if (cleaned.length === 0) continue;

        // Apply time filter if it's the requested Gist or looks like the user's data range
        // But for file upload we usually don't filter unless requested.
        // I will keep standard file upload as is.
        
        newDatasets.push({
          id: `${file.name}-${Date.now()}-${i}`,
          name: file.name,
          data: cleaned,
          color: COLORS[newDatasets.length % COLORS.length],
          visible: true,
          locationCol
        });
      }
      
      setDatasets(newDatasets);
      if (newDatasets.length > 0 && !activeDatasetId) {
        setActiveDatasetId(newDatasets[0].id);
      }
      
      // Update playback range if it's the first upload
      if (datasets.length === 0 && newDatasets.length > 0) {
        let minTime = Infinity;
        newDatasets.forEach(d => {
          if (d.data.length > 0) minTime = Math.min(minTime, d.data[0].time.getTime());
        });
        setCurrentPlayTime(minTime);
      }
      
      setIsPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process files");
    } finally {
      setIsLoading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const loadFromGist = async () => {
    if (!gistUrlInput) return;

    const urls = gistUrlInput.split(/[\s\n,]+/).filter(u => u.trim().startsWith('http'));
    if (urls.length === 0) {
      setError("No valid Gist URLs found.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newDatasetsFromGist: Dataset[] = [];
      const currentDatasetCount = datasets.length;

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        if (currentDatasetCount + newDatasetsFromGist.length >= 20) break;

        try {
          const result = await fetchGistData(url);
          let { cleaned, locationCol } = cleanGPSData(result.data);

          if (cleaned.length === 0) continue;

          // User's specific time range requirement:
          const filterStart = fromZonedTime('2026-03-20 07:00:00', TIMEZONE);
          const filterEnd = fromZonedTime('2026-03-27 20:00:00', TIMEZONE);

          const filtered = cleaned.filter(point => {
            const t = point.time.getTime();
            return t >= filterStart.getTime() && t <= filterEnd.getTime();
          });

          if (filtered.length > 0) {
            newDatasetsFromGist.push({
              id: `gist-${Date.now()}-${i}`,
              name: result.title || `Gist Route`,
              data: filtered,
              color: COLORS[(currentDatasetCount + newDatasetsFromGist.length) % COLORS.length],
              visible: true,
              locationCol,
              url
            });
          } else if (cleaned.length > 0) {
            const first = cleaned[0].time;
            const last = cleaned[cleaned.length - 1].time;
            const rangeStr = `${formatInTimeZone(first, TIMEZONE, 'dd/MM HH:mm')} - ${formatInTimeZone(last, TIMEZONE, 'dd/MM HH:mm')}`;
            throw new Error(`Data found but outside required range (20-27 Mar 2026). Found: ${rangeStr}`);
          }
        } catch (err) {
          console.error(`Failed to load gist from ${url}:`, err);
        }
      }

      if (newDatasetsFromGist.length === 0) {
        throw new Error("No valid GPS data found in any of the provided Gists within the required date range.");
      }

      const updatedDatasets = [...datasets, ...newDatasetsFromGist];
      setDatasets(updatedDatasets);
      
      // Set the first newly loaded dataset as active
      setActiveDatasetId(newDatasetsFromGist[0].id);
      
      if (datasets.length === 0) {
        setCurrentPlayTime(newDatasetsFromGist[0].data[0].time.getTime());
      }
      
      setIsPlaying(true);
      // Clear input on success
      setGistUrlInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Gists");
    } finally {
      setIsLoading(false);
    }
  };

  const resetPlayback = () => {
    setCurrentPlayTime(timeRange.min);
    setIsPlaying(false);
  };

  const stepForward = () => {
    setCurrentPlayTime(prev => Math.min(prev + (5000 * playbackSpeed), timeRange.max));
  };

  const stepBackward = () => {
    setCurrentPlayTime(prev => Math.max(prev - (5000 * playbackSpeed), timeRange.min));
  };

  const goToNextGlobalHeatEvent = () => {
    let earliestNextEvent: number | null = null;
    Object.keys(heatEvents).forEach(datasetId => {
      const events = heatEvents[datasetId] || [];
      const nextEvent = events.find(e => e.startTime.getTime() > currentPlayTime + 1000);
      if (nextEvent) {
        const eventTime = nextEvent.startTime.getTime();
        if (earliestNextEvent === null || eventTime < earliestNextEvent) {
          earliestNextEvent = eventTime;
        }
      }
    });

    if (earliestNextEvent !== null) {
      setCurrentPlayTime(earliestNextEvent);
      setIsPlaying(false);
    }
  };

  const goToPrevGlobalHeatEvent = () => {
    let latestPrevEvent: number | null = null;
    Object.keys(heatEvents).forEach(datasetId => {
      const events = heatEvents[datasetId] || [];
      const prevEvents = events.filter(e => e.startTime.getTime() < currentPlayTime - 5000);
      if (prevEvents.length > 0) {
        const eventTime = prevEvents[prevEvents.length - 1].startTime.getTime();
        if (latestPrevEvent === null || eventTime > latestPrevEvent) {
          latestPrevEvent = eventTime;
        }
      }
    });

    if (latestPrevEvent !== null) {
      setCurrentPlayTime(latestPrevEvent);
      setIsPlaying(false);
    }
  };

  const removeDataset = (id: string) => {
    setDatasets(prev => {
      const filtered = prev.filter(d => d.id !== id);
      if (activeDatasetId === id) {
        setActiveDatasetId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  const toggleDatasetVisibility = (id: string) => {
    setDatasets(prev => prev.map(d => 
      d.id === id ? { ...d, visible: !d.visible } : d
    ));
  };

  useEffect(() => {
    if (isPlaying && datasets.length > 0 && !isDragging) {
      timerRef.current = setInterval(() => {
        setCurrentPlayTime(prev => {
          if (prev >= timeRange.max) {
            setIsPlaying(false);
            return prev;
          }
          return prev + (1000 * playbackSpeed); 
        });
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, datasets.length, playbackSpeed, isDragging, timeRange.max]);

  const activePoint = activeDatasetId ? currentPoints[activeDatasetId] : null;

  return (
    <div className={cn(
      "flex flex-col h-screen font-sans overflow-hidden",
      isDarkMode ? "bg-background text-foreground" : "bg-slate-50 text-slate-900"
    )}>
      {/* Header */}
      <header className={cn(
        "h-16 border-b flex items-center px-4 md:px-6 justify-between shrink-0 z-50",
        "bg-card border-border"
      )}>
        <div className="flex items-center gap-2 md:gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex"
          >
            <MapIcon className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-sm md:text-lg font-bold tracking-tight text-foreground">TempRoute Viz</h1>
            <p className="text-[8px] md:text-[9px] uppercase tracking-widest font-bold text-muted-foreground">GPS Fleet Analysis</p>
          </div>
        </div>

        {/* Header Content Update */}
        <div className="flex items-center gap-2 md:gap-4">
          {datasets.length > 0 && (
            <Badge variant="secondary" className="hidden lg:flex border border-border bg-muted/50 text-muted-foreground font-bold text-[10px]">
              {datasets.length} Vehicles
            </Badge>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="rounded-full w-8 h-8 md:w-10 md:h-10"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          {datasets.length > 0 && (
            <Button
              variant={shareSuccess ? "default" : "outline"}
              size="sm"
              onClick={generateShareLink}
              disabled={isSharing}
              className={cn(
                "flex items-center gap-2 transition-all h-8 md:h-9 px-2 md:px-3",
                shareSuccess ? "bg-green-500 hover:bg-green-600 border-green-500 text-white" : "border-border text-foreground hover:bg-accent"
              )}
            >
              {shareSuccess ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{shareSuccess ? 'Copied!' : 'Share'}</span>
            </Button>
          )}

          <div className="relative flex gap-2">
            <Input
              type="file"
              accept=".csv,.xlsx,.xls,.tsv,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              multiple
            />
            <label 
              htmlFor="file-upload" 
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }), 
                "flex items-center gap-2 cursor-pointer transition-all active:scale-95 h-8 md:h-9 px-2 md:px-3 shadow-sm",
                "bg-primary text-primary-foreground hover:opacity-90"
              )}
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Add Vehicles</span>
            </label>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {/* Sidebar Overlay */}
        {isSidebarOpen && !isPinned && (
          <div 
            className="absolute inset-0 bg-black/40 z-[1500] backdrop-blur-[2px] transition-all duration-300" 
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        
        {/* Sidebar Controls */}
        <aside className={cn(
          "h-full border-r overflow-y-auto flex flex-col gap-6 shrink-0 transition-all duration-300 ease-in-out",
          isPinned ? "relative z-20" : "absolute z-[1600] shadow-[0_0_50px_rgba(0,0,0,0.1)] dark:shadow-black",
          "bg-card border-border",
          isSidebarOpen 
            ? "w-72 md:w-80 p-6 translate-x-0 opacity-100" 
            : "w-0 p-0 border-none -translate-x-full opacity-0 overflow-hidden"
        )}>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Controls</span>
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn(
                  "w-6 h-6 rounded-md transition-all",
                  isPinned ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setIsPinned(!isPinned)}
                title={isPinned ? "Unpin Sidebar" : "Pin Sidebar"}
              >
                <Pin className={cn("w-3 h-3", isPinned && "fill-current")} />
              </Button>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-2">
              <textarea 
                placeholder="Paste Gist URLs here (one per line)..." 
                value={gistUrlInput}
                onChange={(e) => setGistUrlInput(e.target.value)}
                className={cn(
                  "text-[10px] min-h-[80px] w-full p-2 rounded-md border transition-all focus:ring-2 focus:ring-ring/20 resize-none",
                  "bg-muted/50 border-border text-foreground placeholder:text-muted-foreground"
                )}
              />
              <Button
                variant="outline"
                className={cn(
                  "h-9 w-full flex items-center justify-center gap-2 border-dashed transition-all hover:scale-[0.98] active:scale-95",
                  "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                onClick={loadFromGist}
                disabled={!gistUrlInput || isLoading}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{isLoading ? 'Loading...' : 'Link Bulk Gists'}</span>
              </Button>
            </div>
          </div>

          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2 text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              Vehicles ({datasets.length})
            </h2>
            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
              {datasets.map((d) => (
                <div 
                  key={d.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer",
                    activeDatasetId === d.id 
                      ? "bg-accent border-primary/20 shadow-sm ring-1 ring-primary/10"
                      : "bg-muted/30 border-transparent hover:border-border"
                  )}
                  onClick={() => setActiveDatasetId(activeDatasetId === d.id ? null : d.id)}
                >
                  <div 
                    className="w-3 h-3 rounded-full shrink-0" 
                    style={{ backgroundColor: d.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold truncate leading-tight text-foreground">{d.name.split('.')[0]}</p>
                    <p className="text-[9px] text-muted-foreground font-medium">
                      {d.data.length} pts • {currentPoints[d.id]?.temp.toFixed(1) || '--'}°
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {d.url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 rounded-md hover:bg-accent transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(d.url!);
                        }}
                        title="Copy Gist URL"
                      >
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 rounded-md hover:bg-accent transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDatasetVisibility(d.id);
                      }}
                    >
                      {d.visible ? <Eye className="w-3 h-3 text-primary" /> : <EyeOff className="w-3 h-3 text-muted-foreground" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDataset(d.id);
                      }}
                    >
                      <span className="text-xs font-bold">×</span>
                    </Button>
                  </div>
                </div>
              ))}
              {datasets.length === 0 && (
                  <div className="text-center py-8 px-4 border border-dashed border-border bg-muted/20 rounded-xl">
                    <Upload className="w-5 h-5 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">No vehicles added</p>
                  </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2 text-muted-foreground">
              <Info className="w-3 h-3" />
              Playback Engine
            </h2>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                    <Label className="text-xs font-bold uppercase tracking-tight text-foreground/80">Speed</Label>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                    {playbackSpeed}x
                  </span>
                </div>
                <Slider
                  value={[playbackSpeed]}
                  min={1}
                  max={600}
                  step={1}
                  onValueChange={(val) => {
                    const v = Array.isArray(val) ? val[0] : val;
                    if (typeof v === 'number') setPlaybackSpeed(v);
                  }}
                  disabled={datasets.length === 0}
                />
                <div className="flex justify-between text-[8px] text-muted-foreground font-bold uppercase tracking-widest px-1">
                  <span>Normal</span>
                  <span>Max Velocity</span>
                </div>
              </div>

              <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] font-bold uppercase tracking-tight text-foreground/80">Trail</Label>
                      <div className="flex items-center gap-1.5 ml-2">
                        <Switch 
                          id="permanent-trail"
                          checked={isPermanentTrail}
                          onCheckedChange={setIsPermanentTrail}
                          className="scale-75"
                          disabled={datasets.length === 0}
                        />
                        <Label htmlFor="permanent-trail" className="text-[9px] font-bold uppercase text-muted-foreground cursor-pointer tracking-wider">Infinite</Label>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-muted-foreground">{isPermanentTrail ? '∞' : `${trailHours}h`}</span>
                  </div>
                {!isPermanentTrail && (
                  <Slider
                    value={[trailHours || 7]}
                    min={1}
                    max={24}
                    step={1}
                    onValueChange={(val) => {
                      const v = Array.isArray(val) ? val[0] : val;
                      if (typeof v === 'number') setTrailHours(v);
                    }}
                    disabled={datasets.length === 0}
                  />
                )}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2 text-muted-foreground">
              <MapIcon className="w-3 h-3" />
              Viewport Config
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  {followMarker ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                  <Label className="text-[11px] font-bold uppercase tracking-tight text-foreground/80 cursor-pointer" htmlFor="follow-marker">Dynamic Focus</Label>
                </div>
                <Switch
                  id="follow-marker"
                  checked={followMarker}
                  onCheckedChange={setFollowMarker}
                  disabled={datasets.length === 0}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Flame className={cn("w-4 h-4 transition-colors", showHighTempLayer ? "text-primary" : "text-muted-foreground")} />
                    <div className="flex flex-col">
                      <Label className="text-[11px] font-bold uppercase tracking-tight text-foreground/80 cursor-pointer" htmlFor="high-temp-layer">Thermal Pulse</Label>
                      <span className="text-[9px] text-muted-foreground font-bold tracking-tight">Threshold: 30°C</span>
                    </div>
                  </div>
                  <Switch
                    id="high-temp-layer"
                    checked={showHighTempLayer}
                    onCheckedChange={(val) => {
                      setShowHighTempLayer(val);
                      if (!val) setFocusedEventIndex(null);
                    }}
                    disabled={datasets.length === 0}
                  />
                </div>
                {showHighTempLayer && datasets.length > 0 && activeDatasetId && (heatEvents[activeDatasetId]?.length || 0) === 0 && (
                  <div className="px-3 py-2 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30 animate-in fade-in slide-in-from-top-1">
                    <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium flex items-center gap-1.5">
                      <Info className="w-3 h-3" />
                      ไม่พบตำแหน่งที่อุณหภูมิเกินเกณฑ์
                    </p>
                  </div>
                )}

                {showHighTempLayer && activeDatasetId && heatEvents[activeDatasetId] && (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                    {heatEvents[activeDatasetId].map((event, idx) => (
                      <button 
                        key={`event-${idx}`}
                        onClick={() => {
                          setFocusedEventIndex({ datasetId: activeDatasetId, eventIndex: idx });
                          setFollowMarker(false);
                        }}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border text-[10px] space-y-2 animate-in fade-in slide-in-from-right-2 transition-all hover:ring-2 hover:ring-orange-500/50",
                          isDarkMode 
                            ? (focusedEventIndex?.datasetId === activeDatasetId && focusedEventIndex?.eventIndex === idx ? "bg-orange-900/20 border-orange-500/50" : "bg-slate-950/50 border-slate-800") 
                            : (focusedEventIndex?.datasetId === activeDatasetId && focusedEventIndex?.eventIndex === idx ? "bg-orange-50 border-orange-200" : "bg-white border-slate-200")
                        )}
                      >
                        <div className="flex justify-between items-center border-b pb-1.5 mb-1.5 border-slate-100 dark:border-slate-800">
                          <div className="flex flex-col">
                            <span className="font-bold text-orange-500 flex items-center gap-1">
                              <Flame className="w-3 h-3" />
                              Heat Event #{idx + 1}
                            </span>
                            <span className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">
                              {formatInTimeZone(event.startTime, TIMEZONE, 'EEEE, dd MMMM yyyy')}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-[8px] h-5 px-1.5 border-orange-200 text-orange-600 bg-orange-50/50 dark:bg-orange-900/20 dark:border-orange-800">
                            {Math.round(event.durationMinutes)} mins
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col">
                            <span className="text-slate-500 uppercase tracking-tighter font-bold">Start</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">{formatInTimeZone(event.startTime, TIMEZONE, 'HH:mm:ss')}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-slate-500 uppercase tracking-tighter font-bold">End</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">{formatInTimeZone(event.endTime, TIMEZONE, 'HH:mm:ss')}</span>
                          </div>
                        </div>

                        {event.locations.length > 0 && (
                          <div className="flex flex-col gap-1 pt-1 border-t border-slate-50 dark:border-slate-800/50">
                            <span className="text-slate-500 uppercase tracking-tighter font-bold">Locations</span>
                            <div className="flex flex-wrap gap-1">
                              {event.locations.map((loc, lIdx) => (
                                <span key={lIdx} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 truncate max-w-full">
                                  {loc}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-1 pt-1 border-t border-border">
                          <div className="flex flex-col items-center p-1 rounded bg-muted/30">
                            <span className="text-[8px] text-muted-foreground uppercase font-bold">Min</span>
                            <span className="font-bold text-blue-500 text-[10px]">{event.minTemp.toFixed(1)}°</span>
                          </div>
                          <div className="flex flex-col items-center p-1 rounded bg-destructive/10">
                            <span className="text-[8px] text-destructive uppercase font-bold">Max</span>
                            <span className="font-bold text-destructive text-[10px]">{event.maxTemp.toFixed(1)}°</span>
                          </div>
                          <div className="flex flex-col items-center p-1 rounded bg-muted/30">
                            <span className="text-[8px] text-muted-foreground uppercase font-bold">Avg</span>
                            <span className="font-bold text-foreground text-[10px]">{event.avgTemp.toFixed(1)}°</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </aside>

        {/* Map Area */}
        <section className={cn(
          "flex-1 relative p-4",
          "bg-muted/30"
        )}>
          {error && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[2000] bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 border border-white/10 animate-in fade-in slide-in-from-top-4 duration-300">
              <Info className="w-4 h-4" />
              <span className="text-sm font-medium">{error}</span>
              <Button variant="ghost" size="sm" onClick={() => setError(null)} className="h-6 w-6 p-0 hover:bg-white/20 text-white">×</Button>
            </div>
          )}

          {isLoading && (
            <div className="absolute inset-0 z-[2000] bg-background/60 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin" />
                <p className="text-sm font-bold text-foreground">Processing Data...</p>
              </div>
            </div>
          )}

          {datasets.length > 0 ? (
            <>
              {/* Current Status Bar (Summary of all vehicles) */}
              <div className={cn(
                "absolute top-4 left-16 z-[1000] backdrop-blur-md rounded-2xl border shadow-xl flex flex-col p-4 gap-3 transition-all duration-300 max-w-[220px] w-auto",
                "bg-card/90 border-border"
              )}>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase font-bold text-muted-foreground mb-1 tracking-widest pl-1 border-l-2 border-primary">Playback Time</span>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-2xl font-mono font-bold tracking-tight text-foreground whitespace-nowrap leading-none">
                        {formatInTimeZone(new Date(currentPlayTime), TIMEZONE, 'HH:mm:ss')}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col border-t border-border pt-2">
                    <span className="text-[8px] uppercase font-bold text-muted-foreground mb-0.5 tracking-wider">Date</span>
                    <span className="text-[10px] font-bold text-foreground">
                      {formatInTimeZone(new Date(currentPlayTime), TIMEZONE, 'dd MMM yyyy')}
                    </span>
                  </div>

                  <div className="space-y-1.5 border-t border-border pt-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                    {datasets.filter(d => d.visible).map(d => {
                      const point = currentPoints[d.id];
                      if (!point) return null;
                      const isHighTemp = point.temp > 30;
                      
                      return (
                        <div 
                          key={`status-${d.id}`} 
                          className="flex items-center justify-between gap-3 p-1 rounded hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div 
                              className="w-2 h-2 rounded-full shrink-0 shadow-sm border border-white/20" 
                              style={{ backgroundColor: d.color }}
                            />
                            <span className="text-[10px] font-bold text-foreground truncate max-w-[100px]">
                              {d.name.split('.')[0]}
                            </span>
                          </div>
                          <span className={cn(
                            "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors",
                            isHighTemp 
                              ? "text-white bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.4)]" 
                              : "text-muted-foreground bg-muted"
                          )}>
                            {point.temp.toFixed(1)}°
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <MapDisplay 
                datasets={datasets}
                currentPlayTime={currentPlayTime}
                currentPoints={currentPoints}
                trailHours={trailHours} 
                isPermanentTrail={isPermanentTrail}
                followMarker={followMarker}
                showHighTempLayer={showHighTempLayer}
                highTempPoints={highTempPoints}
                focusPoints={focusedEventIndex ? heatEvents[focusedEventIndex.datasetId]?.[focusedEventIndex.eventIndex]?.points : undefined}
                isDarkMode={isDarkMode}
                activeDatasetId={activeDatasetId}
                resizeTrigger={`${isSidebarOpen}-${isPinned}-${datasets.length}`}
              />
              <Legend isDarkMode={isDarkMode} />
              
              {/* Timeline Slider Overlay */}
              <div className={cn(
                "absolute bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 w-[90%] md:w-[70%] z-[1000] backdrop-blur-md p-4 md:p-6 rounded-2xl border shadow-2xl",
                "bg-card/90 border-border"
              )}>
                <div className="flex flex-col gap-2 md:gap-4">
                  <div className="flex justify-between items-center px-1 md:px-2">
                    <div className="flex flex-col">
                      <span className="text-[8px] md:text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-1 leading-none">Timeline Scope</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-foreground opacity-70">
                          {formatInTimeZone(new Date(timeRange.min), TIMEZONE, 'dd/MM HH:mm')}
                        </span>
                        <div className="h-[1px] w-4 bg-border" />
                        <span className="text-[10px] font-bold text-foreground opacity-70">
                          {formatInTimeZone(new Date(timeRange.max), TIMEZONE, 'dd/MM HH:mm')}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[8px] md:text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-1 leading-none">Active Fleet</span>
                      <Badge variant="outline" className="text-[9px] border-primary/20 bg-primary/5 text-primary">
                        {datasets.length} Vehicles Displayed
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={goToPrevGlobalHeatEvent}
                        disabled={datasets.length === 0}
                        className="rounded-full w-7 h-7 md:w-10 md:h-10 shrink-0 border-border hover:bg-muted"
                        title="Prev Global Heat Event"
                      >
                        <SkipBack className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={stepBackward}
                        disabled={datasets.length === 0}
                        className="rounded-full w-7 h-7 md:w-10 md:h-10 shrink-0 border-border hover:bg-muted"
                        title="Step Backward"
                      >
                        <ChevronLeft className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={resetPlayback}
                        disabled={datasets.length === 0}
                        className="rounded-full w-7 h-7 md:w-10 md:h-10 shrink-0 border-border hover:bg-muted"
                        title="Reset"
                      >
                        <RotateCcw className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>

                      <Button
                        size="icon"
                        variant={isPlaying ? "outline" : "default"}
                        className={cn(
                          "w-8 h-8 md:w-12 md:h-12 rounded-full shadow-lg transition-all shrink-0 scale-110 md:scale-110",
                          !isPlaying ? 'bg-primary text-primary-foreground hover:opacity-90' : 'border-border hover:bg-muted'
                        )}
                        onClick={() => setIsPlaying(!isPlaying)}
                        disabled={datasets.length === 0}
                        title={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? <Pause className="w-3 h-3 md:w-5 md:h-5" /> : <Play className="w-3 h-3 md:w-5 md:h-5 fill-current" />}
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={stepForward}
                        disabled={datasets.length === 0}
                        className="rounded-full w-7 h-7 md:w-10 md:h-10 shrink-0 border-border hover:bg-muted"
                        title="Step Forward"
                      >
                        <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={goToNextGlobalHeatEvent}
                        disabled={datasets.length === 0}
                        className="rounded-full w-7 h-7 md:w-10 md:h-10 shrink-0 border-border hover:bg-muted"
                        title="Next Global Heat Event"
                      >
                        <SkipForward className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>
                    </div>
                    <Slider
                      value={[currentPlayTime]}
                      min={timeRange.min}
                      max={timeRange.max}
                      step={1000}
                      onValueChange={(val) => {
                        const v = Array.isArray(val) ? val[0] : val;
                        if (typeof v === 'number') {
                          setCurrentPlayTime(v);
                          setIsPlaying(false);
                        }
                      }}
                      onPointerDown={() => {
                        setIsDragging(true);
                        setIsPlaying(false);
                      }}
                      onPointerUp={() => setIsDragging(false)}
                      className="flex-1"
                      disabled={datasets.length === 0}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center rounded-xl border bg-card border-border shadow-inner">
              <div className="max-w-md text-center p-8">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-muted rotate-3 shadow-lg">
                  <MapIcon className="w-10 h-10 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold mb-2 text-foreground">Ready to Visualize</h2>
                <p className="text-muted-foreground mb-8 text-sm">
                  Upload your GPS and temperature data (.csv or .xlsx) or link from GitHub Gists to see an animated route analysis with historical trails.
                </p>
                <div className="flex flex-col gap-4 items-center">
                  <label 
                    htmlFor="file-upload" 
                    className={cn(
                      buttonVariants({ size: "lg" }), 
                      "px-10 bg-primary cursor-pointer text-primary-foreground shadow-xl shadow-primary/20 hover:scale-105 transition-all"
                    )}
                  >
                    Select Local File
                  </label>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Supported: CSV, Excel, Gist</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
