// multiSignalChart.js - Code for multi-signal monitoring chart
// Chart.js import (date adapter kaldırıldı - linear zaman ekseni kullanılacak)
import { Chart, registerables } from 'chart.js';
import { ctx2d } from '../core/chartCore.js';
// Chart.js tree-shaking nedeniyle gerekli bileşenleri kaydet
Chart.register(...registerables);

// Chart.js için gerekli renk paleti
const CHART_COLORS = {
  red: 'rgb(255, 99, 132)',
  orange: 'rgb(255, 159, 64)',
  yellow: 'rgb(255, 205, 86)',
  green: 'rgb(75, 192, 192)',
  blue: 'rgb(54, 162, 235)',
  purple: 'rgb(153, 102, 255)',
  grey: 'rgb(201, 203, 207)',
  teal: 'rgb(0, 128, 128)',
  lime: 'rgb(0, 255, 0)',
  pink: 'rgb(255, 0, 255)'
};

// Renk paletinden daha şeffaf versiyonlar oluşturma
const CHART_COLORS_TRANSPARENT = Object.fromEntries(
  Object.entries(CHART_COLORS).map(([key, value]) => [
    key,
    value.replace('rgb', 'rgba').replace(')', ', 0.2)')
  ])
);

// Maksimum veri noktası sayısı - 1 dakikalık veri (10 fps ile)
const MAX_DATA_POINTS = 600;

export class MultiSignalChart {
  constructor(canvasId, legendId) {
    this.canvasId = canvasId;
    this.legendId = legendId;
    this.selectedSignals = new Set();
    this.signalData = {};
    this.chart = null;
    this.maxSignals = 5;
    this.colorIndex = 0;
    this.colorNames = Object.keys(CHART_COLORS);
    this._lastUpdateTime = null;
    this._updateScheduled = false;
    this._visible = false;
  this._resizeObserver = null;
  this._allAvailableSignals = new Map(); // Store all available signals
    this._searchInitialized = false;
    this.autoScrollEnabled = true; // Otomatik kaydırma varsayılan olarak açık
    
    // Grafik oluşturma
    this.initChart();
    
  // clearCharts handled centrally in app.js
  // Also listen to the global clear button to ensure this component always clears itself
  document.getElementById('clearCharts')?.addEventListener('click', () => this.clearData());
    
    // Otomatik kaydırma düğmesini dinle
    const autoScrollBtn = document.getElementById('toggleAutoScroll');
    if (autoScrollBtn) {
      autoScrollBtn.classList.add('active'); // Başlangıçta aktif
      autoScrollBtn.addEventListener('click', () => {
        this.autoScrollEnabled = !this.autoScrollEnabled;
        if (this.autoScrollEnabled) {
          autoScrollBtn.classList.add('active');
          // Otomatik kaydırma etkinleştirildiğinde hemen en alta kaydır
          const wrapper = document.querySelector('.signal-list-wrapper');
          if (wrapper) {
            wrapper.scrollTop = wrapper.scrollHeight;
          }
        } else {
          autoScrollBtn.classList.remove('active');
        }
      });
    }
  }

  // Chart.js grafiğini başlat
  initChart() {
    const canvas = document.getElementById(this.canvasId);
    console.log('initChart çağrıldı, canvas ID:', this.canvasId, 'canvas element:', canvas);
    if (!canvas) {
      console.error('Canvas elementi bulunamadı:', this.canvasId);
      return;
    }
    
    try {
      // Canvas boyutlarını doğru hesapla
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      // Canvas görünürlüğünü kontrol et
      const containerVisible = canvas.closest('.signal-panel')?.offsetParent !== null;
      
      if (rect.width === 0 || rect.height === 0 || !containerVisible) {
        console.warn('Canvas görünmez veya boyutları sıfır, boyutlandırma erteleniyor');
        // Let ctx2d schedule retries and provide a minimal backing store
        try { ctx2d(canvas); } catch(e){}
      } else {
        console.log('Canvas boyutları:', rect.width, 'x', rect.height);
        try { ctx2d(canvas); } catch(e){
          // Fallback to manual sizing
          canvas.style.width = rect.width + 'px';
          canvas.style.height = rect.height + 'px';
          canvas.width = Math.round(rect.width * dpr);
          canvas.height = Math.round(rect.height * dpr);
        }
      }
      
      // Mevcut grafiği temizle
      if (this.chart) {
        this.chart.destroy();
      }
    } catch (err) {
      console.error('Canvas boyutlandırma hatası:', err);
      // Hata durumunda varsayılan boyutlar
      canvas.style.width = '100%';
      canvas.style.height = '300px';
      canvas.width = 800;
      canvas.height = 300;
    }
    
    const chartConfig = {
      type: 'line',
      data: {
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        },
        plugins: {
          tooltip: {
            enabled: true,
            position: 'nearest',
            backgroundColor: 'rgba(17, 24, 39, 0.9)',
            titleColor: '#e5e7eb',
            bodyColor: '#e5e7eb',
            borderColor: '#374151',
            borderWidth: 1,
            padding: 10,
            displayColors: true,
            callbacks: {
              // Robust tooltip label: context.raw may be a number or an object {x,y}
              label: (context) => {
                try {
                  const dataset = context.dataset || {};
                  // Prefer parsed y (Chart.js parsing), fallback to raw.y or raw
                  const parsed = context.parsed || {};
                  let y = (parsed.y !== undefined) ? parsed.y : (context.raw && context.raw.y !== undefined ? context.raw.y : context.raw);
                  const num = Number(y);
                  if (Number.isFinite(num)) {
                    return `${dataset.label}: ${num.toFixed(2)}`;
                  }
                  // Non-numeric value - stringify safely
                  return `${dataset.label}: ${String(y)}`;
                } catch (e) {
                  return context.dataset ? `${context.dataset.label}: ${String(context.raw)}` : String(context.raw);
                }
              },
              // Title: try parsed.x, raw.x or raw value
              title: (tooltipItems) => {
                const it = (tooltipItems && tooltipItems[0]) || null;
                const xval = it ? (it.parsed && it.parsed.x !== undefined ? it.parsed.x : (it.raw && (it.raw.x !== undefined ? it.raw.x : it.raw))) : null;
                const date = xval ? new Date(xval) : new Date();
                return date.toLocaleTimeString();
              }
            }
          },
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            type: 'linear',
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#9ca3af',
              maxRotation: 0,
              font: { size: 10 },
              callback: (v) => {
                const d = new Date(v);
                return d.toLocaleTimeString();
              }
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: '#9ca3af',
              font: {
                size: 10
              }
            }
          }
        }
      }
    };
    
      try {
        // createChartCore yerine doğrudan Chart.js kullan
        console.log('Chart.js ile grafik oluşturuluyor, config:', chartConfig);
        this.chart = new Chart(canvas, chartConfig);
      console.log('Chart başarıyla oluşturuldu:', this.chart);
      // Safety: on window resize ensure Chart.js resizes (some webviews don't forward ResizeObserver events)
      try {
        if (!this._windowResizeHandler) {
          this._windowResizeHandler = () => {
            if (!this.chart) return;
            try { this.chart.resize(); this.chart.update('none'); } catch (e) { /* ignore */ }
          };
          window.addEventListener('resize', this._windowResizeHandler);
        }
      } catch (e) { /* ignore */ }
      // Attach ResizeObserver to handle late canvas sizing (use non-fatal try/catch)
      try {
        if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
        if (window.ResizeObserver) {
          const target = canvas.closest('.signal-panel') || canvas.parentElement || canvas;
          this._resizeObserver = new ResizeObserver(entries => {
            if (!this.chart) return;
            for (const ent of entries) {
              const rect = ent.contentRect || target.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                // Ensure backing store matches layout via central helper
                try { ctx2d(canvas); } catch(e){}
                try { this.chart.resize(); this.chart.update('none'); } catch(e){ /* ignore */ }
              }
            }
          });
          this._resizeObserver.observe(target);
        }
      } catch (e) { console.warn('ResizeObserver attach failed', e); }
      
      // Canvas boyutunu düzelt ve resize işlemini birkaç kez tekrarla
      // Bu, bazı tarayıcılarda görünürlük değişimlerinde boyutlandırma sorunlarını çözer
      setTimeout(() => {
        if (this.chart) {
          const r2 = canvas.getBoundingClientRect();
          canvas.style.width = r2.width + 'px';
          canvas.style.height = r2.height + 'px';
          try { this.chart.resize(); } catch(e){}
          console.log('Chart boyutu ayarlandı:', canvas.width, 'x', canvas.height);

          // İkinci bir resize 200ms sonra
          setTimeout(() => {
            if (this.chart) {
              try { this.chart.resize(); } catch(e){}
              console.log('Chart boyutu tekrar ayarlandı');
            }
          }, 200);
        }
      }, 100);
    } catch (err) {
      console.error('Chart oluşturma hatası:', err);
    }
  }
  
  // Update list of available signals
  updateAvailableSignals(signals) {
    const checkboxesContainer = document.getElementById('multiSignalCheckboxes');
    if (!checkboxesContainer) return;
    
  // Track newly received signals
    if (!this._allAvailableSignals) {
      this._allAvailableSignals = new Map();
    }
    
  // Add newly received signals to the list
    signals.forEach(signal => {
      if (!this._allAvailableSignals.has(signal.id)) {
        this._allAvailableSignals.set(signal.id, {
          id: signal.id,
          name: signal.name || signal.id,
          lastValue: null,
          lastUpdated: Date.now()
        });
        
  // Create a checkbox for the new signal
        this._createSignalCheckbox(signal.id, signal.name || signal.id, checkboxesContainer);
      } else {
  // Update existing signal
        const existingSignal = this._allAvailableSignals.get(signal.id);
        existingSignal.lastUpdated = Date.now();
      }
    });
    
  // Show signal count update
    this._updateSignalCounter();
    
  // Enable signal search
    this._setupSignalSearch();
    
  // Update legend if signals changed
    this.updateLegend();
  }
  
  // Create signal checkbox
  _createSignalCheckbox(signalId, signalName, container) {
    // Kontrol et, varsa oluşturma
    if (document.getElementById(`signal-${signalId.replace(/\s+/g, '-')}`)) {
      return;
    }
    
    const signalIdSafe = `signal-${signalId.replace(/\s+/g, '-')}`;
    const checkboxDiv = document.createElement('div');
    checkboxDiv.className = `signal-checkbox ${this.selectedSignals.has(signalId) ? 'checked' : ''}`;
    checkboxDiv.dataset.signalId = signalId;
    checkboxDiv.dataset.signalName = signalName.toLowerCase();
    
    // Renk göstergesi
    const colorIndex = this._allAvailableSignals.size % this.colorNames.length;
    const colorIndicator = document.createElement('span');
    colorIndicator.className = 'color-indicator';
    colorIndicator.style.backgroundColor = CHART_COLORS[this.colorNames[colorIndex]];
    checkboxDiv.appendChild(colorIndicator);
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = signalIdSafe;
    checkbox.checked = this.selectedSignals.has(signalId);
    
    const label = document.createElement('label');
    label.htmlFor = signalIdSafe;
    label.textContent = signalName;
    
    checkboxDiv.appendChild(checkbox);
    checkboxDiv.appendChild(label);
    
    // Kontrol kutusuna tıklama işleyicisi
    checkboxDiv.addEventListener('click', (e) => {
      // Eğer çoktan tıklanmışsa çift tıklamayı önle
      if (checkboxDiv.classList.contains('processing')) {
        return;
      }
      checkboxDiv.classList.add('processing');
      
      setTimeout(() => {
        if (this.selectedSignals.has(signalId)) {
          // Remove signal
          this.selectedSignals.delete(signalId);
          checkboxDiv.classList.remove('checked');
          checkbox.checked = false;
          this.removeSignalFromChart(signalId);
        } else {
          // Max signal count check
          if (this.selectedSignals.size >= this.maxSignals) {
            // alert not allowed in sandboxed webviews; use non-blocking warning
            console.warn(`You can select up to ${this.maxSignals} signals.`);
            checkbox.checked = false;
            checkboxDiv.classList.remove('processing');
            return;
          }
          
          // Add signal
          this.selectedSignals.add(signalId);
          checkboxDiv.classList.add('checked');
          checkbox.checked = true;
          this.addSignalToChart(signalId, signalName);
        }
        
        this.updateLegend();
        checkboxDiv.classList.remove('processing');
      }, 10);
    });
    
    // Alfabetik sırada ekle
    let inserted = false;
    for (const child of container.children) {
      if (child.dataset.signalName > signalName.toLowerCase()) {
        container.insertBefore(checkboxDiv, child);
        inserted = true;
        break;
      }
    }
    
    if (!inserted) {
      container.appendChild(checkboxDiv);
      
  // Auto-scroll when a signal is added (only if feature enabled)
      if (this.autoScrollEnabled) {
        const wrapper = container.parentElement;
        if (wrapper) {
          // Kaydırma animasyonu ile yeni eklenen öğeyi görünür kıl
          setTimeout(() => {
            wrapper.scrollTop = wrapper.scrollHeight;
          }, 50);
        }
      }
    }
  }
  
  // Update signal counter label
  _updateSignalCounter() {
    const countElement = document.getElementById('signalCount');
    if (countElement && this._allAvailableSignals) {
      countElement.textContent = `(${this._allAvailableSignals.size})`;
    }
  }
  
  // Signal search function
  _setupSignalSearch() {
    const searchInput = document.getElementById('signalSearchInput');
    if (!searchInput || this._searchInitialized) return;
    
    this._searchInitialized = true;
    
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const checkboxes = document.querySelectorAll('#multiSignalCheckboxes .signal-checkbox');
      
      checkboxes.forEach(checkbox => {
        const signalName = checkbox.dataset.signalName;
        if (!searchTerm || signalName.includes(searchTerm)) {
          checkbox.classList.remove('hidden');
        } else {
          checkbox.classList.add('hidden');
        }
      });
    });
  }
  
  // Add new signal to chart
  addSignalToChart(signalId, signalName) {
  // Create data for this signal
    this.signalData[signalId] = [];
    
  // Choose color for this signal
    const colorName = this.colorNames[this.colorIndex % this.colorNames.length];
    this.colorIndex++;
    
    // Grafik veri kümesi oluştur
    const dataset = {
      label: signalName,
      data: this.signalData[signalId],
  signalId: signalId,
      borderColor: CHART_COLORS[colorName],
      backgroundColor: CHART_COLORS_TRANSPARENT[colorName],
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.2,
      fill: false
    };
    
  if(!this.chart) return; // güvenlik
  this.chart.data.datasets.push(dataset);
  this.chart.update();
  }
  
  // Grafiği çizme/güncelleme metodu
  draw() {
    if (!this.chart) {
      // Grafik henüz oluşturulmamışsa, tekrar başlatmayı dene
      console.log('Grafik henüz oluşturulmamış, yeniden başlatılıyor...');
      this.initChart();
      return;
    }
    
    try {
      // Canvas boyutlarını tekrar ayarla ve grafiği güncelle
      const canvas = document.getElementById(this.canvasId);
      if (canvas) {
        const r = canvas.getBoundingClientRect();
        canvas.style.width = r.width + 'px';
        canvas.style.height = r.height + 'px';
        try { this.chart.resize(); } catch(e){}
        try { this.chart.update(); } catch(e){}
        console.log('MultiSignalChart çizildi ve güncellendi.');
      }
    } catch (err) {
      console.error('MultiSignalChart çizim hatası:', err);
    }
  }
  
  // Remove signal from chart
  removeSignalFromChart(signalId) {
  if(!this.chart) return;
  // Try to find dataset by explicit signalId first, then by label
  let datasetIndex = this.chart.data.datasets.findIndex(dataset => dataset.signalId === signalId);
  if (datasetIndex === -1) {
    datasetIndex = this.chart.data.datasets.findIndex(dataset => dataset.label === signalId || dataset.label === String(signalId));
  }
    
    if (datasetIndex !== -1) {
      this.chart.data.datasets.splice(datasetIndex, 1);
      this.chart.update();
    }
    
    // Veri yapısından da kaldır
    delete this.signalData[signalId];
  }
  
  // Update signal data
  updateSignalData(signalId, value) {
  // Update if present in signal list
    if (this._allAvailableSignals && this._allAvailableSignals.has(signalId)) {
      const signalInfo = this._allAvailableSignals.get(signalId);
      signalInfo.lastValue = value;
      signalInfo.lastUpdated = Date.now();
    }
    
  // If this signal isn't selected, skip chart update
    if (!this.selectedSignals.has(signalId) || !this.chart) return;
    
    // Zaman damgası oluştur (milisaniye cinsinden)
    const timestamp = Date.now();
    
  // Get or create data array for this signal
    if (!this.signalData[signalId]) {
      this.signalData[signalId] = [];
    }
    
    // Ensure a dataset exists for this selected signal - sometimes UI toggles before chart dataset creation
    const dsExists = this.chart.data.datasets.some(ds => ds.signalId === signalId || ds.label === signalId || ds.label === String(signalId));
    if (!dsExists) {
      // try to derive a friendly name from _allAvailableSignals
      const info = (this._allAvailableSignals && this._allAvailableSignals.get(signalId)) || { name: signalId };
      this.addSignalToChart(signalId, info.name || signalId);
    }
    
    // Sayısal değer kontrolü
    if (typeof value !== 'number' || isNaN(value)) {
  console.warn(`Invalid signal value: ${signalId} = ${value}`);
      return;
    }
    
    // Veri noktasını ekle
    this.signalData[signalId].push({
      x: timestamp,
      y: value
    });
    
    // Veri noktası sayısını sınırla (eskiden yeniye doğru)
    if (this.signalData[signalId].length > MAX_DATA_POINTS) {
      this.signalData[signalId] = this.signalData[signalId].slice(-MAX_DATA_POINTS);
    }
    
    // Performans optimizasyonu: Her veri ekleme için güncelleme yapmak yerine
    // sadece belirli aralıklarla güncelleme yap
    const updateInterval = 150; // 150ms'de bir güncelleme (daha yüksek performans için)
    
    if (!this._lastUpdateTime || (timestamp - this._lastUpdateTime) > updateInterval) {
      if (this.chart && this._visible) {
        // Asenkron olarak güncelleme yap, akıcılığı artır
        if (!this._updateScheduled) {
          this._updateScheduled = true;
          requestAnimationFrame(() => {
            if (this.chart) {
              this.chart.update('none'); // animasyon olmadan güncelleme
            }
            this._updateScheduled = false;
          });
        }
      }
      this._lastUpdateTime = timestamp;
    }
  }
  
  // Tüm veriyi temizleme
  clearData() {
  // Clear all signal data
    // Clear stored signal values
    Object.keys(this.signalData).forEach(signalId => { this.signalData[signalId] = []; });

    // Reset selected signals and legend
    try {
      this.selectedSignals.clear();
    } catch (e) { /* ignore for compatibility */ }

    // Clear available signals metadata so that updateAvailableSignals will recreate UI
    if (this._allAvailableSignals) {
      try {
        this._allAvailableSignals.clear();
      } catch (e) {
        // Fallback: replace with new map
        this._allAvailableSignals = new Map();
      }
    } else {
      this._allAvailableSignals = new Map();
    }
    // Reset search initialization so search wiring will be reattached when signals reappear
    this._searchInitialized = false;
    // Reset color index so new signals start with predictable colors
    this.colorIndex = 0;

    // Remove all datasets from Chart.js instance
    if (this.chart && this.chart.data) {
      this.chart.data.datasets = [];
      try { this.chart.update(); } catch (e) { /* ignore */ }
    }

    // Clear checkboxes UI
    const container = document.getElementById('multiSignalCheckboxes');
    if (container) {
      // Remove children safely
      while (container.firstChild) container.removeChild(container.firstChild);
    }

    // Update legend and counters
    this.updateLegend();
    this._updateSignalCounter();
  }
  
  // Renk lejantını güncelleme
  updateLegend() {
    if(!this.chart) return;
    const legendContainer = document.getElementById(this.legendId);
    if (!legendContainer) return;
    legendContainer.innerHTML = '';
    for(const dataset of this.chart.data.datasets){
      const legendItem = document.createElement('div');
      legendItem.className = 'legend-item';
      const colorBox = document.createElement('div');
      colorBox.className = 'legend-color';
      colorBox.style.backgroundColor = dataset.borderColor;
      const label = document.createElement('span');
      label.textContent = dataset.label;
      legendItem.appendChild(colorBox);
      legendItem.appendChild(label);
      legendContainer.appendChild(legendItem);
    }
  }
  
  // Grafiğin görünürlüğünü ayarla
  setVisible(visible) {
    console.log(`MultiSignalChart görünürlüğü değiştiriliyor: ${visible ? 'görünür' : 'gizli'}`);
    
    this._visible = visible;
    
    // Canvas elementinin görünürlüğünü ayarla
    const canvas = document.getElementById(this.canvasId);
    if (!canvas) return;
    
    // Konteyner elementi al
    const containerEl = canvas.closest('.signal-panel') || canvas.closest('.signal-chart-container');
    
    if (visible) {
      // Görünür yapılırken, tekrar boyutlandırma yaparak grafiğin doğru şekilde çizilmesini sağla
      canvas.style.display = 'block';
      if (containerEl) containerEl.style.opacity = '1';
      
      // Önce bir kare geçmesini bekleyip sonra grafik düzenini güncelle
      const doResize = () => {
        try {
          const rect = canvas.getBoundingClientRect();
          if (!this.chart) {
            this.initChart();
          }
          if (rect.width > 0 && rect.height > 0) {
            canvas.width = rect.width * (window.devicePixelRatio || 1);
            canvas.height = rect.height * (window.devicePixelRatio || 1);
            try { this.chart && this.chart.resize(); this.chart && this.chart.update('none'); } catch(e){}
            console.log('Grafik görünür yapıldı ve boyutlandırıldı:', rect.width, 'x', rect.height);
            return true;
          }
          return false;
        } catch (e) { console.warn('doResize error', e); return false; }
      };

      requestAnimationFrame(() => {
        setTimeout(() => {
          // Try a few times with increasing delays to handle CSS transitions / webview layout race
          doResize();
          setTimeout(doResize, 60);
          setTimeout(doResize, 160);
          setTimeout(doResize, 360);
          // final fallback: if still not sized, force an init after 700ms
          setTimeout(() => { if (!doResize()) { try { this.initChart(); this.draw(); } catch(e){} } }, 700);
        }, 10);
      });
    } else {
      // Gizli yapılırken, performans için güncellemeyi durdur
      if (containerEl) containerEl.style.opacity = '0';
      setTimeout(() => {
        canvas.style.display = 'none';
      }, 300); // geçiş animasyonu için zaman tanı
      // If we previously attached a window resize handler, remove it to avoid extra calls
      try {
        if (this._windowResizeHandler) {
          window.removeEventListener('resize', this._windowResizeHandler);
          this._windowResizeHandler = null;
        }
      } catch (e) { /* ignore */ }
    }
  }
}

// Modül dışa aktarımı
export default MultiSignalChart;
