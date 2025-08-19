export class TemperatureGauges {
    constructor(canvas) {
        this.canvas = canvas;
        this.initialized = false;
        this.engineTempGauge = null;
        this.coolantTempGauge = null;
        this.ctx = canvas.getContext('2d');
        this.resizeObserver = null;
        this.init();
        this.setupResizeObserver();
    }
    
    // Add resize observer to handle size changes properly
    setupResizeObserver() {
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(entries => {
                console.log('🔄 Temperature gauge canvas resized');
                // Re-initialize offscreen canvases with new size
                if (this.initialized) {
                    this.updateCanvasSizes();
                }
            });
            this.resizeObserver.observe(this.canvas);
        }
    }
    
    // Update canvas sizes after resize
    updateCanvasSizes() {
        if (!this.canvas) return;
        
        try {
            const width = this.canvas.clientWidth;
            const height = this.canvas.clientHeight;
            
            console.log(`📐 Updating temperature gauge sizes: ${width}x${height}`);
            
            // Skip if dimensions are too small
            if (width < 20 || height < 20) {
                console.warn('⚠️ Canvas too small for temperature gauges');
                return;
            }
            
            // Update offscreen canvases
            if (this.engineTempCanvas) {
                this.engineTempCanvas.width = width / 2;
                this.engineTempCanvas.height = height;
            }
            
            if (this.coolantTempCanvas) {
                this.coolantTempCanvas.width = width / 2;
                this.coolantTempCanvas.height = height;
            }
            
            // Main canvas
            this.canvas.width = width;
            this.canvas.height = height;
            
            // Redraw after resize
            this.draw();
        } catch (error) {
            console.error('❌ Error updating canvas sizes:', error);
        }
    }
    
    async init() {
        try {
            const ArcGaugeModule = await import('./arcGauge.js');
            
            // Skip initialization if canvas is too small
            const width = this.canvas.clientWidth;
            const height = this.canvas.clientHeight;
            
            if (width < 20 || height < 20) {
                console.warn('⚠️ Canvas too small for temperature gauges, will retry later');
                setTimeout(() => this.init(), 1000);
                return;
            }
            
            console.log(`📐 Creating temperature gauges with size: ${width}x${height}`);
            
            // Create off-screen canvases for each gauge
            this.engineTempCanvas = document.createElement('canvas');
            this.engineTempCanvas.width = width / 2;
            this.engineTempCanvas.height = height;
            
            this.coolantTempCanvas = document.createElement('canvas');
            this.coolantTempCanvas.width = width / 2;
            this.coolantTempCanvas.height = height;
            
            // Initialize gauges with separate canvases and try-catch blocks
            try {
                this.engineTempGauge = new ArcGaugeModule.ArcGauge(this.engineTempCanvas, {
                    min: 0,
                    max: 120,
                    value: 0,
                    unit: '°C',
                    label: 'Engine Temp'
                });
            } catch (err) {
                console.error('❌ Failed to create engine temp gauge:', err);
            }
            
            try {
                this.coolantTempGauge = new ArcGaugeModule.ArcGauge(this.coolantTempCanvas, {
                    min: 0,
                    max: 100,
                    value: 0,
                    unit: '°C',
                    label: 'Coolant Temp'
                });
            } catch (err) {
                console.error('❌ Failed to create coolant temp gauge:', err);
            }
            
            this.initialized = true;
            console.log('✅ Temperature gauges components initialized');
            
            // Initial draw
            this.draw();
        } catch (error) {
            console.error('❌ Error initializing temperature gauge components:', error);
            // Retry initialization after a delay
            setTimeout(() => this.init(), 2000);
        }
    }
    
    // Draw method with better error handling
    draw() {
        if (!this.initialized) {
            console.warn('⚠️ Cannot draw temperature gauges - not initialized');
            return;
        }
        
        try {
            // Check if canvas is valid
            if (!this.canvas || !this.ctx) {
                console.error('❌ Invalid canvas or context');
                return;
            }
            
            // Check canvas dimensions
            const width = this.canvas.width;
            const height = this.canvas.height;
            
            if (width < 20 || height < 20) {
                console.warn('⚠️ Canvas too small to draw temperature gauges');
                return;
            }
            
            // Clear main canvas
            this.ctx.clearRect(0, 0, width, height);
            
            // Draw both gauges to their individual canvases
            if (this.engineTempGauge) {
                try {
                    this.engineTempGauge.draw();
                } catch (err) {
                    console.error('❌ Error drawing engine temp gauge:', err);
                }
            }
            
            if (this.coolantTempGauge) {
                try {
                    this.coolantTempGauge.draw();
                } catch (err) {
                    console.error('❌ Error drawing coolant temp gauge:', err);
                }
            }
            
            // Combine both gauge canvases onto the main canvas
            if (this.engineTempCanvas && this.coolantTempCanvas) {
                try {
                    // Draw left gauge (engine temp)
                    this.ctx.drawImage(this.engineTempCanvas, 
                        0, 0, this.engineTempCanvas.width, this.engineTempCanvas.height,
                        0, 0, width/2, height);
                    
                    // Draw right gauge (coolant temp)
                    this.ctx.drawImage(this.coolantTempCanvas, 
                        0, 0, this.coolantTempCanvas.width, this.coolantTempCanvas.height,
                        width/2, 0, width/2, height);
                } catch (err) {
                    console.error('❌ Error combining gauge canvases:', err);
                }
            }
        } catch (error) {
            console.error('❌ Error drawing temperature gauges:', error);
        }
    }
    
    // Add missing setValues method
    setValues(engineTemp, coolantTemp) {
        if (engineTemp !== undefined) this.setEngineTemp(engineTemp);
        if (coolantTemp !== undefined) this.setCoolantTemp(coolantTemp);
    }
    
    setEngineTemp(value) {
        console.log('🌡️ Setting engine temp:', value);
        if (!this.initialized) {
            console.warn('⚠️ Temperature gauges not initialized yet, waiting...');
            // Try again after a delay if not initialized
            setTimeout(() => {
                if (this.initialized) {
                    this.setEngineTemp(value);
                }
            }, 200);
            return;
        }
        
        if (!this.engineTempGauge) {
            console.error('❌ Engine temp gauge not available');
            return;
        }
        
        try {
            // Ensure value is a number
            const numValue = Number(value);
            if (isNaN(numValue)) {
                console.warn('⚠️ Invalid engine temp value (not a number):', value);
                return;
            }
            
            this.engineTempGauge.setValue(numValue);
            this.draw(); // Redraw after value change
            console.log('✅ Engine temp set successfully to:', numValue);
        } catch (error) {
            console.error('❌ Error setting engine temp:', error);
        }
    }
    
    setCoolantTemp(value) {
        console.log('💧 Setting coolant temp:', value);
        if (!this.initialized) {
            console.warn('⚠️ Temperature gauges not initialized yet, waiting...');
            // Try again after a delay if not initialized
            setTimeout(() => {
                if (this.initialized) {
                    this.setCoolantTemp(value);
                }
            }, 200);
            return;
        }
        
        if (!this.coolantTempGauge) {
            console.error('❌ Coolant temp gauge not available');
            return;
        }
        
        try {
            // Ensure value is a number
            const numValue = Number(value);
            if (isNaN(numValue)) {
                console.warn('⚠️ Invalid coolant temp value (not a number):', value);
                return;
            }
            
            this.coolantTempGauge.setValue(numValue);
            this.draw(); // Redraw after value change
            console.log('✅ Coolant temp set successfully to:', numValue);
        } catch (error) {
            console.error('❌ Error setting coolant temp:', error);
        }
    }
}
