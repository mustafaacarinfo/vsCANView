// multiSignalChart.js - Çoklu sinyal izleme grafiği için kod
// Chart.js import (date adapter kaldırıldı - linear zaman ekseni kullanılacak)
import { Chart, registerables } from 'chart.js';
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
    
    // Grafik oluşturma
    this.initChart();
    
    // Temizleme butonuna tıklama olayı ekleme
    document.getElementById('clearSignalChartData')?.addEventListener('click', () => this.clearData());
  }

  // Chart.js grafiğini başlat
  initChart() {
    const canvas = document.getElementById(this.canvasId);
    console.log('initChart çağrıldı, canvas ID:', this.canvasId, 'canvas element:', canvas);
    if (!canvas) {
      console.error('Canvas elementi bulunamadı:', this.canvasId);
      return;
    }
    
    // Canvas boyutunu önce ayarla
    canvas.style.width = '100%';
    canvas.style.height = '300px';
    canvas.width = canvas.offsetWidth || 800; 
    canvas.height = canvas.offsetHeight || 300;
    
    // Mevcut grafiği temizle
    if (this.chart) {
      this.chart.destroy();
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
              label: (context) => {
                const dataset = context.dataset;
                const value = context.raw;
                return `${dataset.label}: ${value.toFixed(2)}`;
              },
              title: (tooltipItems) => {
                const date = new Date(tooltipItems[0].parsed.x);
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
      
      // Canvas boyutunu düzelt ve resize işlemini birkaç kez tekrarla
      // Bu, bazı tarayıcılarda görünürlük değişimlerinde boyutlandırma sorunlarını çözer
      setTimeout(() => {
        if (this.chart) {
          canvas.style.width = '100%';
          canvas.style.height = '300px';
          this.chart.resize();
          console.log('Chart boyutu ayarlandı:', canvas.width, 'x', canvas.height);
          
          // İkinci bir resize 200ms sonra
          setTimeout(() => {
            if (this.chart) {
              this.chart.resize();
              console.log('Chart boyutu tekrar ayarlandı');
            }
          }, 200);
        }
      }, 100);
    } catch (err) {
      console.error('Chart oluşturma hatası:', err);
    }
  }
  
  // Kullanılabilir sinyallerin listesini güncelleme
  updateAvailableSignals(signals) {
    const checkboxesContainer = document.getElementById('multiSignalCheckboxes');
    if (!checkboxesContainer) return;
    
    // Mevcut kutuları temizle
    checkboxesContainer.innerHTML = '';
    
    // Her sinyal için kontrol kutusu oluştur
    signals.forEach(signal => {
      const signalId = `signal-${signal.id.replace(/\s+/g, '-')}`;
      const checkboxDiv = document.createElement('div');
      checkboxDiv.className = `signal-checkbox ${this.selectedSignals.has(signal.id) ? 'checked' : ''}`;
      checkboxDiv.dataset.signalId = signal.id;
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = signalId;
      checkbox.checked = this.selectedSignals.has(signal.id);
      
      const label = document.createElement('label');
      label.htmlFor = signalId;
      label.textContent = signal.name || signal.id;
      
      checkboxDiv.appendChild(checkbox);
      checkboxDiv.appendChild(label);
      
      // Kontrol kutusuna tıklama işleyicisi
      checkboxDiv.addEventListener('click', () => {
        if (this.selectedSignals.has(signal.id)) {
          // Sinyali kaldır
          this.selectedSignals.delete(signal.id);
          checkboxDiv.classList.remove('checked');
          checkbox.checked = false;
          this.removeSignalFromChart(signal.id);
        } else {
          // Maksimum sinyal sayısı kontrolü
          if (this.selectedSignals.size >= this.maxSignals) {
            alert(`En fazla ${this.maxSignals} sinyal seçebilirsiniz.`);
            return;
          }
          
          // Sinyali ekle
          this.selectedSignals.add(signal.id);
          checkboxDiv.classList.add('checked');
          checkbox.checked = true;
          this.addSignalToChart(signal.id, signal.name || signal.id);
        }
        this.updateLegend();
      });
      
      checkboxesContainer.appendChild(checkboxDiv);
    });
    
    // Sinyaller değiştiyse lejantı güncelle
    this.updateLegend();
  }
  
  // Grafiğe yeni sinyal ekleme
  addSignalToChart(signalId, signalName) {
    // Bu sinyal için veriler oluştur
    this.signalData[signalId] = [];
    
    // Bu sinyal için renk seçimi yap
    const colorName = this.colorNames[this.colorIndex % this.colorNames.length];
    this.colorIndex++;
    
    // Grafik veri kümesi oluştur
    const dataset = {
      label: signalName,
      data: this.signalData[signalId],
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
        canvas.style.width = '100%';
        canvas.style.height = '300px';
        this.chart.resize();
        this.chart.update();
        console.log('MultiSignalChart çizildi ve güncellendi.');
      }
    } catch (err) {
      console.error('MultiSignalChart çizim hatası:', err);
    }
  }
  
  // Grafikten sinyal kaldırma
  removeSignalFromChart(signalId) {
  if(!this.chart) return;
  const datasetIndex = this.chart.data.datasets.findIndex(dataset => dataset.label === signalId || dataset.signalId === signalId);
    
    if (datasetIndex !== -1) {
      this.chart.data.datasets.splice(datasetIndex, 1);
      this.chart.update();
    }
    
    // Veri yapısından da kaldır
    delete this.signalData[signalId];
  }
  
  // Sinyal verisini güncelleme
  updateSignalData(signalId, value) {
    // Bu sinyal seçili değilse güncelleme yapma
  if (!this.selectedSignals.has(signalId) || !this.chart) return;
    
    // Zaman damgası oluştur (milisaniye cinsinden)
    const timestamp = Date.now();
    
    // Bu sinyal için veri dizisini al veya oluştur
    if (!this.signalData[signalId]) {
      this.signalData[signalId] = [];
    }
    
    // Veri noktasını ekle
    this.signalData[signalId].push({
      x: timestamp,
      y: value
    });
    
    // Veri noktası sayısını sınırla
    if (this.signalData[signalId].length > MAX_DATA_POINTS) {
      this.signalData[signalId].shift();
    }
    
    // Grafiği güncelle
  if(this.chart) this.chart.update();
  }
  
  // Tüm veriyi temizleme
  clearData() {
    // Tüm sinyal verilerini temizle
    Object.keys(this.signalData).forEach(signalId => {
      this.signalData[signalId] = [];
    });
    
    // Grafik veri kümelerini güncelle
    if(this.chart){
      this.chart.data.datasets.forEach(dataset => { dataset.data = []; });
      this.chart.update();
    }
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
}

// Modül dışa aktarımı
export default MultiSignalChart;
