var vertexShaderStr = `
  varying vec3 vViewPosition;
  varying vec3 vNormal;
  attribute vec2 uv2;
  attribute vec3 texPos;
  attribute vec3 texNorm;
  uniform float bbox_max;
  uniform float bbox_min;

  void main() {
    vec3 textureNorm = texNorm;
    vec3 texturePos = texPos;

    float expand = bbox_max - bbox_min; //bbmax - bbmin
    texturePos.xyz *= expand;
    texturePos.xyz += bbox_min;

    vec3 p = position + texturePos.xzy;  //swizzle y and z because textures are exported with z-up
    textureNorm *= 2.0;
    textureNorm -= 1.0;
    vNormal = normalMatrix * textureNorm.xzy;

    vec4 modelViewPosition = modelViewMatrix * vec4(p, 1.0);
    vViewPosition = -modelViewPosition.xyz;
    gl_Position = projectionMatrix * modelViewPosition;
  }
`;