// chartCore.js - Chart yardımcı fonksiyonları

import Chart from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/+esm';

// Canvas için 2D context döndürür ve yüksek DPI için ölçeklendirir
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

// Chart.js grafiği oluşturur ve yapılandırır
export function createChartCore(canvas, config) {
    if (!canvas) {
        console.error('❌ Canvas element not found for createChartCore');
        return null;
    }
    
    try {
        // Chart.js'nin önerdiği şekilde mevcut grafiği temizle
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }
        
        // Yeni chart oluştur
        return new Chart(canvas, config);
    } catch (err) {
        console.error('❌ Chart creation failed:', err);
        return null;
    }
}

// ...existing code...
