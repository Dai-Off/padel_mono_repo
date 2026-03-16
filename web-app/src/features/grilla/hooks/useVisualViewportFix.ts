import { useState, useEffect } from 'react';

export function useVisualViewportFix(isOpen: boolean) {
    const [style, setStyle] = useState<React.CSSProperties>({});

    useEffect(() => {
        if (!isOpen || typeof window === 'undefined' || !window.visualViewport) {
            setStyle({});
            return;
        }

        const updateStyle = () => {
            const vv = window.visualViewport;
            if (!vv) return;

            // To counteract pinch-zoom on fixed elements, we need to match the visual viewport's offset,
            // scale up the physical size by the zoom factor, and then apply an inverse CSS scale.
            // This mathematically cancels out the browser's zoom while perfectly covering the screen.
            setStyle({
                position: 'fixed',
                left: `${vv.offsetLeft}px`,
                top: `${vv.offsetTop}px`,
                width: `${vv.width * vv.scale}px`,
                height: `${vv.height * vv.scale}px`,
                transformOrigin: '0 0',
                transform: `scale(${1 / vv.scale})`,
                // Ensure it overrides any default inset-0 from tailwind
                right: 'auto',
                bottom: 'auto',
            });
        };

        updateStyle();

        // Standard events
        window.visualViewport.addEventListener('resize', updateStyle);
        window.visualViewport.addEventListener('scroll', updateStyle);

        // Some mobile browsers trigger 'resize' on window instead of visualViewport
        window.addEventListener('resize', updateStyle);

        return () => {
            window.visualViewport?.removeEventListener('resize', updateStyle);
            window.visualViewport?.removeEventListener('scroll', updateStyle);
            window.removeEventListener('resize', updateStyle);
        };
    }, [isOpen]);

    return style;
}
