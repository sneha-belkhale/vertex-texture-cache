function parseExr(arrayBuffer) {
  let data = new Uint8Array(arrayBuffer);

  ParseEXRHeaderFromMemory = cwrap(
    'ParseEXRHeaderFromMemory', 'number', ['number', 'number', 'number']
  );

  LoadEXRFromMemory = cwrap(
    'LoadEXRFromMemory', 'number', ['number', 'number', 'string']
  );

  let widthPtr = _malloc(4);
  let widthHeap = new Uint8Array(HEAPU8.buffer, widthPtr, 4);
  let heightPtr = _malloc(4);
  let heightHeap = new Uint8Array(HEAPU8.buffer, heightPtr, 4);
  let ptr = _malloc(data.length);
  let dataHeap = new Uint8Array(HEAPU8.buffer, ptr, data.length);
  dataHeap.set(new Uint8Array(data.buffer));

  let ret  = ParseEXRHeaderFromMemory(widthHeap.byteOffset, heightHeap.byteOffset, dataHeap.byteOffset);

  let width = (new Int32Array(widthHeap.buffer, widthHeap.byteOffset, 1))[0];
  let height = (new Int32Array(heightHeap.buffer, heightHeap.byteOffset, 1))[0];

  let imgDataLen = width * height * 4 * 4;
  let img = _malloc(imgDataLen);
  let imgHeap = new Float32Array(HEAPU8.buffer, img, imgDataLen/4);

  ret = LoadEXRFromMemory(imgHeap.byteOffset, dataHeap.byteOffset, null);

  // Now imgHeap contains HDR image: float x RGBA x width x height
  return {
    data: imgHeap,  // Float32Array
    width: width,
    height: height
  };
}
//output the progress of texture / object loaders
function onProgress (xhr) {
  if ( xhr.lengthComputable ) {
    var percentComplete = xhr.loaded / xhr.total * 100;
    console.log( Math.round(percentComplete, 2) + '% downloaded' );
  }
};

let onError = (err) => {
  console.log(err);
};

var scene, camera, renderer, controls;
var squidMesh;
var exrPos, exrNorm;
var count;
var startTime;
var timeDelta = 0;
var fps = 20.0 //fps
var numOfFrames = 128
var totalDuration = numOfFrames * (1 / fps) * 1000 ;
var timeInFrames = 0.001;
var forward = false;


function init () {
  //INIT SCENE
  scene = new THREE.Scene();
  //INIT CAMERA
  camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 1000000 );
  controls = new THREE.OrbitControls(camera);

  camera.position.set(0, -211.46220431794083, 321.89248277879454);
  controls.target.set(0, -211, 0);
  controls.update()
  //INIT RENDERER
  renderer = new THREE.WebGLRenderer();
  renderer.setSize( window.innerWidth, window.innerHeight );
  document.body.appendChild( renderer.domElement );

  /*************** SET UP THE MATERIAL FOR FBX GEOMETRY ***************/
  var uniform = {
    emissive: {type: 'c', value: new THREE.Color(0x00000)},
    specular: {type: 'c', value: new THREE.Color(0xFFFFFF)},
    shininess: {value: 10},
    //these are for the vertex shader
    bbox_max: {value: 200.236846924},
    bbox_min: {value: -619.393371582}
  }
  //use the built in phong fragment shader to handle lighting
  var phongShader = THREE.ShaderLib.phong;
  var phongUniform = THREE.UniformsUtils.clone(phongShader.uniforms); //copy over the remaining values

  this.uniforms = THREE.UniformsUtils.merge([phongUniform, uniform])

  var material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: vertexShaderStr,
    fragmentShader: phongShader.fragmentShader,
    lights: true,
    side: THREE.DoubleSide,
    transparent: true,
    //derivatives: true //so that we can calculate the actual normal at each vertex in the fragment shader
  });

  /*************** FBX GEOMETRY AND EXR TEXTURE LOADING ***************/
  let manager = new THREE.LoadingManager();
  let FBXLoader = new THREE.FBXLoader( manager );
  FBXLoader.load( 'assets/squid_mesh.fbx', function ( object ) {
    object.traverse((child) => {
      if ( child instanceof THREE.Mesh ) {
        squidMesh = new THREE.Mesh(child.geometry, material);
        //fetch the first position texture exr
        fetch("assets/squid_pos.exr").then(function (response) {
          return response.arrayBuffer();
        }).then(function (arrayBuffer) {

          exrPos = parseExr(arrayBuffer);
          //fetch the second normal texture exr
          fetch("assets/squid_norm.exr").then(function (response) {
            return response.arrayBuffer();
          }).then(function (arrayBuffer) {

            exrNorm = parseExr(arrayBuffer);
            //populate the first set of position and normal displacements
            count = squidMesh.geometry.attributes.position.count;
            var texPos = new Float32Array ( count * 3 )
            var texNorm = new Float32Array ( count * 3 )
            //iterate through the uv's to find the corresponding value in the exr
            for (var i=0; i<count; i++){
              var u = Math.floor(squidMesh.geometry.attributes.uv2.array[2*i] * exrPos.width);
              var v = Math.floor(squidMesh.geometry.attributes.uv2.array[2*i+1] * exrPos.height);
              var t = 4*(v*exrPos.width + u);
              texPos[3*i] = exrPos.data[t];
              texPos[3*i+1] = exrPos.data[t+1];
              texPos[3*i+2] = exrPos.data[t+2];
              texNorm[3*i] = exrNorm.data[t];
              texNorm[3*i+1] = exrNorm.data[t+1];
              texNorm[3*i+2] = exrNorm.data[t+2];
            }
            //add the position and normal displacements as a shader attribute
            squidMesh.geometry.addAttribute( 'texPos', new THREE.BufferAttribute( texPos, 3 ) );
            squidMesh.geometry.addAttribute( 'texNorm', new THREE.BufferAttribute( texNorm, 3 ) );
            //start the animation now
            startTime = Date.now();
            animate(); //lets gooooo

          });
        });
      }
    });
    scene.add(squidMesh);
  }, onProgress, onError );

  /*************** SET UP THE LIGHTS FOR THE SCENE ***************/
  // var light1 = new THREE.PointLight( 0x7bf9f5, 0.3 );
  // light1.position.set(500,100,0);
  // scene.add( light1 );
  //
  // var light2 = new THREE.PointLight( 0xe006fb, 0.4 );
  // light2.position.set(500,-100,0);
  // scene.add( light2 );
  //
  // var light3 = new THREE.PointLight( 0x608bff, 0.9 );
  // light3.position.set(-100,100,-100);
  // scene.add( light3 );
  var sphere = new THREE.SphereGeometry( 10, 16, 8 );
  light1 = new THREE.PointLight( 0xff0040, 0.3 );
  light1.add( new THREE.Mesh( sphere, new THREE.MeshBasicMaterial( { color: 0xff0040 } ) ) );
  light1.position.set(500,100,-300);
  scene.add( light1 );
  light2 = new THREE.PointLight( 0x0040ff, 0.4 );
  light2.add( new THREE.Mesh( sphere, new THREE.MeshBasicMaterial( { color: 0x0040ff } ) ) );
  light2.position.set(500,-100,300);
  scene.add( light2 );
  light3 = new THREE.PointLight( 0x80ff80, 0.4 );
  light3.add( new THREE.Mesh( sphere, new THREE.MeshBasicMaterial( { color: 0x80ff80 } ) ) );
  light3.position.set(-500,100,-500);
  scene.add( light3 );

  stats = new Stats();
  document.body.appendChild( stats.dom );
}

function animate() {
  requestAnimationFrame( animate );
  controls.update();
  render();
  stats.update();
}

function render() {
  //change direction of animation when ready
  if (timeInFrames === 0.99) {
    startTime = Date.now() + 0.01;
    forward = false;
  }
  if (timeInFrames === 0.0) {
    startTime = Date.now() + 0.01;
    forward = true;
  }
  //update the timeInFrames
  timeDelta = Date.now() - startTime;
  if (forward) {
    timeInFrames = Math.min(timeDelta / totalDuration, 0.99);
  } else {
    timeInFrames = 0.99 - Math.min(timeDelta / totalDuration, 0.99);
  }
  //update the position and normal displacement attributes for the current timeInFrames (or row of EXR)
  var posValues = squidMesh.geometry.attributes.texPos.array;
  var normValues = squidMesh.geometry.attributes.texNorm.array;
  for (i = 0; i < count; i++) {
    var u = Math.floor(squidMesh.geometry.attributes.uv2.array[2*i] * exrPos.width);
    var v = Math.floor((squidMesh.geometry.attributes.uv2.array[2*i+1]-timeInFrames) * exrPos.height);
    var t = 4*(v*exrPos.width + u);
    posValues[3*i] = exrPos.data[t];
    posValues[3*i+1] = exrPos.data[t+1];
    posValues[3*i+2] = exrPos.data[t+2];
    normValues[3*i] = exrNorm.data[t];
    normValues[3*i+1] = exrNorm.data[t+1];
    normValues[3*i+2] = exrNorm.data[t+2];
  }
  //NEEDS UPDATE!!
  squidMesh.geometry.attributes.texPos.needsUpdate = true;
  squidMesh.geometry.attributes.texNorm.needsUpdate = true;

  renderer.render( scene, camera );
}

init ();