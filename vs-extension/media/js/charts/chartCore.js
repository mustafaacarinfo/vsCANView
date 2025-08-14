// ...existing code...

export function ctx2d(canvas) {
    if (!canvas) {
        console.error('❌ Canvas element not found');
        return null;
    }
    
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('❌ Could not get 2D context');
        return null;
    }
    
    // Scale for high DPI
    ctx.scale(dpr, dpr);
    
    // Reset any previous transforms
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    return ctx;
}

// ...existing code...
