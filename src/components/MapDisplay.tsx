import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { GPSData, Dataset } from '../types';
import { getTempColor } from '../lib/data-processor';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { cn } from '../lib/utils';

const TIMEZONE = 'Asia/Bangkok';

// Fix for default marker icons in Leaflet + Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapDisplayProps {
  datasets: Dataset[];
  currentPlayTime: number;
  currentPoints: Record<string, GPSData | null>;
  trailHours: number;
  isPermanentTrail: boolean;
  followMarker: boolean;
  showHighTempLayer: boolean;
  highTempPoints: Record<string, GPSData[]>;
  focusPoints?: GPSData[];
  isDarkMode: boolean;
  activeDatasetId: string | null;
  resizeTrigger?: any;
}

const MapAutoCenter: React.FC<{ center: [number, number]; enabled: boolean }> = ({ center, enabled }) => {
  const map = useMap();
  useEffect(() => {
    if (enabled) {
      map.setView(center);
    }
  }, [center, map, enabled]);
  return null;
};

const MapResize: React.FC<{ trigger: any }> = ({ trigger }) => {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 300);
  }, [map, trigger]);
  return null;
};

const MapFocus: React.FC<{ points?: GPSData[] }> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points && points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.long]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [points, map]);
  return null;
};

export const MapDisplay: React.FC<MapDisplayProps> = ({ 
  datasets, 
  currentPlayTime,
  currentPoints,
  trailHours, 
  isPermanentTrail,
  followMarker, 
  showHighTempLayer,
  highTempPoints,
  focusPoints,
  isDarkMode,
  activeDatasetId,
  resizeTrigger
}) => {
  const visibleDatasets = useMemo(() => datasets.filter(d => d.visible), [datasets]);
  
  const activePoint = activeDatasetId ? currentPoints[activeDatasetId] : null;
  const points: (GPSData | null)[] = Object.values(currentPoints);
  const firstVisiblePoint = points.find(p => p !== null);
  
  const center: [number, number] = activePoint 
    ? [activePoint.lat, activePoint.long] 
    : (firstVisiblePoint ? [firstVisiblePoint.lat, firstVisiblePoint.long] : [13.7563, 100.5018]);

  if (datasets.length === 0) return null;

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-border shadow-xl">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution={isDarkMode 
            ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
          url={isDarkMode
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
        />
        
        {/* High Temp Layers (Background) */}
        {showHighTempLayer && visibleDatasets.map(d => {
          const points = highTempPoints[d.id] || [];
          return points.map((p, i) => (
            <CircleMarker
              key={`high-temp-${d.id}-${i}`}
              center={[p.lat, p.long]}
              radius={6}
              pathOptions={{
                fillColor: d.color,
                color: '#FFD700',
                weight: 1,
                fillOpacity: 0.2,
              }}
            >
              <Popup>
                  <div className="text-[10px] p-2 leading-tight">
                    <p className="font-bold uppercase tracking-widest mb-1 opacity-70" style={{ color: d.color }}>Vehicle: {d.name.split('.')[0]}</p>
                    <p className="font-bold text-primary flex items-center gap-1 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Thermal Alert (&gt;30°C)
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-1 pt-1 border-t border-border">
                      <div>
                        <span className="text-[8px] uppercase text-muted-foreground block">Temp</span>
                        <span className="font-mono font-bold">{p.temp.toFixed(1)}°</span>
                      </div>
                      <div>
                        <span className="text-[8px] uppercase text-muted-foreground block">Time</span>
                        <span className="font-mono font-bold">{formatInTimeZone(p.time, TIMEZONE, 'HH:mm')}</span>
                      </div>
                    </div>
                  </div>
              </Popup>
            </CircleMarker>
          ));
        })}

        {/* Trail Markers & Lines for each dataset */}
        {visibleDatasets.map(d => {
          const currentPoint = currentPoints[d.id];
          if (!currentPoint) return null;

          const endTime = currentPoint.time.getTime();
          const startTime = isPermanentTrail ? d.data[0].time.getTime() : (endTime - trailHours * 60 * 60 * 1000);
          
          const trailPoints = d.data.filter(p => {
            const t = p.time.getTime();
            return t >= startTime && t <= endTime;
          });

          const trailSegments: { color: string, positions: [number, number][] }[] = [];
          if (trailPoints.length > 0) {
            let currentSegment = {
              color: getTempColor(trailPoints[0].temp),
              positions: [[trailPoints[0].lat, trailPoints[0].long] as [number, number]]
            };

            for (let i = 1; i < trailPoints.length; i++) {
              const p = trailPoints[i];
              const color = getTempColor(p.temp);
              
              if (color === currentSegment.color) {
                currentSegment.positions.push([p.lat, p.long]);
              } else {
                // End current segment and start new one
                // To connect segments properly, the new segment should start with the last point of the previous segment
                trailSegments.push(currentSegment);
                currentSegment = {
                  color,
                  positions: [
                    currentSegment.positions[currentSegment.positions.length - 1],
                    [p.lat, p.long]
                  ]
                };
              }
            }
            trailSegments.push(currentSegment);
          }

          return (
            <React.Fragment key={`dataset-trail-${d.id}`}>
              {trailSegments.map((segment, i) => (
                <Polyline
                  key={`segment-${d.id}-${i}`}
                  positions={segment.positions}
                  pathOptions={{
                    color: segment.color,
                    weight: activeDatasetId === d.id ? 5 : 3,
                    opacity: activeDatasetId === d.id ? 0.9 : 0.6,
                    lineCap: 'round',
                    lineJoin: 'round'
                  }}
                />
              ))}

              {/* Current Position Marker */}
              <CircleMarker
                center={[currentPoint.lat, currentPoint.long]}
                radius={activeDatasetId === d.id ? 10 : 7}
                pathOptions={{
                  fillColor: d.color,
                  color: activeDatasetId === d.id ? '#FFF' : d.color,
                  weight: activeDatasetId === d.id ? 3 : 1,
                  fillOpacity: 1
                }}
              >
                <Tooltip 
                  permanent 
                  direction="top" 
                  offset={[0, -12]} 
                  opacity={1}
                  className="bg-transparent border-none shadow-none p-0 tooltip-custom"
                >
                  <div className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold shadow-md border whitespace-nowrap transition-colors",
                    currentPoint.temp > 30 
                      ? "bg-primary text-primary-foreground border-primary shadow-primary/30" 
                      : "bg-card text-foreground border-border"
                  )}>
                    {currentPoint.temp.toFixed(1)}°
                  </div>
                </Tooltip>
                <Popup className="custom-marker-popup">
                  <div className="min-w-[200px] overflow-hidden rounded-xl shadow-2xl border border-border bg-card">
                    <div className="px-3 py-2 text-primary-foreground font-bold text-[10px] uppercase tracking-widest flex justify-between items-center" style={{ backgroundColor: d.color }}>
                      <span className="truncate max-w-[120px]">{d.name.split('.')[0]}</span>
                      {currentPoint.temp > 30 && <span className="bg-white/20 px-1.5 py-0.5 rounded text-[8px] animate-pulse">WARM</span>}
                    </div>
                    <div className="p-3 space-y-2 text-[10px]">
                      <div className="flex justify-between items-center border-b border-border pb-1.5">
                        <span className="text-muted-foreground font-bold uppercase tracking-tight">Timeline</span>
                        <span className="font-mono font-bold text-foreground">{formatInTimeZone(currentPoint.time, TIMEZONE, 'HH:mm:ss')}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-border pb-1.5">
                        <span className="text-muted-foreground font-bold uppercase tracking-tight">Reading</span>
                        <span className={cn(
                          "font-bold font-mono text-[12px] px-2 py-0.5 rounded-full",
                          currentPoint.temp > 30 
                            ? "text-primary bg-primary/10 border border-primary/20" 
                            : "text-muted-foreground bg-muted"
                        )}>
                          {currentPoint.temp.toFixed(1)}°
                        </span>
                      </div>
                      <div className="pt-1">
                        <span className="text-muted-foreground font-bold uppercase tracking-tight block mb-1">Geolocation</span>
                        <div className="p-2 rounded-lg bg-muted/30 border border-border leading-relaxed text-[9px] text-foreground/80 break-words font-medium">
                          {currentPoint.location || 'Analyzing location...'}
                        </div>
                      </div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            </React.Fragment>
          );
        })}

        <MapAutoCenter center={center} enabled={followMarker} />
        <MapFocus points={focusPoints} />
        <MapResize trigger={resizeTrigger} />
      </MapContainer>
    </div>
  );
};
