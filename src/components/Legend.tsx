import React from 'react';
import { cn } from '../lib/utils';

interface LegendProps {
  isDarkMode?: boolean;
}

export const Legend: React.FC<LegendProps> = ({ isDarkMode }) => {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <div className={cn(
      "absolute z-[1000] backdrop-blur-sm rounded-lg border shadow-xl pointer-events-auto transition-all duration-300 overflow-hidden",
      "bg-card/90 border-border text-foreground",
      // Responsive positioning: top-right on desktop, bottom-right on mobile (above slider)
      "top-20 right-4 md:top-4 md:right-4",
      isOpen ? "p-4 min-w-[180px]" : "p-2 w-10 h-10 flex items-center justify-center cursor-pointer"
    )}
    onClick={() => !isOpen && setIsOpen(true)}
    >
      {isOpen ? (
        <>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-muted-foreground">Legend</h3>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444] shadow-sm shadow-[#ef4444]/40" />
              <span className="text-[10px] font-medium text-foreground">40°C+</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#f97316] shadow-sm shadow-[#f97316]/40" />
              <span className="text-[10px] font-medium text-foreground">30-39°C</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#22c55e] shadow-sm shadow-[#22c55e]/40" />
              <span className="text-[10px] font-medium text-foreground">20-29°C</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] shadow-sm shadow-[#3b82f6]/40" />
              <span className="text-[10px] font-medium text-foreground">&lt;20°C</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#808080]" />
              <span className="text-[10px] font-medium text-muted-foreground font-mono">N/A</span>
            </div>
          </div>
        </>
      ) : (
        <div className="text-[10px] font-bold text-foreground">LEGEND</div>
      )}
    </div>
  );
};
