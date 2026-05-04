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
    <div className={cn(
      "relative w-full h-full rounded-xl overflow-hidden border shadow-inner",
      isDarkMode ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"
    )}>
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
                <div className="text-xs">
                  <p className="font-bold underline" style={{ color: d.color }}>Vehicle: {d.name}</p>
                  <p className="font-bold text-orange-600">High Temp Alert (&gt;30°C)</p>
                  <p>Temp: {p.temp.toFixed(1)}°C</p>
                  <p>Time: {formatInTimeZone(p.time, TIMEZONE, 'HH:mm:ss')}</p>
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

          return (
            <React.Fragment key={`dataset-trail-${d.id}`}>
              {trailPoints.length > 0 && (
                <>
                  {trailPoints.map((p, i) => {
                    const line = i > 0 ? (
                      <Polyline
                        key={`line-${d.id}-${i}`}
                        positions={[
                          [trailPoints[i-1].lat, trailPoints[i-1].long],
                          [p.lat, p.long]
                        ]}
                        pathOptions={{
                          color: getTempColor(p.temp),
                          weight: activeDatasetId === d.id ? 5 : 3,
                          opacity: activeDatasetId === d.id ? 0.9 : 0.6,
                          lineCap: 'round'
                        }}
                      />
                    ) : null;

                    return (
                      <React.Fragment key={`point-${d.id}-${i}`}>
                        {line}
                      </React.Fragment>
                    );
                  })}
                </>
              )}

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
                    "px-1.5 py-0.5 rounded text-[10px] font-bold shadow-md border whitespace-nowrap",
                    currentPoint.temp > 30 
                      ? "bg-red-500 text-white border-red-600" 
                      : (isDarkMode ? "bg-slate-800 text-slate-100 border-slate-700" : "bg-white text-slate-900 border-slate-200")
                  )}>
                    {currentPoint.temp.toFixed(1)}°C
                  </div>
                </Tooltip>
                <Popup className="custom-marker-popup">
                  <div className={cn(
                    "min-w-[220px] overflow-hidden rounded-lg shadow-xl border",
                    isDarkMode ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                  )}>
                    <div className="px-3 py-2 text-white font-bold text-xs flex justify-between items-center" style={{ backgroundColor: d.color }}>
                      <span>{d.name}</span>
                      {currentPoint.temp > 30 && <span className="bg-white/20 px-1.5 py-0.5 rounded text-[8px] animate-pulse">HIGH TEMP</span>}
                    </div>
                    <div className="p-3 space-y-2 text-[11px]">
                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-1.5">
                        <span className="text-slate-500 font-medium">Date:</span>
                        <span className="font-mono font-bold tracking-tight">{formatInTimeZone(currentPoint.time, TIMEZONE, 'dd/MM/yyyy')}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-1.5">
                        <span className="text-slate-500 font-medium">Time:</span>
                        <span className="font-mono font-bold tracking-tight">{formatInTimeZone(currentPoint.time, TIMEZONE, 'HH:mm:ss')}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-1.5">
                        <span className="text-slate-500 font-medium">Temp:</span>
                        <span className={cn(
                          "font-bold font-mono text-[13px] px-1.5 py-0.5 rounded",
                          currentPoint.temp > 30 
                            ? "text-red-600 bg-red-50 dark:bg-red-900/40" 
                            : (isDarkMode ? "text-blue-400 bg-blue-900/30" : "text-blue-600 bg-blue-50")
                        )}>
                          {currentPoint.temp.toFixed(1)}°C
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium block mb-1">Location:</span>
                        <div className={cn(
                          "p-2 rounded leading-relaxed text-[10px] break-words",
                          isDarkMode ? "bg-slate-800/50" : "bg-slate-50"
                        )}>
                          {currentPoint.location || 'Unknown Location'}
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
