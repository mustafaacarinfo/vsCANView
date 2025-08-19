import { ArcGauge } from './arcGauge.js';

export class EngineGauges {
  constructor(oilPressureCanvas, batteryVoltageCanvas, intakeManifoldCanvas) {
    // Yağ basıncı göstergesi
    this.oilPressure = new ArcGauge(oilPressureCanvas, {
      min: 0,
      max: 150,
      value: 0,
      unit: 'kPa',
      label: 'Oil Pressure',
      bands: [
        {t: 0.2, col: '#ef4444', gradient: '#f87171,#ef4444'},  // Red - Very Low
        {t: 0.4, col: '#10b981', gradient: '#34d399,#6ee7b7'},  // Green - Normal
        {t: 0.8, col: '#f59e0b', gradient: '#f59e0b,#fbbf24'},  // Orange - High
        {t: 1, col: '#ef4444', gradient: '#f87171,#ef4444'}     // Red - Very High
      ],
      showNeedle: true
    });
    
    // Akü voltaj göstergesi
    this.batteryVoltage = new ArcGauge(batteryVoltageCanvas, {
      min: 8,
      max: 32,
      value: 24,
      unit: 'V',
      label: 'Battery Voltage',
      bands: [
        {t: 0.3, col: '#ef4444', gradient: '#f87171,#ef4444'},  // Red - Low
        {t: 0.7, col: '#10b981', gradient: '#34d399,#6ee7b7'},  // Green - Normal
        {t: 1, col: '#ef4444', gradient: '#f87171,#ef4444'}     // Red - High
      ],
      showNeedle: true
    });
    
    // Manifold basıncı göstergesi
    this.intakeManifold = new ArcGauge(intakeManifoldCanvas, {
      min: 0,
      max: 500,
      value: 100,
      unit: 'kPa',
      label: 'Manifold Pressure',
      bands: [
        {t: 0.4, col: '#10b981', gradient: '#34d399,#6ee7b7'},  // Green - Normal
        {t: 0.7, col: '#f59e0b', gradient: '#f59e0b,#fbbf24'},  // Orange - High
        {t: 1, col: '#ef4444', gradient: '#f87171,#ef4444'}     // Red - Very High
      ],
      showNeedle: true
    });
  }
  
  setValues({ oilPressure, batteryVoltage, intakeManifold }) {
    if (oilPressure != null) this.oilPressure.setValue(oilPressure);
    if (batteryVoltage != null) this.batteryVoltage.setValue(batteryVoltage);
    if (intakeManifold != null) this.intakeManifold.setValue(intakeManifold);
  }
  
  draw() {
    this.oilPressure.draw();
    this.batteryVoltage.draw();
    this.intakeManifold.draw();
  }
}
