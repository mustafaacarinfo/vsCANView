export class VehicleViewer {
  constructor(canvas, noticeEl, modelUri){
    this.canvas=canvas; 
    this.noticeEl=noticeEl; 
    this.modelUri=modelUri; 
    this.initialized=false;
    this.handleResize=()=>this.resize();
  }
  
  async init(){
    try{
      // İşlem başlamadan performans kontrolü yapmak için global değişken ekle
      if (!window.performanceWarningShown) {
        console.log('Performans ölçümleri başlatılıyor...');
        window.performanceWarningShown = true;
        this._startTime = performance.now();
      }
      
      console.log('VehicleViewer başlatılıyor...');
      console.log('Model URI:', this.modelUri);
      
      // Yerel Three.js dosyalarını yükleyelim
      console.log('Three.js yerel dosyalardan yükleniyor...');
      
      const THREE = await import('./vendor/three.module.js');
      console.log('THREE.js yüklendi:', THREE);
      
      const { GLTFLoader } = await import('./vendor/GLTFLoader.js');
      console.log('GLTFLoader yüklendi:', GLTFLoader);
      
      this.THREE = THREE;
      console.log('Canvas öğesi:', this.canvas);
  this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Panel arka plan rengi ile eşleştir (#0e131a)
  this.renderer.setClearColor(0x0e131a, 1);
      console.log('WebGL Renderer oluşturuldu:', this.renderer);
      
      this.scene = new THREE.Scene();
  // Chart/panel teması ile aynı arka plan
  this.scene.background = new THREE.Color(0x0e131a);
      console.log('Scene oluşturuldu:', this.scene);
      
  // Tüm modeli taşıyacağımız kök grup (rota/zoom buna uygulanacak)
  this.root = new THREE.Group();
  this.scene.add(this.root);
      
      this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      this.camera.position.set(5, 3, 5);
      this.camera.lookAt(0, 0, 0);
      console.log('Kamera ayarlandı:', this.camera.position);
      
      // Mouse kontrolleri ekle (basit versiyonu)
      this.addMouseControls();
      
      // Işıkları ekle
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      this.scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 10, 5);
      directionalLight.castShadow = true;
      this.scene.add(directionalLight);
      
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
      fillLight.position.set(-10, -10, -5);
      this.scene.add(fillLight);
      
      console.log('Işıklar eklendi');
      
      // GLTF Loader ile modeli yükle
      console.log('GLTF Loader oluşturuluyor...');
  const loader = new GLTFLoader();
      console.log('Model yükleme başlıyor, URI:', this.modelUri);
      
      loader.load(
        this.modelUri, 
        (gltf) => { 
          console.log('Model başarıyla yüklendi:', gltf);
          console.log('Model sahne objeleri:', gltf.scene.children);
          
          // Model boyutunu hesapla ve ortala
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          
          console.log('Model merkezi:', center);
          console.log('Model boyutu:', size);
          
          // Modeli dünya orijinine ortala
          gltf.scene.position.sub(center);
          
          // Model çok büyükse ölçekle
          const maxDimension = Math.max(size.x, size.y, size.z);
          if (maxDimension > 3) {
            const scale = 3 / maxDimension;
            gltf.scene.scale.setScalar(scale);
            console.log('Model ölçeklendirildi:', scale);
          }
          
          this.root.add(gltf.scene);
          this.vehicleModel = gltf.scene;
          console.log('Model sahneye eklendi');
          
          // Kamerayı model boyutuna göre ayarla: daha yakın başlasın
          const fitBox = new THREE.Box3().setFromObject(gltf.scene);
          const fitSphere = fitBox.getBoundingSphere(new THREE.Sphere());
          const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
          let fitDist = fitSphere.radius / Math.tan(fovRad * 0.5);
          fitDist = Math.max(fitDist * 0.85, 0.75); // bir tık daha yakın ve minimum mesafe
          const dir = this.camera.position.clone().normalize();
          this.camera.position.copy(dir.multiplyScalar(fitDist));
          this.camera.lookAt(0,0,0);
          this.camera.updateProjectionMatrix();
          this.animate(); 
        }, 
        (progress) => {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          console.log('Model yükleniyor:', percent + '%');
          this.notice(`Model yükleniyor: ${percent}%`);
          
          // Yükleme tamamlandıysa mesajı temizle
          if (percent === 100) {
            setTimeout(() => {
              this.notice('');
              if (this.noticeEl) this.noticeEl.style.display = 'none';
            }, 500);
          }
        },
        (error) => { 
          console.error('Model yükleme hatası:', error);
          this.notice('GLB yüklenemedi: ' + error.message); 
        }
      );
      
      this.resize(); 
      window.addEventListener('resize', this.handleResize);
      this.initialized = true; 
      this.notice('');
      
      // Kullanıcıya görünür bir uyarı olmadan temizle
      if (this.noticeEl) this.noticeEl.style.display = 'none';
      
      // Performans ölçüm sonucu
      if (this._startTime) {
        const loadTime = performance.now() - this._startTime;
        console.log(`VehicleViewer başlatma tamamlandı - süre: ${loadTime.toFixed(2)}ms`);
      }
      
    } catch(e) { 
      console.error('VehicleViewer başlatma hatası:', e);
      this.notice('Hata: ' + e.message);
    }
  }
  
  notice(msg) { 
    if(this.noticeEl) {
      if (msg && msg.trim() !== '') {
        this.noticeEl.textContent = msg;
        this.noticeEl.style.display = 'block';
      } else {
        this.noticeEl.textContent = '';
        this.noticeEl.style.display = 'none';
      }
    }
  }
  
  addMouseControls() {
    // Durum değişkenleri (animate içinde de kullanılacak)
    this.isMouseDown = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.targetRotationX = 0;
    this.targetRotationY = 0;
    this.lastMouseActivity = Date.now();
    this.autoRotationSpeed = 0.01; // Otomatik dönme hızı (biraz artırıldı)
    
    this.canvas.addEventListener('mousedown', (event) => {
      this.isMouseDown = true;
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
      this.lastMouseActivity = Date.now();
    });
    
    this.canvas.addEventListener('mousemove', (event) => {
      this.lastMouseActivity = Date.now();
      if (!this.isMouseDown) return;
      
      const deltaX = event.clientX - this.mouseX;
      const deltaY = event.clientY - this.mouseY;
      
      this.targetRotationY += deltaX * 0.01;
      this.targetRotationX += deltaY * 0.01;
      
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
    });
    
    this.canvas.addEventListener('mouseup', () => {
      this.isMouseDown = false;
      this.lastMouseActivity = Date.now();
    });
    this.canvas.addEventListener('mouseleave', () => { this.isMouseDown = false; });
    
    this.canvas.addEventListener('wheel', (event) => {
      const delta = event.deltaY * 0.001;
      this.camera.position.multiplyScalar(1 + delta);
      this.lastMouseActivity = Date.now();
      event.preventDefault();
    });
  }
  
  resize() {
    // requestAnimationFrame ile resize işlemini optimize et 
    if (this._resizeScheduled) return;
    this._resizeScheduled = true;
    
    requestAnimationFrame(() => {
      this._resizeScheduled = false;
      if (!this.canvas) return;
      
      const rect = this.canvas.getBoundingClientRect();
      // Performans için cihaz piksel oranını düşük değerde sabitleyebiliriz
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5); // Maksimum 1.5x piksel oranı kullan
      this.canvas.width = Math.max(1, Math.round(rect.width * ratio)); 
      this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
      
      if(this.renderer && this.camera) { 
        this.renderer.setPixelRatio(ratio); 
        this.renderer.setSize(rect.width, rect.height, false); 
        this.camera.aspect = rect.width / Math.max(1, rect.height); 
        this.camera.updateProjectionMatrix(); 
        // Yeniden boyutlandırma sonrası bir kerelik render
        if (this.scene) this.renderer.render(this.scene, this.camera);
      }
    });
  }
  
  animate() { 
    if(!this.renderer) return; 
    console.log('Animasyon başlatılıyor...');
    
    // Performans için değişkenler
    this.lastFrameTime = 0;
    this.frameDelta = 0;
    this.targetFps = 30; // FPS sınırı
    this.frameInterval = 1000 / this.targetFps;
    this.isVisible = true;
    
    // Görünürlük durumu takibi için
    this.visibilityObserver = new IntersectionObserver((entries) => {
      this.isVisible = entries[0].isIntersecting;
    }, { threshold: 0.1 });
    
    if (this.canvas) {
      this.visibilityObserver.observe(this.canvas);
    }
    
    const render = (timestamp) => { 
      requestAnimationFrame(render);
      
      // Element görünür değilse render etmeyi atla
      if (!this.isVisible) return;
      
      // FPS sınırlama - daha az kaynak kullanımı için
      this.frameDelta = timestamp - this.lastFrameTime;
      if (this.frameDelta < this.frameInterval) return;
      this.lastFrameTime = timestamp - (this.frameDelta % this.frameInterval);
      
      // Auto-rotate: 3sn inaktif ise hedef dönüşü arttır
      if (this.vehicleModel && this.root) {
        const idle = Date.now() - (this.lastMouseActivity||0) > 3000 && !this.isMouseDown;
        if (idle) {
          this.targetRotationY += this.autoRotationSpeed;
        }
        // Hedefe yumuşak yaklaşım (lerp)
        this.root.rotation.y += (this.targetRotationY - this.root.rotation.y) * 0.1;
        this.root.rotation.x += (this.targetRotationX - this.root.rotation.x) * 0.1;
      }
      
      this.renderer.render(this.scene, this.camera); 
    }; 
    
    render(0); 
    console.log('Render döngüsü başladı');
  }
}
