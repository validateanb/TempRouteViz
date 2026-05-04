import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "../../lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  // Ensure we always have an array of numbers for the thumbs
  const _values = React.useMemo(() => {
    const val = value !== undefined ? value : defaultValue;
    if (Array.isArray(val)) return val.filter(v => typeof v === 'number');
    if (typeof val === 'number') return [val];
    return [min];
  }, [value, defaultValue, min]);

  return (
    <SliderPrimitive.Root
      className={cn("relative flex w-full touch-none items-center select-none", className)}
      value={value}
      defaultValue={defaultValue}
      min={min}
      max={max}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full grow items-center h-5">
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <SliderPrimitive.Indicator className="absolute h-full bg-red-500" />
        </SliderPrimitive.Track>
        {_values.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            className="block size-5 rounded-full border-2 border-white dark:border-slate-950 bg-red-500 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing hover:scale-110"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
