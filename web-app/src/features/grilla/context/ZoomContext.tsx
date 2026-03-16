import { createContext, useContext } from 'react';

export type ZoomLevel = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

/** CSS scale factor for each zoom level */
export const ZoomScales: Record<ZoomLevel, number> = {
    'XS': 0.4,
    'S': 0.6,
    'M': 0.8,
    'L': 1.0,     // default – 1:1 with the original 2px/min layout
    'XL': 1.3,
    'XXL': 1.6,
};

interface ZoomContextType {
    zoomLevel: ZoomLevel;
    scale: number;
    setZoomLevel: (level: ZoomLevel) => void;
}

export const ZoomContext = createContext<ZoomContextType>({
    zoomLevel: 'L',
    scale: ZoomScales['L'],
    setZoomLevel: () => { },
});

export const useZoom = () => useContext(ZoomContext);
