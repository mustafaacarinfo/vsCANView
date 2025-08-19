const fs = require('fs'); 
const path = require('path');

function cp(src, dst){
  try {
    // Create target directory
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    
    // Copy file (overwrite if exists)
    if (fs.existsSync(dst)) {
      fs.unlinkSync(dst);
    }
    fs.copyFileSync(src, dst);
    console.log('copied', src, '->', dst);
  } catch (err) {
    console.error('Copy error:', err.message);
    throw err;
  }
}
try{
  const nodeModules = path.join(__dirname, '..', 'node_modules', 'three');
  const threeModule = path.join(nodeModules, 'build', 'three.module.js');
  const gltfLoader = path.join(nodeModules, 'examples', 'jsm', 'loaders', 'GLTFLoader.js');
  
  if (fs.existsSync(threeModule) && fs.existsSync(gltfLoader)) {
    cp(threeModule, path.join(__dirname, '..', 'media', 'js', 'three', 'vendor', 'three.module.js'));
    cp(gltfLoader, path.join(__dirname, '..', 'media', 'js', 'three', 'vendor', 'GLTFLoader.js'));
  } else {
    throw new Error('Three.js files not found: ' + threeModule);
  }
}catch(e){
  console.warn('three copy failed:', e.message);
}
