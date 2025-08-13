const fs = require('fs'); const path = require('path');

function cp(src, dst){
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('copied', src, '->', dst);
}
try{
  const r = p => require.resolve(p);
  const threeModule = r('three/build/three.module.js');
  const gltfLoader  = r('three/examples/jsm/loaders/GLTFLoader.js');
  cp(threeModule, path.join(__dirname, '..', 'media', 'vendor', 'three', 'three.module.js'));
  cp(gltfLoader,  path.join(__dirname, '..', 'media', 'vendor', 'three', 'GLTFLoader.js'));
}catch(e){
  console.warn('three copy failed:', e.message);
}
