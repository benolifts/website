'use strict';


const OBJECT_LINE_FILTERS=[["AddVertex","a"],["AddFace2","b"],["AddFace","c"],["LoadTexture","d"],["TranslateAll","k"],["Translate","e"],["CreateMeshBuilder","f"],["SetDecalTransparentColor","g"],["SetColor","h"],["GenerateNormals","i"],["SetTextureCoordinates","j"]];


// ============================================================
// TRACK GEOMETRY SAMPLING
// ============================================================

// All route geometry and track drawing is sampled every 1 metre.
var TRACK_DRAW_STEP = 1;
var temp_file;var buffer;

// ============================================================
// ROUTE BLOCK LENGTH
//
// Use the block_length variable defined elsewhere in the app.
// Retain compatibility with the older BLOCK_LENGTH spelling.
// There is deliberately no hard-coded 25 metre fallback.
// ============================================================

function getConfiguredBlockLength() {return (block_length ?? 25);}


var canvas = document.getElementById('cv');
var gl = window.simulatorGL;
var trackTextures = window.trackTextures;
var use_track_texture = [];


//todo later on the rails sound is based on
//var use_track_texture = [q][1] with q being the current type in use




var statusElement = document.getElementById('status');
overlay = document.getElementById('overlay');



if (!gl) {
    throw new Error('WebGL2 context was not initialised by index.html.');
}

if (!trackTextures || trackTextures.length !== textureCount * 2) {
    throw new Error('Track textures were not loaded correctly.');
}

ctx = overlay.getContext('2d');

if (!ctx) {
    throw new Error('Could not initialise the overlay canvas.');
}

var route = null;
var routeMesh = null;
var lastWidth = 0;
var lastHeight = 0;
var renderAnimationFrameId = null;
var renderLoopRunning = false;


// [zposition, track1, track2, type, switched]
var trackSwitches = [];

var trackSwitchMaxDistance = 0;
var trackSwitchMinDistance = 0;
var vertexShaderSource = `#version 300 es
precision highp float;

in vec3 aPosition;
in vec2 aTexCoord;
in float aTextureIndex;
in vec3 aColour;

uniform vec2 uResolution;
uniform float uTanHalfFov;
uniform float uNear;
uniform float uFar;
uniform vec3 uCameraPosition;
uniform vec3 uForward;
uniform vec3 uRight;

out vec2 vTexCoord;
out vec3 vColour;
flat out int vTextureIndex;

void main() {
    vec3 delta = aPosition - uCameraPosition;

    float forward = dot(delta, uForward);
    float lateral = dot(delta, uRight);

    vec3 cameraUp = cross(uForward, uRight);
    float vertical = dot(delta, cameraUp);

    float aspect = uResolution.x / uResolution.y;

    float xClip = lateral / (uTanHalfFov * aspect);
    float yClip = vertical / uTanHalfFov - 0.08 * forward;

    float A = (uFar + uNear) / (uFar - uNear);
    float B = (-2.0 * uFar * uNear) / (uFar - uNear);

    gl_Position = vec4(
        xClip,
        yClip,
        A * forward + B,
        forward
    );

    vTexCoord = aTexCoord;
    vTextureIndex = int(aTextureIndex + 0.5);
    vColour = aColour;
}
`;



var fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 vTexCoord;
in vec3 vColour;
flat in int vTextureIndex;

uniform sampler2D uTrackTexture;
uniform int uCurrentTextureIndex;

out vec4 outColour;

void main() {
    if (vTextureIndex != uCurrentTextureIndex) {
        discard;
    }

    if (vTextureIndex == 0) {
        outColour = vec4(vColour, 1.0);
    } else {
        vec4 texel = texture(uTrackTexture, vTexCoord);

        outColour = vec4(
            texel.rgb * vColour,
            texel.a
        );
    }
}
`;


function compileShader(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error('Shader compilation failed: ' + message);
    }

    return shader;
}

function createProgram(vsSource, fsSource) {
    var vs = compileShader(gl.VERTEX_SHADER, vsSource);
    var fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    var result = gl.createProgram();

    gl.attachShader(result, vs);
    gl.attachShader(result, fs);
    gl.linkProgram(result);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
        var message = gl.getProgramInfoLog(result);
        gl.deleteProgram(result);
        throw new Error('Program linking failed: ' + message);
    }

    return result;
}

var program = createProgram(vertexShaderSource, fragmentShaderSource);
var vao = gl.createVertexArray();
var vertexBuffer = gl.createBuffer();



var FLOATS_PER_VERTEX = 9;
var BYTES_PER_VERTEX = FLOATS_PER_VERTEX * 4;

var aPosition = gl.getAttribLocation(program, 'aPosition');
var aTexCoord = gl.getAttribLocation(program, 'aTexCoord');
var aTextureIndex = gl.getAttribLocation(program, 'aTextureIndex');
var aColour = gl.getAttribLocation(program, 'aColour');

gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, BYTES_PER_VERTEX, 0);

gl.enableVertexAttribArray(aTexCoord);
gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 12);

gl.enableVertexAttribArray(aTextureIndex);
gl.vertexAttribPointer(aTextureIndex, 1, gl.FLOAT, false, BYTES_PER_VERTEX, 20);

gl.enableVertexAttribArray(aColour);
gl.vertexAttribPointer(aColour, 3, gl.FLOAT, false, BYTES_PER_VERTEX, 24);


var uResolution = gl.getUniformLocation(program, 'uResolution');
var uTanHalfFov = gl.getUniformLocation(program, 'uTanHalfFov');
var uNear = gl.getUniformLocation(program, 'uNear');
var uFar = gl.getUniformLocation(program, 'uFar');
var uCameraPosition = gl.getUniformLocation(program, 'uCameraPosition');
var uForward = gl.getUniformLocation(program, 'uForward');
var uRight = gl.getUniformLocation(program, 'uRight');

var uTrackTexture = gl.getUniformLocation(
    program, 'uTrackTexture'
);

var uCurrentTextureIndex = gl.getUniformLocation(
    program, 'uCurrentTextureIndex'
);

gl.useProgram(program);
gl.activeTexture(gl.TEXTURE0);
gl.uniform1i(uTrackTexture, 0);

for (var textureCheck = 0; textureCheck < trackTextures.length; textureCheck++) {
    if (!trackTextures[textureCheck]) {
        throw new Error(
            'Track texture ' + textureCheck + ' is missing.'
        );
    }
}

gl.bindTexture(gl.TEXTURE_2D, trackTextures[0]);

gl.activeTexture(gl.TEXTURE0);
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LESS);
gl.clearDepth(1.0);
gl.disable(gl.CULL_FACE);

function resize() {
    function sizeCanvas(element) {
        var rect = element.getBoundingClientRect();

        var w = Math.max(1, Math.round(rect.width));
        var h = Math.max(1, Math.round(rect.height));

        if (element.width !== w || element.height !== h) {
            element.width = w;
            element.height = h;
        }
    }

    sizeCanvas(canvas);
    sizeCanvas(overlay);

    gl.viewport(0, 0, canvas.width, canvas.height);

    lastWidth = canvas.width;
    lastHeight = canvas.height;
}

window.addEventListener('resize', resize);
resize();

function num(v, def = 0) {
    var n = parseFloat(String(v ?? '').trim());
    return Number.isFinite(n) ? n : def;
}

function int(v, def = 0) {
    var n = parseInt(String(v ?? '').trim(), 10);
    return Number.isFinite(n) ? n : def;
}

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function fmt(v) {
    return Math.round(v).toLocaleString() + ' m';
}

async function readFileText(file) {
    var buf = await file.arrayBuffer();

    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
        try {
            return new TextDecoder('shift-jis').decode(buf);
        } catch (e2) {
            return new TextDecoder().decode(buf);
        }
    }
}







var route_textures = [];
var route_objects = [];
var route_texture_errors = [];
var object_linup = [];



async function downloadTextureImage(textureUrl) {
    if (!route_zip) {
        throw new Error('No texture ZIP has been loaded.');
    }

    // Normalise the requested filename to match ZIP entries.
    var filename = textureUrl
    .replace(/\\/g, '/')
    .replace(/^\/t\//i, '')
    .replace(/^\/+/, '')
    .toLowerCase();

    // The ZIP stores textures under numbered filenames.
    var imageData = route_zip[filename];

    if (!imageData) {
        throw new Error(
            'Texture not found in ZIP: ' + filename
        );
    }

    // Create a Blob from the binary ZIP data.
    var blob = new Blob([imageData]);

    // Resolve only when the image has been decoded and is usable.
    try {
        return await createImageBitmap(blob);
    } catch (error) {
        throw new Error(
            'Failed to decode texture "' + filename + '": ' +
            (error.message || String(error))
        );
    }
}


// ============================================================
// STAGE 4 SUPPORT: UPLOAD ONE IMAGE TO THE GPU
//
// Assumes your existing WebGL context is named gl.
// ============================================================

function uploadTextureToGPU(image) {
    var texture = gl.createTexture();

    if (!texture) {
        throw new Error('Could not create WebGL texture');
    }

    try {
        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texParameteri(
            gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR
        );
        gl.texParameteri(
            gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR
        );
        gl.texParameteri(
            gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE
        );
        gl.texParameteri(
            gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE
        );

        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA,
            gl.RGBA, gl.UNSIGNED_BYTE, image
        );

        if (DEBUG_GL_UPLOADS) {var error = gl.getError();

            if (error !== gl.NO_ERROR) {
                throw new Error('WebGL upload error: ' + error);
            }}

            return texture;
    } catch (error) {
        gl.deleteTexture(texture);
        throw error;
    } finally {
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}


// ============================================================
// STAGE 4 SUPPORT: CREATE A FALLBACK GPU TEXTURE
//
// Used if a texture is missing or cannot be uploaded.
// The 1x1 magenta texture prevents a missing image from
// leaving a null GPU texture reference.
// ============================================================

function createMissingTextureGPU() {
    var texture = gl.createTexture();

    if (!texture) {
        throw new Error('Could not create fallback texture');
    }

    try {
        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texParameteri(
            gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST
        );
        gl.texParameteri(
            gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST
        );
        gl.texParameteri(
            gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE
        );
        gl.texParameteri(
            gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE
        );

        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA,
            1, 1, 0,
            gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([255, 0, 255, 255])
        );

        if (DEBUG_GL_UPLOADS) {var error = gl.getError();

            if (error !== gl.NO_ERROR) {
                throw new Error('Fallback GPU error: ' + error);
            }}

            return texture;
    } catch (error) {
        gl.deleteTexture(texture);
        throw error;
    } finally {
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}


// ============================================================
// STAGE 4: LOAD TEXTURES SEQUENTIALLY
//
// Array fields:
// [0] texture number
// [1] texture URL
// [2] image loaded successfully
// [3] decoded image
// [4] GPU upload successful
// [5] GPU texture (or fallback texture)
// ============================================================

async function loadAllRouteTextures() {
    route_texture_errors = [];

    for (var i = 0; i < route_textures.length; i++) {
        var entry = route_textures[i];

        try {
            // Download and decode the current texture.
            entry[3] = await downloadTextureImage(entry[1]);
            entry[2] = true;

            // Upload it before beginning the next download.
            entry[5] = uploadTextureToGPU(entry[3]);
            entry[4] = true;

            // Optional: release the CPU-side image after upload.
            // entry[3].close();
            // entry[3] = null;

            // Optional future array removal. Leave commented out.
            // route_textures.splice(i, 1);
            // i--;

        } catch (error) {
            route_texture_errors.push({
                number: entry[0],
                url: entry[1],
                error: error.message
            });

            console.error(
                'Texture failed:', entry[1], error
            );

            // Record the original texture as unsuccessful.
            entry[4] = false;

            // Provide a valid GPU fallback if possible.
            if (entry[5] === null) {
                try {
                    entry[5] = createMissingTextureGPU();
                } catch (fallbackError) {
                    console.error(
                        'Fallback texture creation failed:',
                        fallbackError
                    );
                }
            }

            // Continue to the next texture after handling the failure.
        }
    }
}

// ============================================================
// stage 5: LOAD AND PROCESS THE OBJECTS
// ============================================================



//////TODO

var route_object_errors = [];

// route_objects fields:
// [0] Object name/path
// [1] Object type: "csv" or "x"
// [2] Object text
// [3] GPU loaded
// [4] GPU object

var route_object_errors = [];

// route_objects fields:
// [0] Object name/path
// [1] Object type: "csv" or "x"
// [2] Object text
// [3] GPU loaded
// [4] GPU object
//
// CSV object support:
// BVE4 commands: CreateMeshBuilder, AddVertex, AddFace, AddFace2, Cube,
// Cylinder, Translate, Scale, Rotate, SetColor, LoadTexture,
// SetDecalTransparentColor, SetTextureCoordinates.
// OpenBVE additions supported here: *All transforms, Shear, Mirror,
// emissive colour, blend/wrap modes, day/night textures and crossfading.
// Animation commands are deliberately not implemented.

async function loadAllRouteObjects() {
    route_object_errors = [];

    function deleteGpuObject(gpuObject) {
        if (!gpuObject || !Array.isArray(gpuObject.meshes)) return;

        for (var m of gpuObject.meshes) {
            if (!m) continue;

            if (m.objectVao) {
                try {
                    gl.deleteVertexArray(m.objectVao);
                } catch (error) {
                    console.warn("Could not delete object VAO:", error);
                }
                m.objectVao = null;
            }

            for (var key of [
                "positionBuffer",
                 "normalBuffer",
                 "uvBuffer",
                 "indexBuffer"
            ]) {
                if (m[key]) {
                    try {
                        gl.deleteBuffer(m[key]);
                    } catch (error) {
                        console.warn("Could not delete object buffer:", error);
                    }
                    m[key] = null;
                }
            }

            // A mesh references shared route textures; it does not own them.
            m.texture = null;
            m.nightTexture = null;

            // Release any temporary CPU arrays left by a failed upload.
            delete m._positions;
            delete m._normals;
            delete m._uvs;
            delete m._indices;
        }
    }

    function normalizePath(path) {
        var p = String(path == null ? '' : path)
        .replace(/\\/g, '/')
        .replace(/^\uFEFF/, '')
        .trim();
        var prefix = '';
        if (/^[a-z]+:\/\//i.test(p)) {
            var schemeMatch = p.match(/^([a-z]+:\/\/[^/]+)(.*)$/i);
            if (schemeMatch) {
                prefix = schemeMatch[1];
                p = schemeMatch[2] || '';
            }
        }
        var absolute = p.startsWith('/');
        var parts = [];
        for (var part of p.split('/')) {
            if (!part || part === '.') continue;
            if (part === '..') {
                if (parts.length && parts[parts.length - 1] !== '..') parts.pop();
                else if (!absolute) parts.push('..');
            } else {
                parts.push(part);
            }
        }
        return (prefix + (absolute ? '/' : '') + parts.join('/')).toLowerCase();
    }

    function pathDirectory(path) {
        var p = String(path == null ? '' : path).replace(/\\/g, '/');
        var slash = p.lastIndexOf('/');
        return slash < 0 ? '' : p.slice(0, slash + 1);
    }

    function pathBase(path) {
        var p = String(path == null ? '' : path).replace(/\\/g, '/');
        return p.slice(p.lastIndexOf('/') + 1).toLowerCase();
    }

    function resolveTextureEntry(reference, objectPath) {
        var ref = String(reference == null ? '' : reference).trim();
        if (!ref) return null;

        // Compatibility with the old application-specific syntax: LoadTexture,0
        // resolves route_textures[0]. Standard BVE CSV uses texture filenames.
        if (/^\d+$/.test(ref)) {
            var numericIndex = Number(ref);
            var indexedEntry = route_textures[numericIndex];
            if (!indexedEntry) {
                throw new Error('LoadTexture index out of range: ' + ref);
            }
            return indexedEntry;
        }

        var directory = pathDirectory(objectPath);
        var expected = normalizePath(directory + ref);
        var rawRef = normalizePath(ref);
        var candidates = [];

        for (var i = 0; i < route_textures.length; i++) {
            var textureEntry = route_textures[i];
            if (!textureEntry) continue;
            var texturePath = textureEntry[0];
            if (typeof texturePath !== 'string' || !texturePath.trim()) continue;
            var normalized = normalizePath(texturePath);
            if (normalized === expected || normalized === rawRef) {
                return textureEntry;
            }
            // Some projects keep paths relative to a common texture root while
            // the object filename is rooted elsewhere. Accept an exact suffix.
            if (normalized.endsWith('/' + rawRef)) candidates.push(textureEntry);
        }
        if (candidates.length === 1) return candidates[0];

        // Last-resort basename match is safe only when it is unambiguous.
        var wantedBase = pathBase(ref);
        var baseMatches = [];
        for (var j = 0; j < route_textures.length; j++) {
            var candidate = route_textures[j];
            if (candidate && typeof candidate[0] === 'string' &&
                pathBase(candidate[0]) === wantedBase) {
                baseMatches.push(candidate);
                }
        }
        if (baseMatches.length === 1) return baseMatches[0];

        if (baseMatches.length > 1 || candidates.length > 1) {
            throw new Error('Ambiguous LoadTexture filename "' + ref + '"');
        }
        throw new Error('LoadTexture file not found in route_textures: ' + ref);
    }

    function resolveTextureGpu(reference, objectPath) {
        if (reference == null || String(reference).trim() === '') return null;
        var textureEntry = resolveTextureEntry(reference, objectPath);
        if (!textureEntry) return null;
        var gpuTexture = textureEntry[5];
        if (!gpuTexture) {
            throw new Error(
                'Texture GPU upload missing for LoadTexture reference "' +
                reference + '"'
            );
        }
        return gpuTexture;
    }

    function parseNumber(value, defaultValue, description) {
        if (value == null || String(value).trim() === '') return defaultValue;
        var n = Number(String(value).trim());
        if (!Number.isFinite(n)) {
            throw new Error('Invalid number for ' + description + ': ' + value);
        }
        return n;
    }

    function parseNumbers(args, count, defaults, description) {
        var out = [];
        for (var i = 0; i < count; i++) {
            out.push(parseNumber(args[i], defaults[i], description));
        }
        return out;
    }

    function normalizeVector(v) {
        var length = Math.hypot(v[0], v[1], v[2]);
        if (length > 1e-20) return [v[0] / length, v[1] / length, v[2] / length];
        return [0, 0, 0];
    }

    function makeFaceMaterial(mesh) {
        return {
            colour: [1, 1, 1, 1],
            emissiveColor: [0, 0, 0],
            transparentColor: null,
            blendMode: mesh.currentBlendMode,
            glowHalfDistance: mesh.currentGlowHalfDistance,
            glowAttenuationMode: mesh.currentGlowAttenuationMode
        };
    }

    function cloneFaceMaterial(material) {
        return {
            colour: material.colour.slice(),
            emissiveColor: material.emissiveColor.slice(),
            transparentColor: material.transparentColor
            ? material.transparentColor.slice() : null,
            blendMode: material.blendMode,
            glowHalfDistance: material.glowHalfDistance,
            glowAttenuationMode: material.glowAttenuationMode
        };
    }

    function colourArguments(args, defaultComponent) {
        var components = [];
        for (var i = 0; i < 4; i++) {
            var component = parseNumber(
                args[i], defaultComponent, 'colour component'
            );
            component = Math.max(0, Math.min(255, component));
            components.push(component / 255);
        }
        return components;
    }

    function emissiveArguments(args) {
        var components = [];
        for (var i = 0; i < 3; i++) {
            var component = parseNumber(args[i], 0, 'emissive colour component');
            components.push(Math.max(0, Math.min(255, component)) / 255);
        }
        return components;
    }

    function transparentArguments(args) {
        var components = [];
        for (var i = 0; i < 3; i++) {
            var component = parseNumber(args[i], 0, 'transparent colour component');
            if (component < 0 || component > 255) {
                throw new Error('Transparent colour components must be in [0,255]');
            }
            components.push(component / 255);
        }
        return components;
    }

    function determinant3(m) {
        return m[0] * (m[4] * m[8] - m[5] * m[7])
        - m[1] * (m[3] * m[8] - m[5] * m[6])
        + m[2] * (m[3] * m[7] - m[4] * m[6]);
    }

    function inverseTranspose3(m) {
        var det = determinant3(m);
        if (Math.abs(det) < 1e-20) return null;
        var invDet = 1 / det;

        return [
            (m[4] * m[8] - m[5] * m[7]) * invDet,
            (m[5] * m[6] - m[3] * m[8]) * invDet,
            (m[3] * m[7] - m[4] * m[6]) * invDet,
            (m[2] * m[7] - m[1] * m[8]) * invDet,
            (m[0] * m[8] - m[2] * m[6]) * invDet,
            (m[1] * m[6] - m[0] * m[7]) * invDet,
            (m[1] * m[5] - m[2] * m[4]) * invDet,
            (m[2] * m[3] - m[0] * m[5]) * invDet,
            (m[0] * m[4] - m[1] * m[3]) * invDet
        ];
    }

    function applyMatrixToVector(m, v) {
        return [
            m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
            m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
            m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
        ];
    }

    function transformMeshLinear(targetMesh, matrix) {
        for (var p of targetMesh.vertices) {
            var transformed = applyMatrixToVector(matrix, p);
            p[0] = transformed[0];
            p[1] = transformed[1];
            p[2] = transformed[2];
        }

        var normalMatrix = inverseTranspose3(matrix);
        for (var n of targetMesh.vertexNormals) {
            if (Math.hypot(n[0], n[1], n[2]) < 1e-20) continue;
            if (!normalMatrix) {
                n[0] = 0; n[1] = 0; n[2] = 0;
            } else {
                var transformedNormal = normalizeVector(
                    applyMatrixToVector(normalMatrix, n)
                );
                n[0] = transformedNormal[0];
                n[1] = transformedNormal[1];
                n[2] = transformedNormal[2];
            }
        }

        if (determinant3(matrix) < 0) {
            for (var face of targetMesh.faces) face.indices.reverse();
        }
    }
    function translateMesh(mesh, x, y, z) {
        for (var p of mesh.vertices) {
            p[0] += x;
            p[1] += y;
            p[2] += z;
        }
    }

    function rotationMatrix(ax, ay, az, degrees) {
        var axis = normalizeVector([ax, ay, az]);
        if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-20) axis = [1, 0, 0];
        var x = axis[0], y = axis[1], z = axis[2];
        var angle = degrees * Math.PI / 180;
        var c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
        return [
            t * x * x + c,     t * x * y - s * z, t * x * z + s * y,
            t * x * y + s * z, t * y * y + c,     t * y * z - s * x,
            t * x * z - s * y, t * y * z + s * x, t * z * z + c
        ];
    }

    function shearMatrix(dx, dy, dz, sx, sy, sz, ratio) {
        var d = normalizeVector([dx, dy, dz]);
        var s = normalizeVector([sx, sy, sz]);
        if (Math.hypot(d[0], d[1], d[2]) < 1e-20 ||
            Math.hypot(s[0], s[1], s[2]) < 1e-20 || ratio === 0) {
            return [1, 0, 0, 0, 1, 0, 0, 0, 1];
            }
            // Shear along S by ratio * projection onto D.
            return [
                1 + ratio * s[0] * d[0], ratio * s[0] * d[1], ratio * s[0] * d[2],
                ratio * s[1] * d[0], 1 + ratio * s[1] * d[1], ratio * s[1] * d[2],
                ratio * s[2] * d[0], ratio * s[2] * d[1], 1 + ratio * s[2] * d[2]
            ];
    }

    function createCube(mesh, halfWidth, halfHeight, halfDepth) {
        var x = halfWidth, y = halfHeight, z = halfDepth;
        var base = mesh.vertices.length;
        var points = [
            [ x,  y, -z], [ x, -y, -z], [-x, -y, -z], [-x,  y, -z],
            [ x,  y,  z], [ x, -y,  z], [-x, -y,  z], [-x,  y,  z]
        ];
        for (var p of points) {
            mesh.vertices.push(p);
            mesh.vertexNormals.push([0, 0, 0]);
            mesh.uvs.push(null);
        }
        var faces = [
            [0, 1, 2, 3], [0, 4, 5, 1], [0, 3, 7, 4],
            [6, 5, 4, 7], [6, 7, 3, 2], [6, 2, 1, 5]
        ];
        for (var face of faces) {
            addFaceToMesh(mesh, face.map(index => index + base), false);
        }
    }

    function addCylinder(mesh, segments, upperRadius, lowerRadius, height) {
        if (!Number.isInteger(segments) || segments < 3) {
            throw new Error('Cylinder requires at least 3 segments');
        }
        var base = mesh.vertices.length;
        var topIndices = [];
        var bottomIndices = [];
        var topRadius = Math.abs(upperRadius);
        var bottomRadius = Math.abs(lowerRadius);

        for (var i = 0; i < segments; i++) {
            var angle = 2 * Math.PI * i / segments;
            var x = Math.cos(angle), z = Math.sin(angle);
            var topIndex = base + i * 2;
            var bottomIndex = topIndex + 1;
            mesh.vertices.push([x * topRadius, height / 2, z * topRadius]);
            mesh.vertices.push([x * bottomRadius, -height / 2, z * bottomRadius]);
            mesh.vertexNormals.push([0, 0, 0], [0, 0, 0]);
            mesh.uvs.push(null, null);
            topIndices.push(topIndex);
            bottomIndices.push(bottomIndex);
        }

        for (var side = 0; side < segments; side++) {
            var next = (side + 1) % segments;
            var sideFace = [topIndices[side], topIndices[next],
            bottomIndices[next], bottomIndices[side]];
            if (height < 0) sideFace.reverse();
            addFaceToMesh(mesh, sideFace, false);
        }

        // A negative radius omits that cap (the radius itself is absolute).
        if (upperRadius > 0) {
            var topFace = topIndices.slice().reverse();
            if (height < 0) topFace.reverse();
            addFaceToMesh(mesh, topFace, false);
        }
        if (lowerRadius > 0) {
            var bottomFace = bottomIndices.slice();
            if (height < 0) bottomFace.reverse();
            addFaceToMesh(mesh, bottomFace, false);
        }
    }

    function addFaceToMesh(mesh, indices, doubleSided) {
        if (indices.length < 3) throw new Error('A face requires at least 3 vertex indices');
        for (var index of indices) {
            if (!Number.isInteger(index) || index < 0 || index >= mesh.vertices.length) {
                throw new Error('Face references invalid vertex index: ' + index);
            }
        }
        mesh.faces.push({
            indices: indices.slice(),
                        doubleSided: Boolean(doubleSided),
                        material: makeFaceMaterial(mesh)
        });
    }

    function normalForTriangle(p0, p1, p2) {
        var ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
        var vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
        return normalizeVector([
            uy * vz - uz * vy,
            uz * vx - ux * vz,
            ux * vy - uy * vx
        ]);
    }

    function materialKey(material, doubleSided) {
        return JSON.stringify([
            material.colour,
            material.emissiveColor,
            material.transparentColor,
            material.blendMode,
            material.glowHalfDistance,
            material.glowAttenuationMode,
            Boolean(doubleSided)
        ]);
    }

    function computeVertexNormals(sourceMesh) {
        var sums = sourceMesh.vertices.map(() => [0, 0, 0]);
        for (var face of sourceMesh.faces) {
            var faceIndices = face.indices;
            for (var tri = 1; tri < faceIndices.length - 1; tri++) {
                var a = faceIndices[0], b = faceIndices[tri], c = faceIndices[tri + 1];
                var n = normalForTriangle(
                    sourceMesh.vertices[a], sourceMesh.vertices[b], sourceMesh.vertices[c]
                );
                for (var vertexIndex of [a, b, c]) {
                    sums[vertexIndex][0] += n[0];
                    sums[vertexIndex][1] += n[1];
                    sums[vertexIndex][2] += n[2];
                }
            }
        }
        return sourceMesh.vertexNormals.map(function (explicit, index) {
            if (Math.hypot(explicit[0], explicit[1], explicit[2]) > 1e-20) {
                return normalizeVector(explicit);
            }
            return normalizeVector(sums[index]);
        });
    }

    function makeGpuMeshForMaterial(sourceMesh, materialGroup, vertexNormals, textureDay, textureNight) {
        var positions = [];
        var normals = [];
        var uvs = [];
        var indices = [];
        var remap = new Map();
        var vertexCount = 0;

        function getLocalIndex(sourceIndex) {
            if (remap.has(sourceIndex)) return remap.get(sourceIndex);
            var localIndex = vertexCount++;
            remap.set(sourceIndex, localIndex);
            var p = sourceMesh.vertices[sourceIndex];
            var n = vertexNormals[sourceIndex];
            var uv = sourceMesh.uvs[sourceIndex] || [0, 0];
            positions.push(p[0], p[1], p[2]);
            normals.push(n[0], n[1], n[2]);
            uvs.push(uv[0], uv[1]);
            return localIndex;
        }

        for (var tri of materialGroup.triangles) {
            indices.push(
                getLocalIndex(tri[0]),
                         getLocalIndex(tri[1]),
                         getLocalIndex(tri[2])
            );
        }

        var usedUVsRepeatS = false;
        var usedUVsRepeatT = false;
        for (var pair of uvs.entries()) {
            if (pair[0] % 2 === 0 && (pair[1] < 0 || pair[1] > 1)) usedUVsRepeatS = true;
            if (pair[0] % 2 === 1 && (pair[1] < 0 || pair[1] > 1)) usedUVsRepeatT = true;
        }

        var explicitWrap = sourceMesh.wrapMode;
        var repeatS = usedUVsRepeatS;
        var repeatT = usedUVsRepeatT;
        if (explicitWrap === 'clampclamp') { repeatS = false; repeatT = false; }
        else if (explicitWrap === 'clamprepeat') { repeatS = false; repeatT = true; }
        else if (explicitWrap === 'repeatclamp') { repeatS = true; repeatT = false; }
        else if (explicitWrap === 'repeatrepeat') { repeatS = true; repeatT = true; }

        return {
            texture: textureDay,
            nightTexture: textureNight,
            vertexCount: vertexCount,
            indexCount: indices.length,
            positionBuffer: null,
            normalBuffer: null,
            uvBuffer: null,
            indexBuffer: null,
            colour: materialGroup.material.colour.slice(),
            emissiveColor: materialGroup.material.emissiveColor.slice(),
            transparentColor: materialGroup.material.transparentColor
            ? materialGroup.material.transparentColor.slice() : null,
            blendMode: materialGroup.material.blendMode,
            glowHalfDistance: materialGroup.material.glowHalfDistance,
            glowAttenuationMode: materialGroup.material.glowAttenuationMode,
            doubleSided: materialGroup.doubleSided,
            crossfade: sourceMesh.crossfade,
            wrapMode: explicitWrap,
            repeatS: repeatS,
            repeatT: repeatT
            , _positions: positions, _normals: normals, _uvs: uvs, _indices: indices };
    }    function uploadArrayBuffer(data, target) {
        var buffer = gl.createBuffer();
        if (!buffer) throw new Error('Could not create GPU buffer');
        try {
            gl.bindBuffer(target, buffer);
            gl.bufferData(target, data, gl.STATIC_DRAW);
            if (DEBUG_GL_UPLOADS) {var errorCode = gl.getError();
                if (errorCode !== gl.NO_ERROR) {
                    throw new Error('GPU buffer upload error: ' + errorCode);
                }}
                return buffer;
        } catch (error) {
            gl.deleteBuffer(buffer);
            throw error;
        } finally {
            gl.bindBuffer(target, null);
        }
    }

    function uploadGpuMesh(gpuMesh) {
        var positions = gpuMesh._positions;
        var normals = gpuMesh._normals;
        var uvs = gpuMesh._uvs;
        var indices = gpuMesh._indices;

        try {
            gpuMesh.positionBuffer = uploadArrayBuffer(
                new Float32Array(positions), gl.ARRAY_BUFFER
            );
            gpuMesh.normalBuffer = uploadArrayBuffer(
                new Float32Array(normals), gl.ARRAY_BUFFER
            );
            gpuMesh.uvBuffer = uploadArrayBuffer(
                new Float32Array(uvs), gl.ARRAY_BUFFER
            );

            if (gpuMesh.vertexCount > 65535) {
                var isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' &&
                gl instanceof WebGL2RenderingContext;
                if (!isWebGL2 && !gl.getExtension('OES_element_index_uint')) {
                    throw new Error(
                        'Object requires 32-bit indices, but OES_element_index_uint is unavailable'
                    );
                }
                gpuMesh.indexBuffer = uploadArrayBuffer(
                    new Uint32Array(indices), gl.ELEMENT_ARRAY_BUFFER
                );
                gpuMesh.indexType = gl.UNSIGNED_INT;
            } else {
                gpuMesh.indexBuffer = uploadArrayBuffer(
                    new Uint16Array(indices), gl.ELEMENT_ARRAY_BUFFER
                );
                gpuMesh.indexType = gl.UNSIGNED_SHORT;
            }
        } catch (error) {
            for (var key of ['positionBuffer', 'normalBuffer', 'uvBuffer', 'indexBuffer']) {
                if (gpuMesh[key]) {
                    try { gl.deleteBuffer(gpuMesh[key]); } catch (_) { /* ignore */ }
                    gpuMesh[key] = null;
                }
            }
            throw error;
        } finally {
            delete gpuMesh._positions;
            delete gpuMesh._normals;
            delete gpuMesh._uvs;
            delete gpuMesh._indices;
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
    }




    /*
     * Direct text-.x loader addition for loadAllRouteObjects().
     * Paste this function inside loadAllRouteObjects(), after uploadGpuMesh().
     * It reuses resolveTextureGpu(), computeVertexNormals(),
     * makeGpuMeshForMaterial(), and uploadGpuMesh() from the existing loader.
     *
     * Supported: text X headers, Mesh, nested Frame / FrameRoot transforms,
     * MeshNormals, MeshTextureCoords, MeshMaterialList, Material, TextureFilename.
     * X textures are resolved to existing route_textures GPU entries; no textures
     * are uploaded by this function.
     */
    function loadXObject(sourceText, objectPath, outputGpuMeshes) {
        function isNumberToken(value) {
            return /^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(value);
        }

        function decodeXString(token) {
            var value = token.slice(1, -1);
            value = value.replace(/\\\\/g, '\\');
            value = value.replace(/\\"/g, '"');
            return value;
        }

        function matchingBrace(tokens, openIndex, endIndex) {
            if (openIndex < 0 || openIndex >= endIndex || tokens[openIndex].value !== '{') {
                throw new Error('Invalid X block opening brace');
            }
            var depth = 0;
            var i = openIndex;
            while (i < endIndex) {
                if (tokens[i].value === '{') depth++;
                else if (tokens[i].value === '}') {
                    depth--;
                    if (depth === 0) return i;
                }
                i++;
            }
            throw new Error('Unclosed brace in X object');
        }

        function tokenizeX(text) {
            text = String(text == null ? '' : text).replace(/^\uFEFF/, '');
            var header = text.match(/^\s*xof\s+\d{4}(txt|bin|tzip|bzip)\s+\d{4}/i);
            if (!header) {
                throw new Error('Missing DirectX X header (expected xof ...txt ...)');
            }
            if (header[1].toLowerCase() !== 'txt') {
                throw new Error('Only text-format X files are supported; this X file is binary or compressed');
            }
            text = text.slice(header[0].length);

            var tokens = [];
            var expression = /("(?:\\.|[^"\\])*")|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|[{};,]|[^\s{};,]+/g;
            var match;
            while ((match = expression.exec(text)) !== null) {
                var value = match[0];
                if (value.slice(0, 2) === '//' || value.slice(0, 2) === '/*') continue;
                    var type = 'word';
                if (value.charAt(0) === '"') type = 'string';
                else if (value === '{' || value === '}' || value === ';' || value === ',') type = 'symbol';
                else if (isNumberToken(value)) type = 'number';
                tokens.push({ value: value, type: type });
            }

            // Template declarations describe the grammar rather than model geometry.
            var filtered = [];
            var i = 0;
            while (i < tokens.length) {
                if (tokens[i].type === 'word' && tokens[i].value.toLowerCase() === 'template') {
                    var open = i + 1;
                    while (open < tokens.length && tokens[open].value !== '{') open++;
                    if (open < tokens.length) {
                        i = matchingBrace(tokens, open, tokens.length) + 1;
                        continue;
                    }
                }
                filtered.push(tokens[i]);
                i++;
            }
            return filtered;
        }

        function findBlockAt(tokens, index, endIndex) {
            if (index < 0 || index >= endIndex || tokens[index].type !== 'word') return null;
            var openIndex = index + 1;
            var name = null;
            if (openIndex >= endIndex) return null;
            if (tokens[openIndex].value !== '{') {
                name = tokens[openIndex].value;
                openIndex++;
                if (openIndex >= endIndex || tokens[openIndex].value !== '{') return null;
            }
            var closeIndex = matchingBrace(tokens, openIndex, endIndex);
            return {
                type: tokens[index].value,
                name: name,
                start: index,
                open: openIndex,
                close: closeIndex
            };
        }

        function directChildBlocks(tokens, openIndex, closeIndex) {
            var children = [];
            var i = openIndex + 1;
            while (i < closeIndex) {
                var child = findBlockAt(tokens, i, closeIndex + 1);
                if (child && child.close < closeIndex) {
                    children.push(child);
                    i = child.close + 1;
                } else {
                    i++;
                }
            }
            return children;
        }

        function numericValues(tokens, startIndex, endIndex) {
            var values = [];
            var i = startIndex;
            while (i < endIndex) {
                if (tokens[i].type === 'number') values.push(Number(tokens[i].value));
                i++;
            }
            return values;
        }

        function takeInteger(values, state, label) {
            if (state.index >= values.length) throw new Error('Incomplete X ' + label);
            var value = values[state.index++];
            if (!Number.isInteger(value) || value < 0) {
                throw new Error('Invalid X ' + label + ': ' + value);
            }
            return value;
        }

        function takeFloat(values, state, label) {
            if (state.index >= values.length) throw new Error('Incomplete X ' + label);
            var value = values[state.index++];
            if (!Number.isFinite(value)) throw new Error('Invalid X ' + label);
            return value;
        }

        function skipSeparators(tokens, state, endIndex) {
            while (state.index < endIndex &&
                (tokens[state.index].value === ';' || tokens[state.index].value === ',')) {
                state.index++;
                }
        }

        function takeTokenNumber(tokens, state, endIndex, label) {
            skipSeparators(tokens, state, endIndex);
            if (state.index >= endIndex || tokens[state.index].type !== 'number') {
                throw new Error('Invalid X ' + label + ': expected a number');
            }
            var value = Number(tokens[state.index].value);
            state.index++;
            if (!Number.isFinite(value)) throw new Error('Invalid X ' + label);
            return value;
        }

        function takeTokenInteger(tokens, state, endIndex, label) {
            var value = takeTokenNumber(tokens, state, endIndex, label);
            if (!Number.isInteger(value) || value < 0) throw new Error('Invalid X ' + label + ': ' + value);
            return value;
        }

        function identityMatrix() {
            return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        }

        function multiplyMatrix(a, b) {
            var result = [];
            var row = 0;
            while (row < 4) {
                var column = 0;
                while (column < 4) {
                    var value = 0;
                    var k = 0;
                    while (k < 4) {
                        value += a[row * 4 + k] * b[k * 4 + column];
                        k++;
                    }
                    result.push(value);
                    column++;
                }
                row++;
            }
            return result;
        }

        function transformXPoint(matrix, point) {
            // DirectX X matrices use row-vector transforms and store translation at 12..14.
            return [
                point[0] * matrix[0] + point[1] * matrix[4] + point[2] * matrix[8] + matrix[12],
                point[0] * matrix[1] + point[1] * matrix[5] + point[2] * matrix[9] + matrix[13],
                point[0] * matrix[2] + point[1] * matrix[6] + point[2] * matrix[10] + matrix[14]
            ];
        }

        function determinantXLinear(matrix) {
            return matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9])
            - matrix[1] * (matrix[4] * matrix[10] - matrix[6] * matrix[8])
            + matrix[2] * (matrix[4] * matrix[9] - matrix[5] * matrix[8]);
        }

        function transformXNormal(matrix, normal) {
            // For row-vector positions p' = pM, normals transform by inverse(M).
            // Convert that operation to the existing column-vector inverse-transpose helper.
            var transposed = [
                matrix[0], matrix[4], matrix[8],
                matrix[1], matrix[5], matrix[9],
                matrix[2], matrix[6], matrix[10]
            ];
            var normalMatrix = inverseTranspose3(transposed);
            if (!normalMatrix) return [0, 0, 0];
            return normalizeVector(applyMatrixToVector(normalMatrix, normal));
        }

        function defaultXMaterial() {
            return {
                colour: [1, 1, 1, 1],
                emissiveColor: [0, 0, 0],
                transparentColor: null,
                blendMode: 'normal',
                glowHalfDistance: 0,
                glowAttenuationMode: 'divideexponent4',
                textureFilename: null
            };
        }

        function cloneXMaterial(material) {
            return {
                colour: material.colour.slice(),
                emissiveColor: material.emissiveColor.slice(),
                transparentColor: material.transparentColor ? material.transparentColor.slice() : null,
                blendMode: material.blendMode,
                glowHalfDistance: material.glowHalfDistance,
                glowAttenuationMode: material.glowAttenuationMode,
                textureFilename: material.textureFilename
            };
        }

        function parseXMaterial(tokens, block) {
            var children = directChildBlocks(tokens, block.open, block.close);
            var dataEnd = children.length ? children[0].start : block.close;
            var values = numericValues(tokens, block.open + 1, dataEnd);
            if (values.length < 4) throw new Error('X Material is missing its diffuse RGBA colour');
            var material = defaultXMaterial();
            material.colour = [values[0], values[1], values[2], values[3]];
            if (values.length >= 11) {
                material.emissiveColor = [values[8], values[9], values[10]];
            }
            var textureName = null;
            var i = 0;
            while (i < children.length) {
                if (children[i].type.toLowerCase() === 'texturefilename') {
                    var j = children[i].open + 1;
                    while (j < children[i].close) {
                        if (tokens[j].type === 'string') {
                            textureName = decodeXString(tokens[j].value);
                            break;
                        }
                        j++;
                    }
                    if (textureName != null) break;
                }
                i++;
            }
            material.textureFilename = textureName;
            return material;
        }

        function parseXMaterialList(tokens, block, faceCount, namedMaterials) {
            var state = { index: block.open + 1 };
            var materialCount = takeTokenInteger(tokens, state, block.close, 'material count');
            var assignmentCount = takeTokenInteger(tokens, state, block.close, 'material-face index count');
            if (assignmentCount > faceCount) {
                throw new Error('X MeshMaterialList has more face assignments than mesh faces');
            }
            var assignments = [];
            var i = 0;
            while (i < assignmentCount) {
                assignments.push(takeTokenInteger(tokens, state, block.close, 'face material index'));
                i++;
            }

            var materials = [];
            while (state.index < block.close) {
                skipSeparators(tokens, state, block.close);
                if (state.index >= block.close) break;

                if (tokens[state.index].value === '{') {
                    var referenceClose = matchingBrace(tokens, state.index, block.close + 1);
                    var referenceName = null;
                    var refIndex = state.index + 1;
                    while (refIndex < referenceClose) {
                        if (tokens[refIndex].type === 'word' || tokens[refIndex].type === 'string') {
                            referenceName = tokens[refIndex].type === 'string'
                            ? decodeXString(tokens[refIndex].value) : tokens[refIndex].value;
                            break;
                        }
                        refIndex++;
                    }
                    var referencedMaterial = referenceName == null
                    ? null : namedMaterials.get(referenceName.toLowerCase());
                    if (!referencedMaterial) {
                        throw new Error('X MeshMaterialList references an unknown material: ' + referenceName);
                    }
                    materials.push(cloneXMaterial(referencedMaterial));
                    state.index = referenceClose + 1;
                    continue;
                }

                var child = findBlockAt(tokens, state.index, block.close + 1);
                if (child) {
                    if (child.type.toLowerCase() === 'material') {
                        var parsedMaterial = parseXMaterial(tokens, child);
                        if (child.name) namedMaterials.set(child.name.toLowerCase(), cloneXMaterial(parsedMaterial));
                        materials.push(parsedMaterial);
                    }
                    state.index = child.close + 1;
                } else {
                    state.index++;
                }
            }

            if (materials.length !== materialCount) {
                throw new Error('X MeshMaterialList declares ' + materialCount +
                ' materials but provides ' + materials.length);
            }
            if (materials.length === 0) materials.push(defaultXMaterial());
            if (assignments.length === 0) {
                assignments = [];
                i = 0;
                while (i < faceCount) { assignments.push(0); i++; }
            } else if (assignments.length === 1 && faceCount > 1 && materials.length === 1) {
                var single = assignments[0];
                assignments = [];
                i = 0;
                while (i < faceCount) { assignments.push(single); i++; }
            } else if (assignments.length !== faceCount) {
                throw new Error('X MeshMaterialList face assignment count does not match mesh faces');
            }

            return { materials: materials, assignments: assignments };
        }

        function readXMeshHeader(tokens, block) {
            var children = directChildBlocks(tokens, block.open, block.close);
            var dataEnd = children.length ? children[0].start : block.close;
            var values = numericValues(tokens, block.open + 1, dataEnd);
            var state = { index: 0 };
            var vertexCount = takeInteger(values, state, 'vertex count');
            if (vertexCount > 2000000) throw new Error('X mesh vertex count is unreasonably large');
            var vertices = [];
            var i = 0;
            while (i < vertexCount) {
                vertices.push([
                    takeFloat(values, state, 'vertex x'),
                              takeFloat(values, state, 'vertex y'),
                              takeFloat(values, state, 'vertex z')
                ]);
                i++;
            }
            var faceCount = takeInteger(values, state, 'face count');
            if (faceCount > 2000000) throw new Error('X mesh face count is unreasonably large');
            var faces = [];
            i = 0;
            while (i < faceCount) {
                var cornerCount = takeInteger(values, state, 'face vertex count');
                if (cornerCount < 3) throw new Error('X mesh face has fewer than 3 vertices');
                if (cornerCount > vertexCount) throw new Error('X mesh face vertex count exceeds mesh vertex count');
                var indices = [];
                var corner = 0;
                while (corner < cornerCount) {
                    var vertexIndex = takeInteger(values, state, 'face vertex index');
                    if (vertexIndex >= vertexCount) throw new Error('X face references a missing vertex: ' + vertexIndex);
                    indices.push(vertexIndex);
                    corner++;
                }
                faces.push({ indices: indices, materialIndex: 0 });
                i++;
            }
            if (state.index !== values.length) throw new Error('Unexpected numeric data in X Mesh header');
            return { vertices: vertices, faces: faces, children: children };
        }

        function parseXNormals(tokens, block, faceCount) {
            var values = numericValues(tokens, block.open + 1, block.close);
            var state = { index: 0 };
            var normalCount = takeInteger(values, state, 'normal count');
            var normals = [];
            var i = 0;
            while (i < normalCount) {
                normals.push([
                    takeFloat(values, state, 'normal x'),
                             takeFloat(values, state, 'normal y'),
                             takeFloat(values, state, 'normal z')
                ]);
                i++;
            }
            var normalFaceCount = takeInteger(values, state, 'normal face count');
            if (normalFaceCount !== faceCount) {
                throw new Error('X MeshNormals face count does not match mesh face count');
            }
            var faceNormals = [];
            i = 0;
            while (i < normalFaceCount) {
                var cornerCount = takeInteger(values, state, 'normal face vertex count');
                var indices = [];
                var corner = 0;
                while (corner < cornerCount) {
                    var normalIndex = takeInteger(values, state, 'normal face index');
                    if (normalIndex >= normalCount) throw new Error('X face references a missing normal: ' + normalIndex);
                    indices.push(normalIndex);
                    corner++;
                }
                faceNormals.push(indices);
                i++;
            }
            if (state.index !== values.length) throw new Error('Unexpected numeric data in X MeshNormals');
            return { normals: normals, faceNormals: faceNormals };
        }

        function parseXTextureCoords(tokens, block, vertexCount) {
            var values = numericValues(tokens, block.open + 1, block.close);
            var state = { index: 0 };
            var coordinateCount = takeInteger(values, state, 'texture coordinate count');
            if (coordinateCount > vertexCount) {
                throw new Error('X MeshTextureCoords contains more coordinates than vertices');
            }
            var coordinates = [];
            var i = 0;
            while (i < coordinateCount) {
                coordinates.push([
                    takeFloat(values, state, 'texture coordinate u'),
                                 takeFloat(values, state, 'texture coordinate v')
                ]);
                i++;
            }
            if (state.index !== values.length) throw new Error('Unexpected numeric data in X MeshTextureCoords');
            while (coordinates.length < vertexCount) coordinates.push([0, 0]);
            return coordinates;
        }

        function parseFrameMatrix(tokens, block) {
            var values = numericValues(tokens, block.open + 1, block.close);
            if (values.length !== 16) throw new Error('X FrameTransformMatrix must contain 16 numbers');
            return values;
        }

        function processXMesh(tokens, block, worldMatrix, namedMaterials, outputMeshes) {
            var parsed = readXMeshHeader(tokens, block);
            var vertices = parsed.vertices;
            var faces = parsed.faces;
            var children = parsed.children;
            var i = 0;
            while (i < vertices.length) {
                vertices[i] = transformXPoint(worldMatrix, vertices[i]);
                i++;
            }

            var determinant = determinantXLinear(worldMatrix);
            if (determinant < 0) {
                i = 0;
                while (i < faces.length) { faces[i].indices.reverse(); i++; }
            }

            var uvCoordinates = [];
            i = 0;
            while (i < vertices.length) { uvCoordinates.push([0, 0]); i++; }

            var normalData = null;
            var materialData = null;
            i = 0;
            while (i < children.length) {
                var type = children[i].type.toLowerCase();
                if (type === 'meshtexturecoords') {
                    uvCoordinates = parseXTextureCoords(tokens, children[i], vertices.length);
                } else if (type === 'meshnormals') {
                    normalData = parseXNormals(tokens, children[i], faces.length);
                } else if (type === 'meshmateriallist') {
                    materialData = parseXMaterialList(tokens, children[i], faces.length, namedMaterials);
                }
                i++;
            }

            if (!materialData) {
                materialData = { materials: [defaultXMaterial()], assignments: [] };
                i = 0;
                while (i < faces.length) { materialData.assignments.push(0); i++; }
            }
            i = 0;
            while (i < faces.length) {
                var materialIndex = materialData.assignments[i];
                if (materialIndex < 0 || materialIndex >= materialData.materials.length) {
                    throw new Error('X face references invalid material index: ' + materialIndex);
                }
                faces[i].materialIndex = materialIndex;
                i++;
            }

            var baseMesh = { vertices: vertices, faces: faces, vertexNormals: [] };
            i = 0;
            while (i < vertices.length) { baseMesh.vertexNormals.push([0, 0, 0]); i++; }
            var computedNormals = computeVertexNormals(baseMesh);
            var transformedExplicitNormals = null;
            if (normalData) {
                transformedExplicitNormals = [];
                i = 0;
                while (i < normalData.normals.length) {
                    transformedExplicitNormals.push(transformXNormal(worldMatrix, normalData.normals[i]));
                    i++;
                }
                i = 0;
                while (i < faces.length) {
                    if (normalData.faceNormals[i].length !== faces[i].indices.length) {
                        throw new Error('X MeshNormals corner count does not match its mesh face');
                    }
                    if (determinant < 0) normalData.faceNormals[i].reverse();
                    i++;
                }
            }

            // Expand vertices per face corner so X normal indices and UV seams are preserved.
            // The renderer's existing GPU mesh format has one normal and UV per vertex index.
            var expanded = {
                vertices: [], vertexNormals: [], uvs: [], faces: [],
                wrapMode: null, crossfade: false
            };
            var groups = new Map();
            var faceIndex = 0;
            while (faceIndex < faces.length) {
                var face = faces[faceIndex];
                var selectedMaterial = materialData.materials[face.materialIndex];
                var groupKey = String(face.materialIndex);
                if (!groups.has(groupKey)) {
                    groups.set(groupKey, {
                        material: cloneXMaterial(selectedMaterial),
                               doubleSided: false,
                               triangles: []
                    });
                }
                var group = groups.get(groupKey);
                var expandedFace = [];
                var cornerIndex = 0;
                while (cornerIndex < face.indices.length) {
                    var originalIndex = face.indices[cornerIndex];
                    var expandedIndex = expanded.vertices.length;
                    expandedFace.push(expandedIndex);
                    expanded.vertices.push(vertices[originalIndex].slice());
                    expanded.uvs.push(uvCoordinates[originalIndex].slice());
                    if (normalData) {
                        var explicitNormalIndex = normalData.faceNormals[faceIndex][cornerIndex];
                        expanded.vertexNormals.push(transformedExplicitNormals[explicitNormalIndex].slice());
                    } else {
                        expanded.vertexNormals.push(computedNormals[originalIndex].slice());
                    }
                    cornerIndex++;
                }
                var tri = 1;
                while (tri < expandedFace.length - 1) {
                    group.triangles.push([expandedFace[0], expandedFace[tri], expandedFace[tri + 1]]);
                    tri++;
                }
                faceIndex++;
            }

            var groupIterator = groups.values();
            var nextGroup = groupIterator.next();
            while (!nextGroup.done) {
                var materialGroup = nextGroup.value;
                if (materialGroup.triangles.length) {
                    var dayTexture = null;
                    if (materialGroup.material.textureFilename) {
                        dayTexture = resolveTextureGpu(materialGroup.material.textureFilename, objectPath);
                    }
                    var gpuMesh = makeGpuMeshForMaterial(
                        expanded, materialGroup, expanded.vertexNormals, dayTexture, null
                    );
                    try {
                        uploadGpuMesh(gpuMesh);
                        outputMeshes.push(gpuMesh);
                    } catch (uploadError) {
                        deleteGpuObject({ meshes: [gpuMesh] });
                        throw uploadError;
                    }
                }
                nextGroup = groupIterator.next();
            }
        }

        var tokens = tokenizeX(sourceText);
        var namedMaterials = new Map();
        var i = 0;
        while (i < tokens.length) {
            if (tokens[i].type === 'word' && tokens[i].value.toLowerCase() === 'material') {
                var materialBlock = findBlockAt(tokens, i, tokens.length);
                if (materialBlock) {
                    var parsedMaterial = parseXMaterial(tokens, materialBlock);
                    if (materialBlock.name) namedMaterials.set(materialBlock.name.toLowerCase(), cloneXMaterial(parsedMaterial));
                }
            }
            i++;
        }

        function processXFrame(block, parentMatrix, outputMeshes) {
            var children = directChildBlocks(tokens, block.open, block.close);
            var localMatrix = identityMatrix();
            var i = 0;
            while (i < children.length) {
                if (children[i].type.toLowerCase() === 'frametransformmatrix') {
                    localMatrix = parseFrameMatrix(tokens, children[i]);
                    break;
                }
                i++;
            }
            var worldMatrix = multiplyMatrix(localMatrix, parentMatrix);
            i = 0;
            while (i < children.length) {
                var childType = children[i].type.toLowerCase();
                if (childType === 'frame' || childType === 'frameroot') {
                    processXFrame(children[i], worldMatrix, outputMeshes);
                } else if (childType === 'mesh') {
                    processXMesh(tokens, children[i], worldMatrix, namedMaterials, outputMeshes);
                }
                i++;
            }
        }

        i = 0;
        while (i < tokens.length) {
            if (tokens[i].type === 'word') {
                var type = tokens[i].value.toLowerCase();
                var block = findBlockAt(tokens, i, tokens.length);
                if (block) {
                    if (type === 'frame' || type === 'frameroot') {
                        processXFrame(block, identityMatrix(), outputGpuMeshes);
                    } else if (type === 'mesh') {
                        processXMesh(tokens, block, identityMatrix(), namedMaterials, outputGpuMeshes);
                    }
                    i = block.close + 1;
                    continue;
                }
            }
            i++;
        }

        if (outputGpuMeshes.length === 0) {
            throw new Error('X file contains no renderable Mesh geometry');
        }
    }






    for (var objectIndex = 0; objectIndex < route_objects.length; objectIndex++) {
        var entry = route_objects[objectIndex];
        if (!entry) continue;
        var objectFormat = String(entry[1]).toLowerCase();
        if (objectFormat !== 'csv' && objectFormat !== 'x') continue;

        deleteGpuObject(entry[4]);
        entry[3] = false;
        entry[4] = null;

        var gpuMeshes = [];

        var failedLineNumber = null;
        var failedSourceLine = null;

        try {
            if (typeof entry[2] !== 'string') {
                throw new Error('Object text is missing or is not a string');
            }








            if (objectFormat === 'x') {
                loadXObject(entry[2], entry[0], gpuMeshes);
                entry[4] = { meshes: gpuMeshes };
                entry[3] = true;
                continue;
            }
            var lines = entry[2].replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
            var meshBuilders = [];
            var mesh = null;
            var lineNumber = 0;

            function startMesh() {
                mesh = {
                    vertices: [],
                    vertexNormals: [],
                    faces: [],
                    uvs: [],
                    textureNames: null,
                    wrapMode: null,
                    crossfade: false,
                    currentBlendMode: 'normal',
                    currentGlowHalfDistance: 0,
                    currentGlowAttenuationMode: 'divideexponent4'
                };
                meshBuilders.push(mesh);
            }

            function finishMesh() {
                mesh = null;
            }

            function requireMesh(command) {
                if (!mesh) throw new Error(command + ' must follow CreateMeshBuilder');
                return mesh;
            }

            function transformTargets(all) {
                if (all) return meshBuilders;
                return mesh ? [mesh] : [];
            }

            function applyToExistingFaces(targets, callback) {
                for (var target of targets) {
                    for (var face of target.faces) callback(face.material);
                }
            }

            function addVertex(args) {
                var current = requireMesh('AddVertex');
                var values = parseNumbers(args, 6, [0, 0, 0, 0, 0, 0], 'AddVertex');
                current.vertices.push(values.slice(0, 3));
                current.vertexNormals.push(values.slice(3, 6));
                current.uvs.push(null);
            }

            function parseFaceIndices(args, command) {
                var face = [];
                for (var value of args) {
                    if (value == null || String(value).trim() === '') continue;
                    var n = Number(String(value).trim());
                    if (!Number.isInteger(n) || n < 0) {
                        throw new Error(command + ' has invalid vertex index: ' + value);
                    }
                    face.push(n);
                }
                if (face.length < 3) throw new Error(command + ' requires at least 3 vertex indices');
                return face;
            }

            function addFace(args, command) {
                var current = requireMesh(command);
                var indices = parseFaceIndices(args, command);
                addFaceToMesh(current, indices, command === 'addface2');
            }

            function mutateFaceMaterial(targets, property, value) {
                applyToExistingFaces(targets, function (material) {
                    material[property] = Array.isArray(value) ? value.slice() : value;
                });
            }

            function setBlendMode(args) {
                var current = requireMesh('SetBlendMode');
                var mode = (args[0] || 'normal').trim().toLowerCase();
                if (!mode) mode = 'normal';
                if (mode !== 'normal' && mode !== 'additive') {
                    throw new Error('SetBlendMode must be Normal or Additive');
                }
                var halfDistance = parseNumber(args[1], 0, 'GlowHalfDistance');
                if (!Number.isInteger(halfDistance) || halfDistance < 0 || halfDistance > 4095) {
                    throw new Error('GlowHalfDistance must be an integer from 0 to 4095');
                }
                var attenuation = (args[2] || 'DivideExponent4').trim().toLowerCase();
                if (!attenuation) attenuation = 'divideexponent4';
                if (attenuation !== 'divideexponent2' && attenuation !== 'divideexponent4') {
                    throw new Error('GlowAttenuationMode must be DivideExponent2 or DivideExponent4');
                }
                current.currentBlendMode = mode;
                current.currentGlowHalfDistance = halfDistance;
                current.currentGlowAttenuationMode = attenuation;
                applyToExistingFaces([current], function (material) {
                    material.blendMode = mode;
                    material.glowHalfDistance = halfDistance;
                    material.glowAttenuationMode = attenuation;
                });
            }

            for (lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                failedLineNumber = lineNumber + 1;
                failedSourceLine = lines[lineNumber];

                var line = failedSourceLine.trim();
                if (!line || line.startsWith(';')) continue;
                var commentIndex = line.indexOf(';');
                if (commentIndex >= 0) line = line.slice(0, commentIndex).trim();
                if (!line) continue;








                var fields = line.split(',');

                // Ignore completely empty CSV records, including ",,,,"
                // These are used as separators between mesh definitions.
                if (
                    fields.every(function (field) {
                        return String(field ?? '').trim() === '';
                    })
                ) {
                    continue;
                }

                var command = String(fields[0] || '').trim().toLowerCase();
                var args = fields.slice(1);

                try {
                    if (command === 'createmeshbuilder' || command === '[meshbuilder]') {
                        finishMesh();
                        startMesh();
                        continue;
                    }

                    // Metadata and route-specific lines outside a mesh builder are ignored,
                    // matching the tolerant behavior of the original loader.
                    // Metadata and route-specific lines outside a mesh builder are ignored.
                    if (!mesh) continue;

                    // A CSV object command must have a non-empty name.
                    if (!command) {
                        throw new Error(
                            'Empty CSV object command name. ' +
                            'The first field before the comma is empty.'
                        );
                    }

                    switch (command) {
                        case 'addvertex':
                        case 'vertex':
                            addVertex(args);
                            break;

                        case 'addface':
                        case 'face':
                        case 'addface2':
                            addFace(args, command === 'face' ? 'addface' : command);
                            break;

                        case 'cube': {
                            var cubeArgs = parseNumbers(args, 3, [0, 0, 0], 'Cube');
                            createCube(mesh, cubeArgs[0], cubeArgs[1], cubeArgs[2]);
                            break;
                        }

                        case 'cylinder': {
                            var cylinderArgs = parseNumbers(args, 4, [0, 0, 0, 0], 'Cylinder');
                            addCylinder(
                                mesh, cylinderArgs[0], cylinderArgs[1],
                                cylinderArgs[2], cylinderArgs[3]
                            );
                            break;
                        }

                        case 'translate':
                        case 'translateall': {
                            var translation = parseNumbers(args, 3, [0, 0, 0], command);
                            for (var target of transformTargets(command === 'translateall')) {
                                translateMesh(target, translation[0], translation[1], translation[2]);
                            }
                            break;
                        }

                        case 'scale':
                        case 'scaleall': {
                            var scale = parseNumbers(args, 3, [1, 1, 1], command);
                            if (scale.some(value => value === 0)) {
                                throw new Error('Scale factors must be non-zero');
                            }
                            var scaleMatrix = [scale[0], 0, 0, 0, scale[1], 0, 0, 0, scale[2]];
                            for (var target of transformTargets(command === 'scaleall')) {
                                transformMeshLinear(target, scaleMatrix);
                            }
                            break;
                        }

                        case 'rotate':
                        case 'rotateall': {
                            var rotation = parseNumbers(args, 4, [0, 0, 0, 0], command);
                            var rotationTransform = rotationMatrix(
                                rotation[0], rotation[1], rotation[2], rotation[3]
                            );
                            for (var target of transformTargets(command === 'rotateall')) {
                                transformMeshLinear(target, rotationTransform);
                            }
                            break;
                        }

                        case 'shear':
                        case 'shearall': {
                            var shear = parseNumbers(args, 7, [0, 0, 0, 0, 0, 0, 0], command);
                            var shearTransform = shearMatrix(
                                shear[0], shear[1], shear[2],
                                shear[3], shear[4], shear[5], shear[6]
                            );
                            for (var target of transformTargets(command === 'shearall')) {
                                transformMeshLinear(target, shearTransform);
                            }
                            break;
                        }

                        case 'mirror':
                        case 'mirrorall': {
                            var mirror = parseNumbers(args, 3, [0, 0, 0], command);
                            var mirrorTransform = [
                                mirror[0] !== 0 ? -1 : 1, 0, 0,
                                0, mirror[1] !== 0 ? -1 : 1, 0,
                                0, 0, mirror[2] !== 0 ? -1 : 1
                            ];
                            for (var target of transformTargets(command === 'mirrorall')) {
                                transformMeshLinear(target, mirrorTransform);
                            }
                            break;
                        }

                        case 'generatenormals':
                            // OpenBVE ignores this command. Automatic vertex normals are
                            // generated for zero normals at upload time regardless.
                            break;

                        case 'settexturecoordinates':
                        case 'coordinates': {
                            var coordinate = parseNumbers(args, 3, [0, 0, 0], command);
                            var vertexIndex = coordinate[0];
                            if (!Number.isInteger(vertexIndex) || vertexIndex < 0 ||
                                vertexIndex >= mesh.vertices.length) {
                                throw new Error('SetTextureCoordinates vertex index out of range: ' + vertexIndex);
                                }
                                mesh.uvs[vertexIndex] = [coordinate[1], coordinate[2]];
                            break;
                        }

                        case 'loadtexture': {
                            if (!args.length || String(args[0]).trim() === '') {
                                throw new Error('LoadTexture requires a daytime texture filename or index');
                            }
                            var daytime = String(args[0]).trim();
                            var nighttime = args[1] == null || String(args[1]).trim() === ''
                            ? null : String(args[1]).trim();
                            if (nighttime && !daytime) {
                                throw new Error('LoadTexture nighttime texture requires a daytime texture');
                            }
                            mesh.textureNames = { day: daytime, night: nighttime };
                            break;
                        }

                        case 'setcolor': {
                            var colour = colourArguments(args, 255);
                            mutateFaceMaterial([mesh], 'colour', colour);
                            break;
                        }

                        case 'setcolorall': {
                            var allColour = colourArguments(args, 255);
                            mutateFaceMaterial(meshBuilders, 'colour', allColour);
                            break;
                        }

                        case 'setemissivecolor': {
                            var emissive = emissiveArguments(args);
                            mutateFaceMaterial([mesh], 'emissiveColor', emissive);
                            break;
                        }

                        case 'setemissivecolorall': {
                            var allEmissive = emissiveArguments(args);
                            mutateFaceMaterial(meshBuilders, 'emissiveColor', allEmissive);
                            break;
                        }

                        case 'setdecaltransparentcolor': {
                            var transparent = transparentArguments(args);
                            mutateFaceMaterial([mesh], 'transparentColor', transparent);
                            break;
                        }

                        case 'setblendmode':
                            setBlendMode(args);
                            break;

                        case 'setwrapmode': {
                            var wrap = (args[0] || '').trim().toLowerCase();
                            var allowedWrapModes = [
                                'clampclamp', 'clamprepeat', 'repeatclamp', 'repeatrepeat'
                            ];
                            if (wrap && !allowedWrapModes.includes(wrap)) {
                                throw new Error('Invalid SetWrapMode: ' + args[0]);
                            }
                            mesh.wrapMode = wrap || null;
                            break;
                        }

                        case 'enablecrossfading': {
                            var crossfadeValue = (args[0] || 'false').trim().toLowerCase();
                            if (!['true', 'false', '1', '0'].includes(crossfadeValue)) {
                                throw new Error('EnableCrossfading requires true or false');
                            }
                            mesh.crossfade = crossfadeValue === 'true' || crossfadeValue === '1';
                            break;
                        }

                        default:
                            // A CSV object can contain commands added by newer simulator
                            // versions. Don't silently drop a likely geometry command.
                            // Unknown commands are recorded as line-specific errors so a
                            // partially parsed model is never marked as fully loaded.
                            throw new Error('Unsupported CSV object command: ' + fields[0].trim());
                    }
                } catch (commandError) {
                    throw new Error(
                        (entry[0] || 'CSV object') + ':' + (lineNumber + 1) + ': ' +
                        commandError.message +
                        '\nFailing source line: ' +
                        JSON.stringify(failedSourceLine)
                    );
                }
            }
            failedLineNumber = null;
            failedSourceLine = null;
            finishMesh();

            for (var sourceMesh of meshBuilders) {
                if (sourceMesh.vertices.length === 0 || sourceMesh.faces.length === 0) continue;

                var textureDay = null;
                var textureNight = null;
                if (sourceMesh.textureNames) {
                    textureDay = resolveTextureGpu(sourceMesh.textureNames.day, entry[0]);
                    if (sourceMesh.textureNames.night) {
                        textureNight = resolveTextureGpu(sourceMesh.textureNames.night, entry[0]);
                    }
                }

                var vertexNormals = computeVertexNormals(sourceMesh);
                var materialGroups = new Map();

                for (var face of sourceMesh.faces) {
                    for (var vertexIndex of face.indices) {
                        if (vertexIndex < 0 || vertexIndex >= sourceMesh.vertices.length) {
                            throw new Error('Face references missing vertex ' + vertexIndex);
                        }
                    }
                    var key = materialKey(face.material, face.doubleSided);
                    if (!materialGroups.has(key)) {
                        materialGroups.set(key, {
                            material: cloneFaceMaterial(face.material),
                                           doubleSided: face.doubleSided,
                                           triangles: []
                        });
                    }
                    var group = materialGroups.get(key);
                    for (var triIndex = 1; triIndex < face.indices.length - 1; triIndex++) {
                        group.triangles.push([
                            face.indices[0], face.indices[triIndex], face.indices[triIndex + 1]
                        ]);
                    }
                }

                for (var materialGroup of materialGroups.values()) {
                    if (!materialGroup.triangles.length) continue;
                    var gpuMesh = makeGpuMeshForMaterial(
                        sourceMesh, materialGroup, vertexNormals, textureDay, textureNight
                    );
                    try {
                        uploadGpuMesh(gpuMesh);
                        gpuMeshes.push(gpuMesh);
                    } catch (uploadError) {
                        deleteGpuObject({ meshes: [gpuMesh] });
                        throw uploadError;
                    }
                }
            }

            if (gpuMeshes.length === 0) {
                throw new Error(
                    'No renderable meshes were created. Check CreateMeshBuilder, AddVertex, ' +
                    'AddFace / AddFace2, and the object command syntax.'
                );
            }

            entry[4] = { meshes: gpuMeshes };
            entry[3] = true;
        } catch (error) {
            deleteGpuObject({ meshes: gpuMeshes });

            entry[3] = false;
            entry[4] = null;

            var errorMessage =
            error && error.message
            ? error.message
            : String(error);

            route_object_errors.push({
                name: entry[0],
                error: errorMessage
            });

            console.groupCollapsed(
                '[Object GPU load failed] ' + entry[0]
            );

            console.error('Error:', errorMessage);

            if (failedLineNumber !== null) {
                console.error(
                    'Failing line number:',
                    failedLineNumber
                );

                console.error(
                    'Failing source line:',
                    failedSourceLine
                );
            }

            console.log(
                'Object format:',
                objectFormat
            );

            console.log(
                'Full object source contents:\n' +
                String(entry[2] ?? '')
            );

            console.groupEnd();
        }
    }
}















// ============================================================
// MAIN FUNCTION: LOAD AND PROCESS THE COMBINED ROUTE
// ============================================================
var route_zip = null;

// Cache extracted ZIPs by their original URL.
var route_zip_cache = new Map();

// Record ZIPs downloaded during this page session.
var route_zip_downloaded = [];


// ============================================================
// SHARED ZIP LOADER
//
// Used by:
//   1. Normal route ZIPs
//   2. Route audio ZIPs
//   3. Story audio ZIPs
//
// Uses the existing route_zip_cache and route_zip_downloaded.
// Does not modify the global route_zip variable.
// ============================================================

async function getCachedExtractedZip(url, validateZip) {

    // The original URL is always the cache key.
    // Never include the anti-cache query value.
    var cacheKey = url;

    // Look in the existing downloaded ZIP array.
    var downloadedEntry = route_zip_downloaded.find(
        function (entry) {
            return entry.url === cacheKey;
        }
    );

    // Look in both existing caches.
    var extractedZip = downloadedEntry
    ? downloadedEntry.files
    : (route_zip_cache.get(cacheKey) || null);


    // --------------------------------------------------------
    // ZIP ALREADY EXISTS
    // --------------------------------------------------------

    if (extractedZip) {

        // Validate even when using a cached ZIP.
        if (typeof validateZip === "function") {
            validateZip(extractedZip);
        }

        // Keep both existing caches synchronised.
        if (!downloadedEntry) {
            route_zip_downloaded.push({
                url: cacheKey,
                files: extractedZip
            });
        }

        route_zip_cache.set(cacheKey, extractedZip);

        return extractedZip;
    }


    // --------------------------------------------------------
    // ZIP DOES NOT EXIST: DOWNLOAD IT
    // --------------------------------------------------------

    var downloadUrl = new URL(
        url,
        window.location.href
    );

    downloadUrl.searchParams.set(
        "t",
        String(Date.now()) +
        String(Math.floor(Math.random() * 1000000000))
    );

    var response = await fetch(
        downloadUrl.toString(),
                               {
                                   cache: "no-store"
                               }
    );

    if (!response.ok) {
        throw new Error(
            response.status + " " + response.statusText
        );
    }

    var buffer = await response.arrayBuffer();

    try {

        extractedZip = fflate.unzipSync(
            new Uint8Array(buffer)
        );

    } catch (error) {

        throw new Error(
            "Failed to extract ZIP file: " +
            (error.message || String(error))
        );

    } finally {

        buffer = null;
    }


    // --------------------------------------------------------
    // VALIDATE BEFORE CACHING
    //
    // This preserves your original behaviour:
    // invalid ZIPs are not added to the cache.
    // --------------------------------------------------------

    if (typeof validateZip === "function") {
        validateZip(extractedZip);
    }


    // --------------------------------------------------------
    // SAVE IN THE EXISTING CACHES
    // --------------------------------------------------------

    route_zip_downloaded.push({
        url: cacheKey,
        files: extractedZip
    });

    route_zip_cache.set(
        cacheKey,
        extractedZip
    );

    return extractedZip;
}

// ============================================================
// ROUTE AUDIO DATABASE
//
// Shared by every route and every story.
//
// Database structure:
//
// route_audio_database
//     |
//     +-- "story/0.zip"
//             |
//             +-- files[0]
//             |       bytes
//             |       player
//             |       objectUrl
//             |       requested
//             |
//             +-- files[1]
//             |
//             +-- files[2]
//
// The database remains loaded when a route is unloaded.
// ============================================================

var route_audio_database = new Map();


// Audio belonging to the currently active route or story.
//
// This is a reference to an entry in route_audio_database.
// It does not duplicate the audio data.

var current_route_audio = null;


// ============================================================
// CLEAR CURRENT ROUTE AUDIO
//
// Stops playback and disconnects the current route from
// its audio database entry.
//
// Does NOT delete anything from route_audio_database.
// ============================================================

function clearCurrentRouteAudio() {

    stopRouteAudio();

    current_route_audio = null;
}


// ============================================================
// LOAD AUDIO FOR A ROUTE OR STORY
//
// Both routes and stories use the same configuration:
//
// storyFileName: "0.zip"
// numberOfOpus: 3
//
// Loads:
//     story/0.zip
//
// Extracts:
//     0.opus
//     1.opus
//     2.opus
// ============================================================

async function loadRouteAudio(routeData) {

    // Stop any audio belonging to the previous route.
    clearCurrentRouteAudio();

    if (!routeData) return;


    // --------------------------------------------------------
    // CHECK WHETHER THIS ROUTE HAS AUDIO
    // --------------------------------------------------------

    var countValue = routeData.numberOfOpus;

    // Missing numberOfOpus means no audio ZIP is required.
    if (
        countValue === undefined ||
        countValue === null ||
        countValue === ""
    ) {
        return;
    }

    var numberOfOpus = Number(countValue);

    if (
        !Number.isSafeInteger(numberOfOpus) ||
        numberOfOpus < 0
    ) {
        throw new Error(
            "Invalid numberOfOpus on route: " +
            (routeData.name || routeData.fileName || "Unnamed route")
        );
    }

    // Zero files means there is nothing to load.
    if (numberOfOpus === 0) {
        return;
    }


    // --------------------------------------------------------
    // GET THE AUDIO ZIP FILENAME
    // --------------------------------------------------------

    if (
        typeof routeData.storyFileName !== "string" ||
        !routeData.storyFileName.trim()
    ) {
        throw new Error(
            "numberOfOpus is defined, but storyFileName is missing."
        );
    }

    // Accept either "0.zip" or "story/0.zip".
    // The actual URL will always start with story/.
    var storyFileName = routeData.storyFileName
    .trim()
    .replace(/^\/+/, "")
    .replace(/^story\//i, "");

    var audioZipUrl = "story/" + storyFileName;


    // --------------------------------------------------------
    // GET THE ZIP USING THE EXISTING ZIP CACHE
    // --------------------------------------------------------

    var zipFiles = await getCachedExtractedZip(
        audioZipUrl,

        // Validate every requested Opus file before the ZIP
        // is accepted into the existing ZIP caches.
        function (extractedZip) {

            for (
                var i = 0;
            i < numberOfOpus;
            i++
            ) {

                var fileName = i + ".opus";

                if (
                    !Object.prototype.hasOwnProperty.call(
                        extractedZip,
                        fileName
                    )
                ) {
                    throw new Error(
                        "Audio ZIP is missing " +
                        fileName +
                        " (" + audioZipUrl + ")"
                    );
                }
            }
        }
    );


    // --------------------------------------------------------
    // GET OR CREATE THE AUDIO DATABASE ENTRY
    // --------------------------------------------------------

    var databaseRecord =
    route_audio_database.get(audioZipUrl);

    if (!databaseRecord) {

        databaseRecord = {
            files: []
        };

        route_audio_database.set(
            audioZipUrl,
            databaseRecord
        );
    }


    // --------------------------------------------------------
    // ADD THE AUDIO FILES TO THE DATABASE
    //
    // The Uint8Array references come directly from the
    // existing extracted ZIP. No second ZIP extraction occurs.
    //
    // Audio players and Blob URLs are created only when
    // an audio file is first played.
    // --------------------------------------------------------

    for (
        var i = 0;
    i < numberOfOpus;
    i++
    ) {

        // Do not create an entry twice.
        if (databaseRecord.files[i]) {
            continue;
        }

        var fileName = i + ".opus";

        databaseRecord.files[i] = {

            // Original extracted audio data.
            bytes: zipFiles[fileName],

            // Created when first played.
            objectUrl: null,

            // Created when first played.
            player: null,

            // Prevents repeated calls from onEveryFrame().
            requested: false
        };
    }


    // --------------------------------------------------------
    // MAKE THIS DATABASE ENTRY THE CURRENT ROUTE'S AUDIO
    // --------------------------------------------------------

    current_route_audio = {
        zipUrl: audioZipUrl,
        files: databaseRecord.files,
        count: numberOfOpus
    };
}


// ============================================================
// PLAY ROUTE AUDIO
//
// opusIndex is zero-based.
//
// playRouteAudio(0) plays 0.opus.
// playRouteAudio(1) plays 1.opus.
//
// Optional second argument:
// true  = loop the audio
// false = play once
// ============================================================

function playRouteAudio(opusIndex, loop) {

    if (!current_route_audio) {
        return Promise.resolve(false);
    }

    var index = Number(opusIndex);

    if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= current_route_audio.count
    ) {
        console.warn(
            "Route audio index is out of range:",
            opusIndex
        );

        return Promise.resolve(false);
    }

    var entry = current_route_audio.files[index];

    if (!entry) {
        return Promise.resolve(false);
    }


    // --------------------------------------------------------
    // PREVENT REPEATED PLAYBACK REQUESTS
    //
    // This is particularly important when this function is
    // called from onEveryFrame().
    //
    // The requested flag remains true after the clip ends.
    // The clip therefore cannot restart on the next frame.
    //
    // Calling stopRouteAudio() resets this flag.
    // --------------------------------------------------------

    if (entry.requested) {
        return Promise.resolve(false);
    }

    entry.requested = true;


    // --------------------------------------------------------
    // CREATE THE AUDIO PLAYER ON FIRST USE
    // --------------------------------------------------------

    try {

        if (!entry.player) {

            var blob = new Blob(
                [entry.bytes],
                {
                    type: 'audio/ogg; codecs="opus"'
                }
            );

            entry.objectUrl = URL.createObjectURL(blob);

            entry.player = new Audio(
                entry.objectUrl
            );

            entry.player.preload = "auto";

            entry.player.load();
        }


        // ----------------------------------------------------
        // START PLAYBACK
        // ----------------------------------------------------

        entry.player.loop = loop === true;

        try {
            entry.player.currentTime = 0;
        } catch (error) {
            // Metadata may not have loaded yet.
        }

        var playResult = entry.player.play();

        // Modern browsers return a Promise from play().
        if (
            playResult &&
            typeof playResult.then === "function"
        ) {

            return playResult.then(
                function () {
                    return true;
                }
            ).catch(
                function (error) {

                    console.error(
                        "Could not play route audio " +
                        index + ":",
                        error
                    );

                    // Keep the request latched so that an
                    // every-frame callback does not repeatedly
                    // attempt a blocked playback.
                    return false;
                }
            );
        }

        return Promise.resolve(true);

    } catch (error) {

        console.error(
            "Could not start route audio " +
            index + ":",
            error
        );

        return Promise.resolve(false);
    }
}


// ============================================================
// STOP ROUTE AUDIO
//
// stopRouteAudio(0) stops 0.opus.
//
// stopRouteAudio() stops all audio belonging to the
// currently active route or story.
// ============================================================

function stopRouteAudio(opusIndex) {

    if (!current_route_audio) return;


    function stopEntry(entry) {

        if (!entry) return;

        // Allow this audio to be played again later.
        entry.requested = false;

        if (!entry.player) return;

        entry.player.pause();

        try {
            entry.player.currentTime = 0;
        } catch (error) {
            // The audio metadata may not have loaded yet.
        }
    }


    // Stop every audio file belonging to this route.
    if (
        opusIndex === undefined ||
        opusIndex === null
    ) {

        for (
            var i = 0;
        i < current_route_audio.count;
        i++
        ) {
            stopEntry(current_route_audio.files[i]);
        }

        return;
    }


    // Stop only the requested audio file.
    var index = Number(opusIndex);

    if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= current_route_audio.count
    ) {
        return;
    }

    stopEntry(
        current_route_audio.files[index]
    );
}

async function loadRoute(url) {

        // --------------------------------------------------------
        // STAGE 1: GET ROUTE ZIP FROM THE SHARED ZIP LOADER
        // --------------------------------------------------------

        await setStatus("Loading...");

        route_zip = await getCachedExtractedZip(
            url,

            // Normal route ZIPs must contain a.txt.
            function (extractedZip) {

                if (
                    !Object.prototype.hasOwnProperty.call(
                        extractedZip,
                        "a.txt"
                    )
                ) {
                    throw new Error(
                        "ZIP file does not contain a.txt"
                    );
                }
            }
        );

        // --------------------------------------------------------
        // STAGE 2 CONTINUES BELOW
        // Decode a.txt, preserving the existing encoding fallback.
        // --------------------------------------------------------







    // Decode a.txt, preserving the existing encoding fallback.
    try {
        temp_file = new TextDecoder('utf-8', {
            fatal: true
        }).decode(route_zip['a.txt']);
    } catch (error) {
        temp_file = new TextDecoder('shift-jis')
        .decode(route_zip['a.txt']);
    }

    // --------------------------------------------------------
    // STAGE 2: POPULATE ARRAYS AND EXTRACT THE BVE ROUTE
    //
    // No texture downloads or GPU uploads occur here.
    // --------------------------------------------------------

    route_textures = [];
    route_objects = [];
    route_texture_errors = [];
    object_linup = [];

    var lines = temp_file.split(/\r\n|\n|\r/);
    var section = 'textures';
    var current_object = null;
    var route_lines = [];
    var found_route_marker = false;

    function unminifyObjectLine(line) {
        var indentation = line.match(/^\s*/)[0];
        var content = line.slice(indentation.length);
        var match = content.match(/^([a-z])(?=\s*(?:,|$))/i);

        if (!match) return line;

        var shortCommand = match[1].toLowerCase();

        for (
            var filterIndex = 0;
        filterIndex < OBJECT_LINE_FILTERS.length;
        filterIndex++
        ) {
            if (
                OBJECT_LINE_FILTERS[filterIndex][1] === shortCommand
            ) {
                return indentation +
                OBJECT_LINE_FILTERS[filterIndex][0] +
                content.slice(1);
            }
        }

        return line;
    }

    function finishObject() {
        if (current_object === null) return;

        route_objects.push([
            current_object.name,              // [0] Object name/path
            current_object.type,              // [1] "csv" or "x"
            current_object.content.join('\n'), // [2] Object text
                           false,                             // [3] GPU loaded
                           null                               // [4] GPU object
        ]);

        current_object = null;
    }

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        var marker = line.match(
            /^\s*@@@([cxZ])(?:\s+(.*?))?\s*$/
        );

        if (marker) {
            var marker_type = marker[1];

            if (marker_type === 'Z') {
                finishObject();
                section = 'route';
                found_route_marker = true;
                continue;
            }

            finishObject();
            section = 'objects';

            current_object = {
                name: marker[2] || '',
                type: marker_type === 'c' ? 'csv' : 'x',
                content: []
            };

            continue;
        }

        if (section === 'textures') {
            var texture_match = line.match(
                /^\s*(\d+)\.([^.\/\\]+(?:\.[^.\/\\]+)*)\s*$/
            );

            if (texture_match) {
                var texture_name =
                texture_match[1] + '.' + texture_match[2];

                var texture_id =
                texture_name.replace(/\.[^.]+$/, '');

                route_textures.push([
                    texture_id,  // [0] Texture ID
                    texture_name, // [1] Full filename
                    false,        // [2] GPU loaded
                    null,         // [3] GPU texture
                    false,        // [4] Loading state
                    null          // [5] Additional texture data
                ]);
            }
        } else if (section === 'objects') {
            if (current_object !== null) {
                current_object.content.push(
                    unminifyObjectLine(line)
                );
            }
        } else if (section === 'route') {
            route_lines.push(line);
        }
    }

    finishObject();

    if (!found_route_marker) {
        throw new Error(
            'Combined file is missing @@@Z'
        );
    }

    // Keep the BVE route separately for Stage 6.
    var txt = route_lines.join('\n');

    // --------------------------------------------------------
    // STAGE 3: RELEASE THE COMBINED FILE
    // --------------------------------------------------------

    temp_file = null;
    buffer = null;
    lines = null;
    route_lines = null;
    current_object = null;

    // --------------------------------------------------------
    // STAGE 4: LOAD ALL TEXTURES, ONE AT A TIME
    // --------------------------------------------------------

    await setStatus("Loading textures...");
    await loadAllRouteTextures();

    // --------------------------------------------------------
    // STAGE 5: LOAD OBJECTS INTO THE GPU
    // --------------------------------------------------------

    await setStatus("Loading objects...");
    await loadAllRouteObjects();

    // --------------------------------------------------------
    // STAGE 6: PROCESS THE EXTRACTED BVE ROUTE TEXT
    // No second download is performed.
    // --------------------------------------------------------

    var parsedEvents = parseEvents(txt);
console.log(parsedEvents)




var a2d_map_of_track = buildTrackPositionDatabase(parsedEvents);
console.log(a2d_map_of_track);



    await setStatus("Loading route...");

    var builtRoute = buildGeometry(parsedEvents);

    // Save the processed gameplay data on the existing route object.
    // buildGeometry itself does not need to be changed.
    builtRoute.stations = parsedEvents.stations;
    builtRoute.speedLimits = parsedEvents.speedLimits;
    builtRoute.cracks = parsedEvents.filter(e => e.type === 'crack');
    return builtRoute;
}





function buildTrackSwitchDatabase(
    events,
    routeEndDistance,
    routePositions,
    mainRailTypeEvents
) {

    var EPS = 1e-7;
    var SWITCH_SEPARATION = 1;

    var xLimit = Math.max(0, Number(xswitchtrigger) || 0);
    var yLimit = Math.max(0, Number(yswitchtrigger) || 0);

    var sourceEvents = Array.isArray(events) ? events : [];
    var mainTypes = Array.isArray(mainRailTypeEvents)
    ? mainRailTypeEvents
    : [];

    // ------------------------------------------------------------
    // ACTUAL BVE ROUTE POSITIONS
    // ------------------------------------------------------------

    var positionSource = Array.isArray(routePositions)
    ? routePositions
    : sourceEvents.map(e => e.distance);

    var routeBounds = positionSource
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

    var routeStart = routeBounds.length
    ? routeBounds[0]
    : 0;

    var routeEnd = Number(routeEndDistance);

    if (!Number.isFinite(routeEnd)) {
        routeEnd = routeBounds.length
        ? routeBounds[routeBounds.length - 1]
        : routeStart;
    }

    routeEnd = Math.max(routeStart, routeEnd);
    var switchMaxDistance = routeEnd + 2000;

    var blockLength = getConfiguredBlockLength();
    var switchControlPositions = new Set(routeBounds);

    for (var event of sourceEvents) {

        if (
            (event.type === 'rail' || event.type === 'railend') &&
            Number.isFinite(Number(event.distance))
        ) {
            switchControlPositions.add(Number(event.distance));
        }
    }

    var firstSwitchBlock =
    Math.ceil((routeStart - EPS) / blockLength) * blockLength;

    for (
        var blockDistance = firstSwitchBlock;
    blockDistance <= routeEnd + EPS;
    blockDistance += blockLength
    ) {
        switchControlPositions.add(blockDistance);
    }

    var positionList = Array.from(switchControlPositions)
    .sort((a, b) => a - b);


    // ------------------------------------------------------------
    // GROUP RAIL EVENTS BY RAIL NUMBER
    // ------------------------------------------------------------

    var byRail = new Map();

    for (var i = 0; i < sourceEvents.length; i++) {

        var event = sourceEvents[i];

        if (
            event.type !== 'rail' &&
            event.type !== 'railend' &&
            event.type !== 'railtype'
        ) {
            continue;
        }

        var railNumber = Number(event.rail);

        if (
            !Number.isSafeInteger(railNumber) ||
            railNumber <= 0
        ) {
            continue;
        }

        var eventOrder =
        event.order !== undefined &&
        event.order !== null &&
        Number.isFinite(Number(event.order))
        ? Number(event.order)
        : i;

        var orderedEvent = {
            ...event,
            _switchOrder: eventOrder
        };

        if (!byRail.has(railNumber)) {
            byRail.set(railNumber, []);
        }

        byRail.get(railNumber).push(orderedEvent);
    }


    var rawRuns = [];
    var endpoints = [];
    var endpointSequence = 0;


    function hasSuppliedNumber(value) {

        return (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== '' &&
            Number.isFinite(Number(value))
        );
    }


    function applyRailPosition(state, event) {

        if (hasSuppliedNumber(event.offsetX)) {
            state.x = Number(event.offsetX);
        }

        if (hasSuppliedNumber(event.offsetY)) {
            state.y = Number(event.offsetY);
        }

        if (
            hasSuppliedNumber(event.railType) &&
            Number(event.railType) >= 0
        ) {
            state.railType = Number(event.railType);
        }
    }


    function addEndpoint(
        rail,
        distance,
        state,
        kind,
        order,
        routeEnd,
        run
    ) {

        if (!Number.isFinite(distance)) return;

        endpoints.push({
            railType: state.railType,
            run: run || null,
            distance: distance,
            rail: rail,

            x: state.x,
            y: state.y,

            kind: kind,
            routeEnd: Boolean(routeEnd),

                       order: order,
                       sequence: endpointSequence++
        });
    }


    // ============================================================
    // 1. BUILD RAW RAIL RUNS
    //
    // These positions are taken directly from BVE commands.
    // They are not curve-smoothed geometry.
    //
    // railReferences contains ONLY actual .Rail/.RailStart
    // commands. Synthetic holding points are not included.
    // ============================================================

    for (var [rail, list] of byRail) {

        list.sort((a, b) =>
        (a.distance - b.distance) ||
        (a._switchOrder - b._switchOrder)
        );

        var state = {
            x: 0,
            y: 0,
            railType: 0
        };

        var activeRun = null;
        var lastRailUpdateDistance = NaN;


        function beginRun(distance, eventOrder) {

            activeRun = {

                rail: rail,

                startDistance: distance,
                endDistance: routeEnd,

                points: [{
                    d: distance,
                    x: state.x,
                    y: state.y
                }],

                railReferences: [{
                    d: distance,
                    x: state.x,
                    y: state.y,
                    order: eventOrder
                }],

                railTypeEvents: [{
                    d: distance,
                    railType: state.railType
                }]
            };

            rawRuns.push(activeRun);
        }


        function appendAt(distance) {

            if (!activeRun) return;

            var points = activeRun.points;
            var last = points[points.length - 1];

            if (distance > last.d + EPS) {

                points.push({
                    d: distance,
                    x: state.x,
                    y: state.y
                });

            } else if (Math.abs(distance - last.d) <= EPS) {

                last.x = state.x;
                last.y = state.y;
            }
        }


        // Carry the OLD rail position through every actual route
        // position between two rail commands.
        function addHoldingPointsBefore(distance) {

            if (!activeRun) return;

            var points = activeRun.points;
            var last = points[points.length - 1];

            for (var holdDistance of positionList) {

                if (holdDistance <= last.d + EPS) {
                    continue;
                }

                if (holdDistance >= distance - EPS) {
                    break;
                }

                points.push({
                    d: holdDistance,
                    x: state.x,
                    y: state.y
                });

                last = points[points.length - 1];
            }
        }


        function closeActiveRun(
            distance,
            order,
            isRouteEnd,
            endingEvent
        ) {

            if (!activeRun) return;

            addHoldingPointsBefore(distance);

            if (endingEvent) {
                applyRailPosition(state, endingEvent);
            }

            appendAt(distance);

            activeRun.endDistance = distance;

            addEndpoint(
                rail,
                distance,
                state,
                'end',
                order,
                isRouteEnd,
                activeRun
            );

            activeRun = null;
        }


        // --------------------------------------------------------
        // PROCESS THIS RAIL'S COMMANDS IN DISTANCE AND COMMAND ORDER
        // --------------------------------------------------------

        for (var event of list) {

            // ====================================================
            // RAIL END
            // ====================================================

            if (event.type === 'railend') {

                if (activeRun) {

                    closeActiveRun(
                        event.distance,
                        event._switchOrder,
                        false,
                        event
                    );

                } else {

                    applyRailPosition(state, event);

                    addEndpoint(
                        rail,
                        event.distance,
                        state,
                        'end',
                        event._switchOrder,
                        false,
                        activeRun
                    );
                }

                lastRailUpdateDistance = NaN;
                continue;
            }


            // ====================================================
            // RAIL TYPE
            // ====================================================

            if (event.type === 'railtype') {

                if (
                    activeRun &&
                    hasSuppliedNumber(event.railType) &&
                    Number(event.railType) >= 0
                ) {
                    state.railType = Number(event.railType);

                    activeRun.railTypeEvents.push({
                        d: Number(event.distance),
                                                  railType: state.railType
                    });
                }

                continue;
            }

            if (event.type !== 'rail') continue;


            var isRailStart =
            String(event.command || '').toLowerCase() === 'railstart';


            // Preserve the existing first ordinary Rail update
            // at a given distance.
            if (
                !isRailStart &&
                lastRailUpdateDistance === event.distance
            ) {
                continue;
            }


            // ====================================================
            // RAIL START
            // ====================================================

            if (isRailStart) {

                lastRailUpdateDistance = NaN;

                if (activeRun) {

                    closeActiveRun(
                        event.distance,
                        event._switchOrder,
                        false,
                        null
                    );
                }

                applyRailPosition(state, event);

                beginRun(event.distance, event._switchOrder);

                addEndpoint(
                    rail,
                    event.distance,
                    state,
                    'start',
                    event._switchOrder,
                    false,
                    activeRun
                );

                continue;
            }


            // ====================================================
            // ORDINARY RAIL
            // ====================================================

            lastRailUpdateDistance = event.distance;

            if (!activeRun) {

                applyRailPosition(state, event);

                beginRun(event.distance, event._switchOrder);

                addEndpoint(
                    rail,
                    event.distance,
                    state,
                    'start',
                    event._switchOrder,
                    false,
                    activeRun
                );

            } else {

                addHoldingPointsBefore(event.distance);

                applyRailPosition(state, event);

                // Record every actual .Rail reference, including
                // references which inherit the previous X/Y values.
                activeRun.railReferences.push({
                    d: event.distance,
                    x: state.x,
                    y: state.y,
                    order: event._switchOrder
                });

                if (
                    hasSuppliedNumber(event.railType) &&
                    Number(event.railType) >= 0
                ) {
                    activeRun.railTypeEvents.push({
                        d: event.distance,
                        railType: state.railType
                    });
                }

                appendAt(event.distance);
            }
        }


        // --------------------------------------------------------
        // CLOSE ANY RAIL STILL ACTIVE AT THE ACTUAL ROUTE END
        // --------------------------------------------------------

        if (activeRun) {

            closeActiveRun(
                routeEnd,
                Number.MAX_SAFE_INTEGER,
                true,
                null
            );
        }
    }


    // ------------------------------------------------------------
    // MARK RAILS THAT CANNOT PARTICIPATE IN SWITCH CONNECTIONS.
    //
    // Do not remove their endpoints.
    // They must still receive their normal front/end buffers.
    // ------------------------------------------------------------

    for (var endpoint of endpoints) {

        var endpointRailType = endpoint.railType;

        if (
            endpoint.run &&
            Array.isArray(endpoint.run.railTypeEvents)
        ) {
            for (var typeEvent of endpoint.run.railTypeEvents) {

                if (typeEvent.d <= endpoint.distance + EPS) {
                    endpointRailType = typeEvent.railType;
                } else {
                    break;
                }
            }
        }

        var endpointMapping = use_track_texture[endpointRailType];

        endpoint.excludeFromPoints =
        !!(
            endpointMapping &&
            Number(endpointMapping[0]) === -1
        );
    }


    // ============================================================
    // 2. RAW POSITION INTERPOLATION
    //
    // A candidate rail must actually exist at the requested
    // distance. Ended runs cannot be reused.
    // ============================================================

    function sampleRawPosition(run, distance) {

        var points = run.points;

        if (!points.length) return null;

        if (
            distance < run.startDistance - EPS ||
            distance > run.endDistance + EPS
        ) {
            return null;
        }

        if (distance <= points[0].d) {

            return {
                x: points[0].x,
                y: points[0].y
            };
        }

        for (var i = 1; i < points.length; i++) {

            var a = points[i - 1];
            var b = points[i];

            if (distance > b.d + EPS) continue;

            var span = Math.max(EPS, b.d - a.d);
            var f = clamp((distance - a.d) / span, 0, 1);

            return {
                x: lerp(a.x, b.x, f),
                y: lerp(a.y, b.y, f)
            };
        }

        var last = points[points.length - 1];

        return {
            x: last.x,
            y: last.y
        };
    }


    // ------------------------------------------------------------
    // FIND THE BRANCH RAIL'S ADJACENT ACTUAL .Rail REFERENCE
    //
    // Facing points: first .Rail reference AFTER the switch.
    // Non-facing points: last .Rail reference BEFORE the switch.
    // ------------------------------------------------------------

    function findBranchRailReference(
        branchRun,
        switchGeometryDistance,
            direction
    ) {

        if (
            !branchRun ||
            !Array.isArray(branchRun.railReferences)
        ) {
            return null;
        }

        var references = branchRun.railReferences;

        if (direction === 'forward') {

            for (var i = 0; i < references.length; i++) {

                if (
                    references[i].d >
                    switchGeometryDistance + EPS
                ) {
                    return references[i];
                }
            }

        } else {

            for (var i = references.length - 1; i >= 0; i--) {

                if (
                    references[i].d <
                    switchGeometryDistance - EPS
                ) {
                    return references[i];
                }
            }
        }

        return null;
    }


    // Return the continuing/stem rail's X coordinate at the same
    // distance as the branch's adjacent .Rail reference.
    function sampleStemRailX(stem, distance) {

        if (!stem || Number(stem.rail) === 0) {
            return 0;
        }

        if (
            stem.run &&
            distance >= stem.run.startDistance - EPS &&
            distance <= stem.run.endDistance + EPS
        ) {
            var preferredPosition = sampleRawPosition(
                stem.run,
                distance
            );

            if (
                preferredPosition &&
                Number.isFinite(preferredPosition.x)
            ) {
                return preferredPosition.x;
            }
        }

        // Defensive fallback for a rail represented by more than one run.
        for (var run of rawRuns) {

            if (
                run.rail !== Number(stem.rail) ||
                distance < run.startDistance - EPS ||
                distance > run.endDistance + EPS
            ) {
                continue;
            }

            var position = sampleRawPosition(run, distance);

            if (position && Number.isFinite(position.x)) {
                return position.x;
            }
        }

        return null;
    }


    // The seventh field describes track 2 (the branch).
    // Compare its X with track 1 (the stem) at the adjacent
    // actual .Rail reference.
    function branchIsLeftAtAdjacentRail(
        endpoint,
        stem,
        switchGeometryDistance
    ) {

        var direction = endpoint.kind === 'start'
        ? 'forward'
        : 'backward';

        var branchReference = findBranchRailReference(
            endpoint.run,
            switchGeometryDistance,
                direction
        );

        if (!branchReference) {
            return false;
        }

        var stemX = sampleStemRailX(
            stem,
            branchReference.d
        );

        if (
            stemX === null ||
            !Number.isFinite(branchReference.x)
        ) {
            return false;
        }

        return branchReference.x < stemX - EPS;
    }


    function matchScore(x1, y1, x2, y2) {

        var dx = Math.abs(x1 - x2);
        var dy = Math.abs(y1 - y2);

        if (
            dx > xLimit + EPS ||
            dy > yLimit + EPS
        ) {
            return Infinity;
        }

        var sx = xLimit > EPS ? dx / xLimit : 0;
        var sy = yLimit > EPS ? dy / yLimit : 0;

        return sx * sx + sy * sy;
    }


    // Find a rail that is genuinely continuing through this
    // position. It must have started before AND end after it.
    function findBestThroughTrack(endpoint) {

        var best = null;
        var bestScore = Infinity;

        // Track 0 is ALWAYS the main track when it is within
        // the configured switch matching tolerances.

        var mainRailType = 0;

        for (var mainTypeEvent of mainTypes) {

            if (mainTypeEvent.distance <= endpoint.distance + EPS) {
                mainRailType = Number(mainTypeEvent.railType) || 0;
            } else {
                break;
            }
        }

        var mainMapping = use_track_texture[mainRailType];

        var mainTrackExcluded =
        mainMapping &&
        Number(mainMapping[0]) === -1;

        if (!mainTrackExcluded) {

            var mainTrackScore = matchScore(
                endpoint.x,
                endpoint.y,
                0,
                0
            );

            if (Number.isFinite(mainTrackScore)) {

                return {
                    rail: 0,
                    x: 0,
                    y: 0,
                    score: mainTrackScore,
                    run: null
                };
            }
        }

        function consider(railNumber, x, y, run) {

            if (railNumber === endpoint.rail) return;

            var score = matchScore(
                endpoint.x,
                endpoint.y,
                x,
                y
            );

            if (score < bestScore) {

                bestScore = score;

                best = {
                    rail: railNumber,
                    x: x,
                    y: y,
                    score: score,
                    run: run || null
                };
            }
        }


        for (var candidate of rawRuns) {

            if (candidate.rail === endpoint.rail) {
                continue;
            }

            // It must exist on BOTH sides of this switch position.
            // This explicitly excludes rails that have ended.
            if (
                candidate.startDistance >= endpoint.distance - EPS ||
                candidate.endDistance <= endpoint.distance + EPS
            ) {
                continue;
            }

            var candidateRailType = 0;

            for (var typeEvent of candidate.railTypeEvents) {

                if (typeEvent.d <= endpoint.distance + EPS) {
                    candidateRailType = typeEvent.railType;
                } else {
                    break;
                }
            }

            var candidateMapping = use_track_texture[candidateRailType];

            if (
                candidateMapping &&
                Number(candidateMapping[0]) === -1
            ) {
                continue;
            }

            var position = sampleRawPosition(
                candidate,
                endpoint.distance
            );

            if (!position) continue;

            consider(
                candidate.rail,
                position.x,
                position.y,
                candidate
            );
        }

        return best;
    }


    // ============================================================
    // 3. GROUP ENDPOINTS AT THE SAME ROUTE POSITION
    // ============================================================

    endpoints.sort((a, b) =>
    (a.distance - b.distance) ||
    (a.order - b.order) ||
    (a.sequence - b.sequence)
    );


    var groups = [];

    for (var endpoint of endpoints) {

        var currentGroup = groups[groups.length - 1];

        if (
            currentGroup &&
            Math.abs(
                endpoint.distance - currentGroup.distance
            ) <= EPS
        ) {
            currentGroup.items.push(endpoint);

        } else {

            groups.push({
                distance: endpoint.distance,
                items: [endpoint]
            });
        }
    }


    // ============================================================
    // 4. CREATE THE SWITCH DATABASE
    //
    // [zposition, track1, track2, type, switched,
    //  geometryPosition, branchOnLeft]
    // ============================================================

    var switchRecords = [];
    var switchSequence = 0;
    var duplicateSwitches = new Set();


    function addSwitch(
        distance,
        track1,
        track2,
        type,
        geometryDistance,
        branchOnLeft
    ) {

        distance = Number(distance);
        track1 = Number(track1);

        geometryDistance =
        geometryDistance === undefined || geometryDistance === null
        ? distance
        : Number(geometryDistance);

        if (!Number.isFinite(geometryDistance)) {
            geometryDistance = distance;
        }

        if (
            !Number.isFinite(distance) ||
            !Number.isSafeInteger(track1) ||
            track1 < 0
        ) {
            return;
        }

        if (
            type !== 'frontbuffer' &&
            type !== 'endbuffer' &&
            type !== 'handover' &&
            type !== 'facing points' &&
            type !== 'non facing points'
        ) {
            return;
        }

        if (
            type === 'frontbuffer' ||
            type === 'endbuffer'
        ) {
            track2 = null;

        } else {

            track2 = Number(track2);

            if (
                !Number.isSafeInteger(track2) ||
                track2 < 0 ||
                track2 === track1
            ) {
                return;
            }
        }

        var isMainTrackStartBuffer =
        type === 'frontbuffer' &&
        track1 === 0 &&
        Math.abs(distance) <= EPS;

        if (isMainTrackStartBuffer) {
            distance = 0;
            geometryDistance = 0;
        } else {
            distance = clamp(
                distance,
                routeStart,
                switchMaxDistance
            );

            geometryDistance = clamp(
                geometryDistance,
                routeStart,
                switchMaxDistance
            );
        }

        var key = [
            distance.toFixed(6),
            track1,
            track2,
            type,
            geometryDistance.toFixed(6)
        ].join(':');

        if (duplicateSwitches.has(key)) return;

        duplicateSwitches.add(key);

        switchRecords.push({

            distance: distance,
            sequence: switchSequence++,

            data: [
                distance,
                track1,
                track2,
                type,
                false,

                // Original BVE position used by physical geometry.
                geometryDistance,

                // True means track 2 (the branch) is left of track 1.
                branchOnLeft === true
            ]
        });
    }


    function addBuffer(endpoint) {

        if (endpoint.kind === 'start') {

            addSwitch(
                endpoint.distance,
                endpoint.rail,
                null,
                'frontbuffer'
            );

        } else {

            addSwitch(
                endpoint.distance,
                endpoint.rail,
                null,
                'endbuffer'
            );
        }
    }


    function moveBehind(distance, metres) {

        return Math.max(
            routeStart,
            distance - metres
        );
    }


    function moveAhead(distance, metres) {

        return Math.min(
            routeEnd,
            distance + metres
        );
    }


    // ============================================================
    // 5. RESOLVE EACH SAME-Z GROUP
    // ============================================================

    for (var group of groups) {

        var z = group.distance;

        var groupEnds = group.items.filter(
            e => e.kind === 'end' && !e.routeEnd
        );

        var groupStarts = group.items.filter(
            e => e.kind === 'start'
        );

        var used = new Set();


        // --------------------------------------------------------
        // SAME RAIL ENDING AND RESTARTING AT THE SAME POSITION
        //
        // This is a continuation, not a switch or buffer.
        // --------------------------------------------------------

        for (var end of groupEnds) {

            var sameRailStart = groupStarts.find(
                start =>
                start.rail === end.rail &&
                !used.has(start)
            );

            if (sameRailStart) {

                used.add(end);
                used.add(sameRailStart);
            }
        }


        var remainingEnds = groupEnds.filter(
            e => !used.has(e) && !e.excludeFromPoints
        );

        var remainingStarts = groupStarts.filter(
            e => !used.has(e) && !e.excludeFromPoints
        );


        // --------------------------------------------------------
        // FIRST PRIORITY: REAL SWITCH CONNECTIONS
        //
        // These are resolved BEFORE handovers.
        // --------------------------------------------------------

        var connections = [];

        for (var endpoint of remainingEnds.concat(remainingStarts)) {

            var throughTrack = findBestThroughTrack(endpoint);

            if (throughTrack) {

                connections.push({
                    endpoint: endpoint,
                    stem: throughTrack
                });
            }
        }


        if (connections.length) {

            for (var i = 0; i < connections.length; i++) {

                var connection = connections[i];
                var endpoint = connection.endpoint;

                var switchDistance = z;

                var previousSameStarts = 0;
                var previousSameEnds = 0;
                var hasFacingPeer = false;

                // Only separate components at this Z if their switch pairs
                // actually share one of their physical rails.
                for (var j = 0; j < connections.length; j++) {

                    if (j === i) continue;

                    var otherConnection = connections[j];

                    var sharesTrack =
                    connection.stem.rail === otherConnection.stem.rail ||
                    connection.stem.rail === otherConnection.endpoint.rail ||
                    connection.endpoint.rail === otherConnection.stem.rail ||
                    connection.endpoint.rail === otherConnection.endpoint.rail;

                    if (!sharesTrack) continue;

                    if (otherConnection.endpoint.kind === 'start') {
                        hasFacingPeer = true;
                    }

                    if (j >= i) continue;

                    if (otherConnection.endpoint.kind === 'start') {
                        previousSameStarts++;
                    } else {
                        previousSameEnds++;
                    }
                }

                if (endpoint.kind === 'start') {

                    // A facing switch moves forwards.
                    // The first component on the shared track stays at Z.
                    switchDistance = moveAhead(
                        z,
                        previousSameStarts * SWITCH_SEPARATION
                    );

                    addSwitch(
                        switchDistance,
                            connection.stem.rail,
                            endpoint.rail,
                            'facing points',
                            z,
                            branchIsLeftAtAdjacentRail(
                                endpoint,
                                connection.stem,
                                z
                            )
                    );

                } else {

                    // A non-facing switch moves backwards.
                    // If a facing component shares the same track, the first
                    // non-facing component must also move backwards.
                    var behindSteps = previousSameEnds +
                    (hasFacingPeer ? 1 : 0);

                    switchDistance = moveBehind(
                        z,
                        behindSteps * SWITCH_SEPARATION
                    );

                    addSwitch(
                        switchDistance,
                            connection.stem.rail,
                            endpoint.rail,
                            'non facing points',
                            z,
                            branchIsLeftAtAdjacentRail(
                                endpoint,
                                connection.stem,
                                z
                            )
                    );
                }

                used.add(endpoint);
            }
        }


        // --------------------------------------------------------
        // SECOND PRIORITY: HANDOVERS
        //
        // Only endpoints not already used by a real switch
        // can be paired as a handover.
        // --------------------------------------------------------

        remainingEnds = groupEnds.filter(
            e => !used.has(e) && !e.excludeFromPoints
        );

        remainingStarts = groupStarts.filter(
            e => !used.has(e) && !e.excludeFromPoints
        );

        var bestPair = null;
        var bestPairScore = Infinity;


        for (var end of remainingEnds) {

            for (var start of remainingStarts) {

                if (end.rail === start.rail) continue;

                var score = matchScore(
                    end.x,
                    end.y,
                    start.x,
                    start.y
                );

                if (score < bestPairScore) {

                    bestPairScore = score;

                    bestPair = {
                        end: end,
                        start: start
                    };
                }
            }
        }


        if (bestPair) {

            // One ending rail becomes the bridge to the new rail.
            // The handover itself remains at the original Z.
            // Handovers are not points, so branchOnLeft is false.
            addSwitch(
                z,
                bestPair.end.rail,
                bestPair.start.rail,
                'handover',
                z,
                false
            );

            used.add(bestPair.end);
            used.add(bestPair.start);


            // ----------------------------------------------------
            // MULTIPLE ENDING TRACKS + ONE STARTING TRACK
            //
            // The first ending track continues to the handover.
            // Other ending tracks join it through non-facing points
            // one metre before the handover.
            // ----------------------------------------------------

            var extraEndIndex = 0;

            for (var otherEnd of remainingEnds) {

                if (used.has(otherEnd)) continue;

                var endScore = matchScore(
                    otherEnd.x,
                    otherEnd.y,
                    bestPair.end.x,
                    bestPair.end.y
                );

                if (!Number.isFinite(endScore)) continue;

                extraEndIndex++;

                addSwitch(
                    moveBehind(
                        z,
                        extraEndIndex * SWITCH_SEPARATION
                    ),
                    bestPair.end.rail,
                    otherEnd.rail,
                    'non facing points',
                    z,
                    branchIsLeftAtAdjacentRail(
                        otherEnd,
                        {
                            rail: bestPair.end.rail,
                            run: bestPair.end.run
                        },
                        z
                    )
                );

                used.add(otherEnd);
            }


            // ----------------------------------------------------
            // ONE ENDING TRACK + MULTIPLE STARTING TRACKS
            //
            // The first new rail receives the handover.
            // Additional new rails split from it after the handover.
            // ----------------------------------------------------

            var extraStartIndex = 0;

            for (var otherStart of remainingStarts) {

                if (used.has(otherStart)) continue;

                var startScore = matchScore(
                    otherStart.x,
                    otherStart.y,
                    bestPair.start.x,
                    bestPair.start.y
                );

                if (!Number.isFinite(startScore)) continue;

                extraStartIndex++;

                addSwitch(
                    moveAhead(
                        z,
                        extraStartIndex * SWITCH_SEPARATION
                    ),
                    bestPair.start.rail,
                    otherStart.rail,
                    'facing points',
                    z,
                    branchIsLeftAtAdjacentRail(
                        otherStart,
                        {
                            rail: bestPair.start.rail,
                            run: bestPair.start.run
                        },
                        z
                    )
                );

                used.add(otherStart);
            }
        }


        // --------------------------------------------------------
        // THIRD PRIORITY: BUFFERS
        //
        // Every unmatched start becomes a front buffer.
        // Every unmatched end becomes an end buffer.
        // --------------------------------------------------------

        for (var endpoint of group.items) {

            if (used.has(endpoint)) continue;

            addBuffer(endpoint);
        }
    }


    // ============================================================
    // 6. FINAL ROUTE BUFFERS
    // ============================================================

    // ------------------------------------------------------------
    // STARTING BUFFER AT THE ACTUAL ROUTE START
    // ------------------------------------------------------------

    addSwitch(
        routeStart,
        0,
        null,
        'frontbuffer',
        routeStart
    );


    // ------------------------------------------------------------
    // FIND RAILS THAT ARE STILL ACTIVE AT THE ACTUAL ROUTE END
    //
    // routeEnd endpoints are marked true only when their runs
    // remained active until the route ended.
    // Explicitly terminated rails are excluded.
    // ------------------------------------------------------------

    var railsAtRouteEnd = new Set();

    for (var endpoint of endpoints) {

        if (
            endpoint.routeEnd === true &&
            Math.abs(endpoint.distance - routeEnd) <= EPS
        ) {
            railsAtRouteEnd.add(endpoint.rail);
        }
    }


    // ------------------------------------------------------------
    // ENDING BUFFERS AT THE EXTENDED ROUTE END
    // ------------------------------------------------------------

    for (var railNumber of railsAtRouteEnd) {

        addSwitch(
            switchMaxDistance,
                railNumber,
                null,
                'endbuffer',
                switchMaxDistance
        );
    }


    // Main track always gets an ending buffer.
    addSwitch(
        switchMaxDistance,
            0,
            null,
            'endbuffer',
            switchMaxDistance
    );


    // ------------------------------------------------------------
    // FINAL SORT AND RETURN
    // ------------------------------------------------------------

    switchRecords.sort((a, b) =>
        (a.distance - b.distance) ||
        (a.sequence - b.sequence)
    );

    return switchRecords.map(record => record.data);
}





function populateCurrentRouteItems() {

    var EPS = 0.0000001;

    current_route_items_detailed = [];
    current_route_items_routing = [];
    current_route_items_routing_npc = [];

    function numberOrNull(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        var n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function railOrNull(value) {
        var n = numberOrNull(value);
        if (n === null || !Number.isSafeInteger(n) || n < 0) {
            return null;
        }
        return n;
    }

    var sourceSwitches =
    typeof trackSwitches !== 'undefined' &&
    Array.isArray(trackSwitches)
    ? trackSwitches
    : [];

    var switches = [];
    var routeEnd = 0;

    for (var i = 0; i < sourceSwitches.length; i++) {
        var sw = sourceSwitches[i];
        if (!Array.isArray(sw) || sw.length < 4) continue;

        var type = String(sw[3] || '').toLowerCase().trim();

        if (
            type !== 'frontbuffer' &&
            type !== 'endbuffer' &&
            type !== 'facing points' &&
            type !== 'non facing points' &&
            type !== 'handover'
        ) continue;

        var distance = numberOrNull(sw[5]);
        if (distance === null) distance = numberOrNull(sw[0]);
        if (distance === null || distance < 0) continue;

        var rail1 = railOrNull(sw[1]);
        if (rail1 === null) continue;

        var rail2 = null;

        if (
            type === 'facing points' ||
            type === 'non facing points' ||
            type === 'handover'
        ) {
            rail2 = railOrNull(sw[2]);
            if (rail2 === null) continue;
        }

        switches.push({
            id: i,
            distance: distance,
            rail1: rail1,
            rail2: rail2,
            type: type,
            selectsSecond: sw[4] === true,
            state: sw[4],
            branchOnLeft: sw[6] === true
        });

        routeEnd = Math.max(routeEnd, distance);
    }

    var routeLimit = routeEnd + 2000;

    switches.sort(function(a, b) {
        return a.distance - b.distance || a.id - b.id;
    });

    var groups = [];

    for (var sw of switches) {
        var lastGroup = groups[groups.length - 1];

        if (lastGroup && Math.abs(lastGroup.distance - sw.distance) <= EPS) {
            lastGroup.events.push(sw);
        } else {
            groups.push({
                distance: sw.distance,
                events: [sw]
            });
        }
    }

    function makeDetail(item, distance, number, state, pointsId, branchOnLeft) {
        return [
            item,
            distance,
            number,
            state,
            pointsId === undefined ? null : pointsId,
            branchOnLeft === undefined ? null : branchOnLeft
        ];
    }

    function addRoutingPoint(array, distance, rail) {
        var last = array[array.length - 1];

        if (
            last &&
            Math.abs(last[0] - distance) <= EPS &&
            last[1] === rail
        ) return;

        array.push([distance, rail]);
    }

    function resolveGroup(group, startingRail, direction, skipIds) {
        var rail = startingRail;
        var consumed = new Set();
        var items = [];
        var transitions = [];

        function isSkipped(event) {
            return skipIds && skipIds.has(event.id);
        }

        function makeBlockedResult(kind, blockEvents, skippedEvents, endBlocked) {
            var blockItems = [];

            for (var event of blockEvents) {
                if (kind === 'conflictingpoints') {
                    blockItems.push(
                        makeDetail(
                            'conflictingpoints',
                            group.distance,
                            rail,
                            event.state,
                            event.id,
                            event.branchOnLeft
                        )
                    );
                } else {
                    blockItems.push(
                        makeDetail(
                            'buffer',
                            group.distance,
                            rail,
                            event.state,
                            event.id,
                            event.branchOnLeft
                        )
                    );
                }
            }

            var ids = new Set();

            for (var event of skippedEvents) {
                ids.add(event.id);
            }

            return {
                blocked: true,
                rail: rail,
                items: items,
                transitions: transitions,
                blockItems: blockItems,
                skipIds: ids,
                endBlocked: endBlocked
            };
        }

        for (var pass = 0; pass <= group.events.length; pass++) {

            var activeBuffers = [];

            for (var event of group.events) {
                if (consumed.has(event.id) || isSkipped(event)) continue;

                if (
                    (event.type === 'frontbuffer' || event.type === 'endbuffer') &&
                    event.rail1 === rail
                ) {
                    activeBuffers.push(event);
                }
            }

            if (activeBuffers.length) {
                var endBlocked =
                direction === 'backward' &&
                activeBuffers.some(function(event) {
                    return event.type === 'endbuffer';
                });

                return makeBlockedResult(
                    'buffer',
                    activeBuffers,
                    activeBuffers,
                    endBlocked
                );
            }

            var candidates = [];
            var conflicts = [];

            for (var event of group.events) {
                if (consumed.has(event.id) || isSkipped(event)) continue;

                if (event.type === 'facing points') {
                    var selectedOutgoing = event.selectsSecond
                    ? event.rail2
                    : event.rail1;

                    if (direction === 'forward') {
                        if (rail === event.rail1) {
                            candidates.push({
                                event: event,
                                target: selectedOutgoing,
                                item: 'facingpoints',
                                number: selectedOutgoing
                            });
                        }
                    } else {
                        if (rail === event.rail1 || rail === event.rail2) {
                            if (rail !== selectedOutgoing) {
                                conflicts.push(event);
                            } else {
                                candidates.push({
                                    event: event,
                                    target: event.rail1,
                                    item: 'facingpoints',
                                    number: selectedOutgoing
                                });
                            }
                        }
                    }
                }

                else if (event.type === 'non facing points') {
                    var selectedIncoming = event.selectsSecond
                    ? event.rail2
                    : event.rail1;

                    if (direction === 'forward') {
                        if (rail === event.rail1 || rail === event.rail2) {
                            if (rail !== selectedIncoming) {
                                conflicts.push(event);
                            } else {
                                candidates.push({
                                    event: event,
                                    target: event.rail1,
                                    item: 'nonfacingpoints',
                                    number: selectedIncoming
                                });
                            }
                        }
                    } else {
                        if (rail === event.rail1 || rail === event.rail2) {
                            if (rail !== event.rail1) {
                                conflicts.push(event);
                            } else {
                                candidates.push({
                                    event: event,
                                    target: selectedIncoming,
                                    item: 'nonfacingpoints',
                                    number: selectedIncoming
                                });
                            }
                        }
                    }
                }

                else if (event.type === 'handover') {
                    if (direction === 'forward' && rail === event.rail1) {
                        candidates.push({
                            event: event,
                            target: event.rail2,
                            item: 'handover',
                            number: event.rail2
                        });
                    } else if (direction === 'backward' && rail === event.rail2) {
                        candidates.push({
                            event: event,
                            target: event.rail1,
                            item: 'handover',
                            number: event.rail1
                        });
                    }
                }
            }

            if (conflicts.length) {
                return makeBlockedResult(
                    'conflictingpoints',
                    conflicts,
                    conflicts,
                    false
                );
            }

            if (!candidates.length) {
                return {
                    blocked: false,
                    rail: rail,
                    items: items,
                    transitions: transitions
                };
            }

            var target = candidates[0].target;

            var ambiguous = candidates.some(function(candidate) {
                return candidate.target !== target;
            });

            if (ambiguous) {
                var pointCandidates = candidates.filter(function(candidate) {
                    return (
                        candidate.event.type === 'facing points' ||
                        candidate.event.type === 'non facing points'
                    );
                });

                var blockEvents = pointCandidates.length
                ? pointCandidates.map(function(candidate) {
                    return candidate.event;
                })
                : candidates.map(function(candidate) {
                    return candidate.event;
                });

                return makeBlockedResult(
                    pointCandidates.length ? 'conflictingpoints' : 'buffer',
                    blockEvents,
                    candidates.map(function(candidate) {
                        return candidate.event;
                    }),
                    false
                );
            }

            var previousRail = rail;

            for (var candidate of candidates) {
                consumed.add(candidate.event.id);

                items.push(
                    makeDetail(
                        candidate.item,
                        group.distance,
                        candidate.number,
                        candidate.event.state,
                        candidate.event.id,
                        candidate.event.branchOnLeft
                    )
                );
            }

            rail = target;

            if (rail !== previousRail) {
                transitions.push({
                    distance: group.distance,
                    from: previousRail,
                    to: rail
                });
            }
        }

        return {
            blocked: true,
            rail: rail,
            items: items,
            transitions: transitions,
            blockItems: [
                makeDetail('buffer', group.distance, rail, false)
            ],
            skipIds: new Set(),
            endBlocked: false
        };
    }

    function traceBack(position, startingRail) {
        var rail = startingRail;

        if (position < 0) {
            return {
                distance: position,
                rail: rail,
                items: [
                    makeDetail('buffer', position, rail, false)
                ],
                skipIds: new Set(),
                endBlocked: false
            };
        }

        var scanPosition = Math.min(position, routeLimit);

        for (var i = groups.length - 1; i >= 0; i--) {
            var group = groups[i];

            if (group.distance > scanPosition + EPS || group.distance < 0) {
                continue;
            }

            var result = resolveGroup(group, rail, 'backward', null);

            if (result.blocked) {
                var boundaryItems = result.blockItems.length
                ? result.blockItems
                : [
                    makeDetail('buffer', group.distance, result.rail, false)
                ];

                return {
                    distance: group.distance,
                    rail: result.rail,
                    items: boundaryItems,
                    skipIds: result.skipIds,
                    endBlocked: result.endBlocked
                };
            }

            rail = result.rail;
        }

        return {
            distance: 0,
            rail: rail,
            items: [
                makeDetail('buffer', 0, rail, false)
            ],
            skipIds: new Set(),
            endBlocked: false
        };
    }

    function traceForward(start) {
        var routing = [];
        var detailed = start.items.slice();
        var rail = start.rail;

        addRoutingPoint(routing, start.distance, rail);

        if (start.endBlocked) {
            return {
                routing: routing,
                detailed: detailed
            };
        }

        var stopped = false;

        for (var group of groups) {
            if (
                group.distance < start.distance - EPS ||
                group.distance < 0 ||
                group.distance > routeLimit + EPS
            ) continue;

            var skipIds =
            Math.abs(group.distance - start.distance) <= EPS
            ? start.skipIds
            : null;

            var result = resolveGroup(group, rail, 'forward', skipIds);

            for (var item of result.items) {
                detailed.push(item);
            }

            for (var transition of result.transitions) {
                addRoutingPoint(routing, transition.distance, transition.to);
            }

            rail = result.rail;

            if (result.blocked) {
                for (var item of result.blockItems) {
                    detailed.push(item);
                }

                addRoutingPoint(routing, group.distance, rail);
                stopped = true;
                break;
            }
        }

        if (!stopped) {
            detailed.push(
                makeDetail('buffer', routeLimit, rail, false)
            );
            addRoutingPoint(routing, routeLimit, rail);
        }

        return {
            routing: routing,
            detailed: detailed
        };
    }

    function buildRoute(positionValue, trackValue) {
        var position = numberOrNull(positionValue);
        if (position === null) position = 0;

        var rail = railOrNull(trackValue);
        if (rail === null) rail = 0;

        var start = traceBack(position, rail);
        return traceForward(start);
    }

    var playerPosition = typeof pos !== 'undefined' ? pos : 0;
    var playerTrack = typeof current_track !== 'undefined' ? current_track : 0;

    var playerRoute = buildRoute(playerPosition, playerTrack);

    current_route_items_routing = playerRoute.routing;
    current_route_items_detailed = playerRoute.detailed;

    var npcPosition = typeof pos_npc !== 'undefined' ? pos_npc : 0;
    var npcTrack = typeof current_track_npc !== 'undefined' ? current_track_npc : 0;

    var npcRoute = buildRoute(npcPosition, npcTrack);

    current_route_items_routing_npc = npcRoute.routing;

    return {
        player: current_route_items_routing,
        npc: current_route_items_routing_npc,
        detailed: current_route_items_detailed,
        routeEnd: routeEnd,
        routeLimit: routeLimit
    };
}



function updatepoints() {

    if (
        !routeMesh ||
        !Array.isArray(routeMesh.zones) ||
        !routeMesh.pointRangesBySwitch ||
        !Array.isArray(trackSwitches)
    ) {
        return;
    }

    // Clear the previously selected GPU draw ranges.
    for (var zone of routeMesh.zones) {
        zone.activePointRanges.length = 0;
    }

    // Process the switch database once.
    for (
        var switchIndex = 0;
    switchIndex < trackSwitches.length;
         switchIndex++
    ) {

        var sw = trackSwitches[switchIndex];

        if (!Array.isArray(sw) || sw.length < 5) {
            continue;
        }

        if (
            sw[3] !== 'facing points' &&
            sw[3] !== 'non facing points'
        ) {
            continue;
        }

        var switched = sw[4] === true;

        // Select the appropriate pre-uploaded position
        // for each of the two blades.

        var blade0Position = switched
        ? 'moved'
        : 'original';

        var blade1Position = switched
        ? 'original'
        : 'moved';

        var uploadedRanges =
        routeMesh.pointRangesBySwitch.get(switchIndex);

        if (!uploadedRanges) {
            continue;
        }

        for (var entry of uploadedRanges) {

            var bladeIndex = entry.range.bladeIndex;

            var requiredPosition = bladeIndex === 0
            ? blade0Position
            : bladeIndex === 1
            ? blade1Position
            : null;

            if (
                requiredPosition &&
                entry.range.position === requiredPosition
            ) {
                entry.zone.activePointRanges.push(
                    entry.range
                );
            }
        }
    }
}










function parseEvents(txt) {
    var events = [];
    var currentDistance = 0;
    var lowestRoutePosition = Infinity;
    var routePositions = new Set();
    use_track_texture = [];
    var inTrack = false;
    var inTrain = false;
    var inStructure = false;
    var inCycle = false;
    var groundCycles = Object.create(null);
    var railCycles = Object.create(null);
    var lineNo = 0;
    function normalizeObjectPath(path) {
        const raw = String(path ?? "")
        .replace(/\\/g, "/")
        .trim();

        const absolute = raw.startsWith("/");
        const parts = [];

        for (const part of raw.split("/")) {
            if (!part || part === ".") continue;

            if (part === "..") {
                if (parts.length && parts[parts.length - 1] !== "..") {
                    parts.pop();
                } else if (!absolute) {
                    parts.push("..");
                }
            } else {
                parts.push(part);
            }
        }

        return (absolute ? "/" : "") +
        parts.join("/").toLowerCase();
    }
    function routeIntegerArg(values, index, defaultValue) {
        var raw = values[index];

        // Preserve BVE's default when an argument is omitted.
        if (raw === undefined || String(raw).trim() === '') {
            return defaultValue;
        }

        // Do not silently convert malformed values to zero.
        var value = Number(String(raw).trim());

        return Number.isSafeInteger(value) ? value : NaN;
    }
    object_linup = [];

    // Clear the global lineup at the start of parsing.
    object_linup.length = 0;

    var structureTypes = [
        'FreeObj', 'Ground', 'WallL', 'WallR',
        'DikeL', 'DikeR', 'Pole', 'CrackL', 'CrackR',
        'FormL', 'FormR', 'FormCL', 'FormCR',
        'RoofL', 'RoofR', 'RoofCL', 'RoofCR', 'Beacon'
    ];

    for (var raw of txt.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        lineNo++;

        var line = raw.trim();
        if (!line || line.startsWith(';')) continue;

        var parts = line.split(',');
        var position = parseFloat(parts[0].trim());

        if (Number.isFinite(position)) {
            currentDistance = position;
            lowestRoutePosition = Math.min(lowestRoutePosition, position);

            // Preserve every actual BVE route position.
            routePositions.add(position);
        }

        for (var part of parts) {
            var cmd = part.trim();
            if (!cmd) continue;

            // ==========================================
            // SECTION SWITCHING ONLY
            // ==========================================

            // Section names must be matched against the current expression,
            // not the whole physical line.
            if (/^With\s+Structure\s*$/i.test(cmd)) {
                inStructure = true;
                inTrack = false;
                inTrain = false;
                inCycle = false;
                continue;
            }

            if (/^With\s+Track\s*$/i.test(cmd)) {






                inStructure = false;
                inTrack = true;
                inTrain = false;
                inCycle = false;
                continue;
            }

            if (/^With\s+Cycle\s*$/i.test(cmd)) {
                inStructure = false;
                inTrack = false;
                inTrain = false;
                inCycle = true;
                continue;
            }
            if (/^With\s+Train\s*$/i.test(cmd)) {
                inStructure = false;
                inTrack = false;
                inTrain = true;
                inCycle = false;
                continue;
            }
            // Parse Cycle.Ground and Cycle.Rail definitions.
            // Supports:
            //   .Ground(0) 0; 1; 2
            //   .Ground(0).Params 0; 1; 2
            //   .Rail(53) 53; 54; 55
            if (inCycle) {
                var cycleMatch = cmd.match(
                    /^(?:cycle\.)?\.?(ground|rail)\s*\(\s*(\d+)\s*\)(?:\.params)?\s*(?:=\s*)?(.+)$/i
                );

                if (cycleMatch) {
                    var cycleType = cycleMatch[1].toLowerCase();
                    var cycleIndex = Number(cycleMatch[2]);

                    var structureIndices = cycleMatch[3]
                    .split(';')
                    .map(function (value) {
                        return Number(value.trim());
                    });

                    var validCycle =
                    Number.isSafeInteger(cycleIndex) &&
                    cycleIndex >= 0 &&
                    structureIndices.length > 0 &&
                    structureIndices.every(function (value) {
                        return Number.isSafeInteger(value) && value >= 0;
                    });

                    if (validCycle) {
                        if (cycleType === 'ground') {
                            groundCycles[cycleIndex] = structureIndices;
                        } else {
                            railCycles[cycleIndex] = structureIndices;
                        }
                    } else {
                        console.warn(
                            '[BVE parser] Invalid cycle definition at line ' +
                            lineNo + ': ' + cmd
                        );
                    }
                }

                // Do not let cycle definitions leak into the track parser.
                continue;
            }

            // ==========================================
            // STRUCTURE PARSER
            //
            // ONLY writes to object_linup.
            // Does not create or modify events.
            // ==========================================

            if (inStructure) {
                // Most structure definitions use one index, but Structure.Pole
                // uses two: AdditionalRailsCovered; PoleStructureIndex.
                var match = cmd.match(
                    /^\.(\w+)\(([^)]*)\)(?:\s*\.Load)?\s+(.+)$/i
                    );

                    if (match) {
                        var item = match[1];
                        var itemKind = item.toLowerCase();
                        var args = match[2].split(';').map(x => x.trim());
                        var path = normalizeObjectPath(match[3]);
                        var number;
                        var additionalRails = null;

                        if (itemKind === 'pole' && args.length >= 2) {
                            additionalRails = parseInt(args[0], 10);
                            number = parseInt(args[1], 10);
                        } else {
                            number = parseInt(args[0], 10);
                        }

                        var validDefinition = Number.isInteger(number) &&
                        (itemKind !== 'pole' || args.length < 2 || Number.isInteger(additionalRails));

                        if (validDefinition) {
                            var q = 0;
                            while (q < route_objects.length) {
                                if (
                                    normalizeObjectPath(route_objects[q][0]) === path
                                ) {
                                    if (itemKind === 'pole' && Number.isInteger(additionalRails)) {
                                        object_linup.push([item, number, q, additionalRails]);
                                    } else {
                                        object_linup.push([item, number, q]);
                                    }
                                    break;
                                }
                                q++;
                            }
                        }
                    }
            }






            // ==========================================
            // TRAIN PARSER
            //
            // For getting the track types referenced to the 8 bve defaults
            // ==========================================



            if (inTrain) {
                var runMatch = cmd.match(
                    /^\.?Run\s*\(\s*(\d+)\s*\)\s*(?:=\s*)?(\d+)\s*$/i
                );

                if (runMatch) {
                    var railType = Number(runMatch[1]);
                    var soundIndex = Number(runMatch[2]);

                    if (
                        Number.isSafeInteger(railType) &&
                        railType >= 0 &&
                        Number.isSafeInteger(soundIndex) &&
                        soundIndex >= 0 &&
                        soundIndex < trackTextures.length
                    ) {
                        // [texture index, sound index]
                        // By design, the sound index also selects the texture.
                        use_track_texture[railType] = [
                            soundIndex,
                            soundIndex
                        ];
                    } else {
                        console.warn(
                            '[BVE parser] Invalid Run command at line ' +
                            lineNo + ': ' + cmd
                        );
                    }
                }

                continue;
            }



            // ==========================================
            // TRACK PARSER
            //
            // ONLY writes to events.
            // Does not create or modify object_linup.
            // ==========================================

            if (inTrack) {



                var m = cmd.match(
                    /^(?:track\.)?\.?([a-z][a-z0-9]*)\s*(.*)$/i
                );
                if (!m) continue;

                var name = m[1].toLowerCase();

                // Support both BVE argument styles:
                // .Wall 1; -1; 0
                // .Wall(1; -1; 0)
                var argumentText = (m[2] || '').trim();

                if (
                    argumentText.startsWith('(') &&
                    argumentText.endsWith(')')
                ) {
                    argumentText = argumentText.slice(1, -1).trim();
                }

                var v = argumentText
                ? argumentText.split(';').map(x => x.trim())
                : [];

                if (name === 'curve') {
                    events.push({
                        type: 'curve',
                        distance: currentDistance,
                        radius: num(v[0], 0),
                                line: lineNo
                    });

                } else if (name === 'turn') {
                    events.push({
                        type: 'turn',
                        distance: currentDistance,
                        ratio: num(v[0], 0),
                                line: lineNo
                    });

                } else if (name === 'pitch') {
                    events.push({
                        type: 'pitch',
                        distance: currentDistance,
                        pitch: num(v[0], 0),
                                line: lineNo
                    });

                } else if (name === 'height') {
                    events.push({
                        type: 'height',
                        distance: currentDistance,
                        height: num(v[0], 0),
                                line: lineNo
                    });

                } else if (name === 'brightness') {
                    var brightnessText = String(v[0] ?? '').trim();
                    var brightnessValue = Number(brightnessText);

                    if (
                        brightnessText !== '' &&
                        Number.isSafeInteger(brightnessValue) &&
                        brightnessValue >= 0 &&
                        brightnessValue <= 255
                    ) {
                        events.push({
                            type: 'brightness',
                            distance: currentDistance,
                            value: brightnessValue,
                            line: lineNo
                        });
                    } else {
                        console.warn(
                            '[BVE parser] Invalid Brightness command at line ' +
                            lineNo + ': ' + cmd
                        );
                    }

                } else if (name === 'sta' || name === 'station') {
                    var stationName = String(v[0] ?? '').trim();
                    var arrivalTime = String(v[1] ?? '').trim().toUpperCase();
                    var arrivalCode = arrivalTime.split(':')[0];

                    // Track.Sta Doors is argument v[4].
                    // Track.Station defaults to both doors.
                    var doors = name === 'station'
                    ? 'B'
                    : String(v[4] ?? '0').trim().toUpperCase();

                    var doorSide = 'none';

                    if (doors === 'L' || doors === '-1') {
                        doorSide = 'left';
                    } else if (doors === 'R' || doors === '1') {
                        doorSide = 'right';
                    } else if (doors === 'B') {
                        doorSide = 'both';
                    }

                    // P/L: all trains pass.
                    // B: the player's train passes.
                    // D: dummy station; do not include it in the game station list.
                    var passThrough = ['P', 'L', 'B', 'D'].includes(arrivalCode);

                    events.push({
                        type: 'station',
                        distance: currentDistance,
                        name: stationName || 'Unnamed station',
                        arrivalTime: arrivalTime,
                        departureTime: String(v[2] ?? '').trim(),
                                doors: doors,
                                doorSide: doorSide,
                                passThrough: passThrough,
                                line: lineNo
                    });

                } else if (name === 'limit') {
                    var speedText = String(v[0] ?? '').trim();
                    var speed = Number(speedText);

                    if (
                        speedText !== '' &&
                        Number.isFinite(speed) &&
                        speed >= 0
                    ) {
                        // Attach speed limits to the existing parsed events array.
                        // This does not add geometry events.
                        if (!events.speedLimits) {
                            events.speedLimits = [];
                        }

                        events.speedLimits.push({
                            distance: currentDistance,
                            speed: speed,
                            post: routeIntegerArg(v, 1, 0),
                                                course: routeIntegerArg(v, 2, 0),
                                                line: lineNo,
                                                order: events.length
                        });
                    } else {
                        console.warn(
                            '[BVE parser] Invalid speed limit at line ' +
                            lineNo + ': ' + cmd
                        );
                    }

                } else if (name === 'stop') {
                    events.push({
                        type: 'stop',
                        distance: currentDistance,
                        direction: num(v[0], 0),
                                backwardTolerance: num(v[1], 5),
                                forwardTolerance: num(v[2], 5),
                                    cars: int(v[3], 0),
                                line: lineNo
                    });

                } else if (name === 'railstart' || name === 'rail') {
                    var rail = int(v[0], -1);

                    if (rail > 0) {
                        events.push({
                            type: 'rail',
                            distance: currentDistance,
                            rail: rail,
                            offsetX: num(v[1], NaN),
                                    offsetY: num(v[2], NaN),
                                    railType: int(v[3], NaN),
                                    line: lineNo,
                                    command: name
                        });
                    }

                } else if (name === 'railend') {
                    var endRail = int(v[0], -1);

                    if (endRail > 0) {
                        events.push({
                            type: 'railend',
                            distance: currentDistance,
                            rail: endRail,
                            offsetX: num(v[1], NaN),
                                    offsetY: num(v[2], NaN),
                                    line: lineNo
                        });
                    }

                } else if (name === 'railtype') {
                    events.push({
                        type: 'railtype',
                        distance: currentDistance,
                        rail: int(v[0], 0),
                                railType: int(v[1], 0),
                                line: lineNo
                    });

                } else if (name === 'freeobj') {
                    // Track.FreeObj RailIndex; StructureIndex; X; Y; Yaw; Pitch; Roll
                    events.push({
                        type: 'freeobj',
                        distance: currentDistance,
                        rail: int(v[0], 0),
                                structure: int(v[1], 0),
                                x: num(v[2], 0),
                                y: num(v[3], 0),
                                yaw: num(v[4], 0),
                                pitch: num(v[5], 0),
                                roll: num(v[6], 0),
                                line: lineNo
                    });


                } else if (name === 'wall') {
                    // Track.Wall RailIndex; Direction; WallStructureIndex
                    var wallRail = routeIntegerArg(v, 0, 0);
                    var wallDirection = routeIntegerArg(v, 1, 0);
                    var wallStructure = routeIntegerArg(v, 2, 0);

                    if (
                        !Number.isSafeInteger(wallRail) ||
                        wallRail < 0 ||
                        ![-1, 0, 1].includes(wallDirection) ||
                        wallStructure < 0
                    ) {
                        console.warn(
                            '[BVE parser] Invalid Wall command at line ' +
                            lineNo + ': ' + cmd
                        );
                    } else {
                        events.push({
                            type: 'wall',
                            distance: currentDistance,
                            rail: wallRail,
                            direction: wallDirection,
                            structure: wallStructure,
                            line: lineNo
                        });
                    }

                } else if (name === 'wallend') {
                    var wallEndRail = routeIntegerArg(v, 0, 0);

                    if (
                        !Number.isSafeInteger(wallEndRail) ||
                        wallEndRail < 0
                    ) {
                        console.warn(
                            '[BVE parser] Invalid WallEnd command at line ' +
                            lineNo + ': ' + cmd
                        );
                    } else {
                        events.push({
                            type: 'wallend',
                            distance: currentDistance,
                            rail: wallEndRail,
                            line: lineNo
                        });
                    }

                } else if (name === 'dike') {
                    // Track.Dike RailIndex; Direction; DikeStructureIndex
                    var dikeRail = routeIntegerArg(v, 0, 0);
                    var dikeDirection = routeIntegerArg(v, 1, 0);
                    var dikeStructure = routeIntegerArg(v, 2, 0);

                    if (
                        !Number.isSafeInteger(dikeRail) ||
                        dikeRail < 0 ||
                        ![-1, 0, 1].includes(dikeDirection) ||
                        dikeStructure < 0
                    ) {
                        console.warn(
                            '[BVE parser] Invalid Dike command at line ' +
                            lineNo + ': ' + cmd
                        );
                    } else {
                        events.push({
                            type: 'dike',
                            distance: currentDistance,
                            rail: dikeRail,
                            direction: dikeDirection,
                            structure: dikeStructure,
                            line: lineNo
                        });
                    }

                } else if (name === 'dikeend') {
                    var dikeEndRail = routeIntegerArg(v, 0, 0);

                    if (
                        !Number.isSafeInteger(dikeEndRail) ||
                        dikeEndRail < 0
                    ) {
                        console.warn(
                            '[BVE parser] Invalid DikeEnd command at line ' +
                            lineNo + ': ' + cmd
                        );
                    } else {
                        events.push({
                            type: 'dikeend',
                            distance: currentDistance,
                            rail: dikeEndRail,
                            line: lineNo
                        });
                    }

                } else if (name === 'pole') {
                    // Track.Pole RailIndex; AdditionalRails; Location; Interval; StructureIndex
                    events.push({
                        type: 'pole',
                        distance: currentDistance,
                        rail: int(v[0], 0),
                                additionalRails: int(v[1], 0),
                                location: num(v[2], 0),
                                interval: int(v[3], 1),
                                structure: int(v[4], 0),
                                line: lineNo
                    });

                } else if (name === 'poleend') {
                    // Track.PoleEnd RailIndex
                    events.push({
                        type: 'poleend',
                        distance: currentDistance,
                        rail: int(v[0], 0),
                                line: lineNo
                    });

                } else if (name === 'crack') {
                    // Track.Crack RailIndex1; RailIndex2; CrackStructureIndex
                    events.push({
                        type: 'crack',
                        distance: currentDistance,
                        rail1: int(v[0], 0),
                                rail2: int(v[1], 0),
                                structure: int(v[2], 0),
                                line: lineNo
                    });

                } else if (name === 'ground') {
                    // Track.Ground CycleIndex (not a direct structure placement)
                    events.push({
                        type: 'ground',
                        distance: currentDistance,
                        cycle: int(v[0], 0),
                                line: lineNo
                    });

                } else if (name === 'form') {
                    // Track.Form RailIndex1; RailIndex2; RoofStructureIndex; FormStructureIndex
                    // RailIndex2 may be a number, L, or R.

                    var formRail2Text = String(v[1] || '0')
                    .trim()
                    .toUpperCase();

                    var formRail2 =
                    formRail2Text === 'L' || formRail2Text === 'R'
                        ? formRail2Text
                        : int(formRail2Text, 0);

                    events.push({
                        type: 'form',
                        distance: currentDistance,
                        rail1: int(v[0], 0),
                                rail2: formRail2,
                                roofStructure: int(v[2], 0),
                                formStructure: int(v[3], 0),
                                    line: lineNo
                    });

                } else if (name === 'beacon') {
                    // Track.Beacon Type; StructureIndex; Section; Data; X; Y; Yaw; Pitch; Roll
                    events.push({
                        type: 'beacon',
                        distance: currentDistance,
                        beaconType: int(v[0], 0),
                                structure: int(v[1], -1),
                                section: int(v[2], 0),
                                data: int(v[3], 0),
                                x: num(v[4], 0),
                                y: num(v[5], 0),
                                yaw: num(v[6], 0),
                                pitch: num(v[7], 0),
                                roll: num(v[8], 0),
                                line: lineNo
                    });

                }
            }
        }
    }

    events.forEach(function (event, index) {
        event.order = index;
    });


    // ============================================================
    // A. SAVE SPEED LIMITS ON THE EXISTING EVENTS ARRAY
    // ============================================================

    events.speedLimits = (events.speedLimits || []).sort((a, b) =>
    (a.distance - b.distance) ||
    (a.order - b.order)
    );


    // ============================================================
    // B. SELECT ONLY STATIONS WHERE THIS TRAIN STOPS
    // ============================================================

    var coachCount = Math.max(
        1,
        Math.floor(Number(coaches) || 1)
    );

    var stationDefinitions = events
    .filter(e => e.type === 'station')
    .sort((a, b) =>
    (a.distance - b.distance) ||
    (a.order - b.order)
    );

    var stopEvents = events
    .filter(e => e.type === 'stop')
    .sort((a, b) =>
    (a.distance - b.distance) ||
    (a.order - b.order)
    );

    var savedStations = [];

    for (var i = 0; i < stationDefinitions.length; i++) {
        var definition = stationDefinitions[i];
        var nextDefinition = stationDefinitions[i + 1] || null;

        // The next station definition, including a pass-through station,
        // terminates the current station's group of Stop commands.
        var candidates = stopEvents.filter(stop =>
        stop.distance >= definition.distance &&
        (
            !nextDefinition ||
            stop.distance < nextDefinition.distance
        )
        );

        // Use precisely the selection priority already used by your
        // existing station code.
        var selectedStop =
        candidates.find(s => Number(s.cars) === coachCount) ||
        candidates.find(s => Number(s.cars) === 0) ||
        candidates.find(s => Number(s.cars) > coachCount) ||
        candidates[0];

        // Do not store pass-through / dummy stations or stations that
        // have no applicable Stop command.
        if (definition.passThrough || !selectedStop) {
            continue;
        }

        savedStations.push({
            ...definition,

            stationStartDistance: definition.distance,

            // The game uses the actual stop point as the station distance.
            distance: selectedStop.distance,
            stopDistance: selectedStop.distance,

            stopDirection: Number(selectedStop.direction) || 0,
                           stopSide: definition.doorSide || 'none',
                           coaches: coachCount,

                           // Freeroam gets populated in the post-processing below.
                           freeroamstart: null,
                           freeroamend: null,
                           freeroamFromPlatform: false,
                           freeroamSource: 'train-length'
        });
    }


    // ============================================================
    // C. FIND PLATFORM BLOCKS FROM THE PARSED RAIL AND FORM EVENTS
    // ============================================================

    var platformBlockLength = getConfiguredBlockLength();

    var activeRailOffsets = new Map();
    var lastRailOffsets = new Map();
    var platformMarkers = [];

    var orderedEvents = events.slice().sort((a, b) =>
    (a.distance - b.distance) ||
    (a.order - b.order)
    );

    for (var ev of orderedEvents) {
        if (ev.type === 'railend') {
            var endedRail = Number(ev.rail);

            if (Number.isFinite(Number(ev.offsetX))) {
                lastRailOffsets.set(endedRail, Number(ev.offsetX));
            }

            activeRailOffsets.delete(endedRail);
            continue;
        }

        if (ev.type === 'rail') {
            var railNumber = Number(ev.rail);
            var railX = Number(ev.offsetX);

            if (Number.isFinite(railX)) {
                activeRailOffsets.set(railNumber, railX);
                lastRailOffsets.set(railNumber, railX);
            } else if (lastRailOffsets.has(railNumber)) {
                activeRailOffsets.set(
                    railNumber,
                    lastRailOffsets.get(railNumber)
                );
            }

            continue;
        }

        if (ev.type !== 'form') continue;

        var rail1 = Number(ev.rail1);
        var secondRail = ev.rail2;
        var side = null;
        var lateralCentre = null;
        var groupKey = '';

        if (typeof secondRail === 'string') {
            var sideCode = secondRail.trim().toUpperCase();

            if (sideCode !== 'L' && sideCode !== 'R') continue;

            side = sideCode === 'L' ? 'left' : 'right';

            lateralCentre = rail1 === 0
            ? 0
            : activeRailOffsets.get(rail1);

            if (!Number.isFinite(lateralCentre)) {
                lateralCentre = 0;
            }

            groupKey = 'side:' + rail1 + ':' + sideCode;
        } else {
            var rail2 = Number(secondRail);

            var x1 = rail1 === 0
            ? 0
            : activeRailOffsets.get(rail1);

            var x2 = rail2 === 0
            ? 0
            : activeRailOffsets.get(rail2);

            if (
                !Number.isFinite(x1) ||
                !Number.isFinite(x2)
            ) {
                continue;
            }

            lateralCentre = (x1 + x2) / 2;

            if (x1 < 0 && x2 > 0 || x2 < 0 && x1 > 0) {
                side = 'both';
            } else if (lateralCentre < -1e-6) {
                side = 'left';
            } else if (lateralCentre > 1e-6) {
                side = 'right';
            } else {
                continue;
            }

            groupKey = 'pair:' + rail1 + ':' + rail2;
        }

        platformMarkers.push({
            distance: Number(ev.distance),
                             side: side,
                             groupKey: groupKey,
                             lateralCentre: lateralCentre
        });
    }


    // ============================================================
    // D. FIND PLATFORM START / END FOR EACH SAVED STATION
    // ============================================================

    var coachLengthMeters =
    typeof coachlength !== 'undefined' &&
    Number.isFinite(Number(coachlength)) &&
    Number(coachlength) > 0
    ? Number(coachlength)
    : (
        typeof coachLength !== 'undefined' &&
        Number.isFinite(Number(coachLength)) &&
        Number(coachLength) > 0
        ? Number(coachLength)
        : 20
    );

    if (
        typeof coachlength === 'undefined' &&
        typeof coachLength === 'undefined'
    ) {
        console.warn(
            '[Stations] No coach length configured; using 20 metres per coach.'
        );
    }

    function markerMatchesSide(platformSide, stopSide) {
        if (stopSide === 'both') return true;
        if (platformSide === 'both') return true;

        return platformSide === stopSide;
    }

    for (var station of savedStations) {
        var stopPoint = Number(station.stopDistance);

        // Default freeroam is one whole train length before the stop point.
        station.freeroamstart = Math.max(
            0,
            stopPoint - coachCount * coachLengthMeters
        );

        station.freeroamend = stopPoint;
        station.freeroamFromPlatform = false;
        station.freeroamSource = 'train-length';

        if (!['left', 'right', 'both'].includes(station.stopSide)) {
            continue;
        }

        // Find which platform block is present at this stop point on the
        // correct side. A block extends 25 metres from its Form command.
        var anchors = platformMarkers.filter(marker =>
        markerMatchesSide(marker.side, station.stopSide) &&
        marker.distance <= stopPoint + 1e-6 &&
        stopPoint < marker.distance + platformBlockLength - 1e-6
        );

        if (!anchors.length) continue;

        // If multiple candidate platforms are on the requested side,
        // prefer the one closest laterally to the player's reference rail.
        anchors.sort((a, b) =>
        Math.abs(a.lateralCentre) - Math.abs(b.lateralCentre)
        );

        var anchor = anchors[0];

        var positions = [
            ...new Set(
                platformMarkers
                .filter(marker =>
                marker.groupKey === anchor.groupKey &&
                marker.side === anchor.side
                )
                .map(marker => marker.distance)
            )
        ].sort((a, b) => a - b);

        var anchorIndex = positions.indexOf(anchor.distance);

        if (anchorIndex < 0) continue;

        var firstIndex = anchorIndex;
        var lastIndex = anchorIndex;

        // Look backward over contiguous blocks belonging to this platform.
        while (firstIndex > 0) {
            if (
                positions[firstIndex] - positions[firstIndex - 1] >
                platformBlockLength + 1e-6
            ) {
                break;
            }

            firstIndex--;
        }

        // Look forward until a gap marks the platform end.
        while (lastIndex < positions.length - 1) {
            if (
                positions[lastIndex + 1] - positions[lastIndex] >
                platformBlockLength + 1e-6
            ) {
                break;
            }

            lastIndex++;
        }

        station.freeroamstart = positions[firstIndex];
        station.freeroamend =
        positions[lastIndex] + platformBlockLength;

        station.freeroamFromPlatform = true;
        station.freeroamSource = 'platform';
    }

    // texture overrides




        // ============================================================
    // RAIL OBJECTS: DISABLE DYNAMIC TRACK BY DEFAULT
    //
    // Rail objects take priority over dynamically generated track.
    // This is deliberately before texture overrides, which can
    // subsequently restore dynamic track if required.
    // ============================================================

    // Find Rail structures which successfully loaded into the GPU.
    var loadedRailStructureIndices = new Set();

    for (var row of object_linup) {

        if (
            !Array.isArray(row) ||
            String(row[0]).toLowerCase() !== 'rail'
        ) {
            continue;
        }

        var structureIndex = Number(row[1]);
        var modelIndex = Number(row[2]);

        if (
            !Number.isSafeInteger(structureIndex) ||
            structureIndex < 0 ||
            !Number.isSafeInteger(modelIndex) ||
            modelIndex < 0
        ) {
            continue;
        }

        var railObject = route_objects[modelIndex];

        if (
            !railObject ||
            railObject[3] !== true ||
            !railObject[4]
        ) {
            continue;
        }

        loadedRailStructureIndices.add(structureIndex);
    }


    // Find the RailTypes actually used by the route.
    // Rail 0 is the implicit main rail and starts with type 0.
    var usedRailTypes = new Set([0]);

    var previousRailTypes = new Map();
    var activeRailIndices = new Set();

    var orderedRailEvents = events
        .filter(event =>
            event.type === 'rail' ||
            event.type === 'railtype' ||
            event.type === 'railend'
        )
        .slice()
        .sort((a, b) =>
            (a.distance - b.distance) ||
            (a.order - b.order)
        );

    for (var event of orderedRailEvents) {

        var railIndex = Number(event.rail);

        if (
            !Number.isSafeInteger(railIndex) ||
            railIndex < 0
        ) {
            continue;
        }

        // End an additional rail without losing its previous RailType.
        if (event.type === 'railend') {
            activeRailIndices.delete(railIndex);
            continue;
        }

        // Main rail RailType changes.
        if (event.type === 'railtype' && railIndex === 0) {

            var mainType = Number(event.railType);

            if (
                Number.isSafeInteger(mainType) &&
                mainType >= 0
            ) {
                usedRailTypes.add(mainType);
            }

            continue;
        }

        // Additional rail starts and updates.
        if (event.type === 'rail') {

            if (railIndex === 0) continue;

            var currentType = previousRailTypes.has(railIndex)
                ? previousRailTypes.get(railIndex)
                : 0;

            var suppliedType = Number(event.railType);

            if (
                Number.isSafeInteger(suppliedType) &&
                suppliedType >= 0
            ) {
                currentType = suppliedType;
            }

            previousRailTypes.set(railIndex, currentType);
            activeRailIndices.add(railIndex);

            usedRailTypes.add(currentType);

            continue;
        }

        // RailType changes only apply to an existing additional rail.
        if (
            event.type === 'railtype' &&
            activeRailIndices.has(railIndex)
        ) {
            var changedType = Number(event.railType);

            if (
                Number.isSafeInteger(changedType) &&
                changedType >= 0
            ) {
                previousRailTypes.set(railIndex, changedType);
                usedRailTypes.add(changedType);
            }
        }
    }


    // Set the dynamic track texture to -2 where a Rail object exists.
    for (var trackType of usedRailTypes) {

        // A Cycle.Rail uses the RailType index as its cycle index.
        // Its members refer to the actual Structure.Rail indices.
        var cycle = railCycles[String(trackType)];

        var hasRailObject;

        if (Array.isArray(cycle) && cycle.length > 0) {

            hasRailObject = cycle.some(index =>
                loadedRailStructureIndices.has(Number(index))
            );

        } else {

            hasRailObject =
                loadedRailStructureIndices.has(trackType);
        }

        if (!hasRailObject) continue;

        // Preserve the existing run-sound mapping.
        if (!Array.isArray(use_track_texture[trackType])) {
            use_track_texture[trackType] = [-2, 2];
        } else {
            use_track_texture[trackType][0] = -2;
        }
    }





    var i = 0;

    while (i < textureoverrides.length) {
        var override = textureoverrides[i];

        var trackType = Number(override[0]);
        var textureIndex = Number(override[1]);

        use_track_texture[trackType][0] = textureIndex;

        i++;
    }



    // Store the finished station records as parsed-event metadata.
    // Nothing is added to the geometry calculations.
    events.stations = savedStations;

    events.firstRouteDistance = Number.isFinite(lowestRoutePosition)
    ? lowestRoutePosition
    : 0;

    events.routePositions = Array.from(routePositions)
    .sort((a, b) => a - b);

    events.groundCycles = groundCycles;
    events.railCycles = railCycles;

    return events;
}

/* ROUTE GEOMETRY */



//todo




function buildGeometry(events) {




    // ------------------------------------------------------------
    // 1. EXISTING ROUTE GEOMETRY
    // ------------------------------------------------------------
    var groundCycles = events.groundCycles || Object.create(null);
    var railCycles = events.railCycles || Object.create(null);
    var curves = events
    .filter(e => e.type === 'curve' || e.type === 'turn')
    .sort((a, b) => a.distance - b.distance);

    var pitches = events
    .filter(e => e.type === 'pitch')
    .sort((a, b) => a.distance - b.distance);

    var heights = events
    .filter(e => e.type === 'height')
    .sort((a, b) => a.distance - b.distance);
    var brightnessEvents = events
    .filter(e => e.type === 'brightness')
    .sort((a, b) =>
    (a.distance - b.distance) ||
    ((a.order || 0) - (b.order || 0))
    );
    function heightAboveGroundAt(distance) {
        // Track.Height gives the rail's height above the ground.
        if (!heights.length) return 0;

        // Before the first height command, use the default height.
        if (distance < heights[0].distance) {
            return 0;
        }

        // Interpolate between consecutive height commands.
        for (var i = 0; i < heights.length - 1; i++) {
            var h0 = heights[i];
            var h1 = heights[i + 1];

            if (distance <= h1.distance) {
                var span = Math.max(
                    1e-9,
                    h1.distance - h0.distance
                );

                var f = clamp(
                    (distance - h0.distance) / span,
                              0,
                              1
                );

                return lerp(h0.height, h1.height, f);
            }
        }

        // After the last command, retain its height.
        return heights[heights.length - 1].height;
    }

    var allStations = events
    .filter(e => e.type === 'station')
    .sort((a, b) => a.distance - b.distance);

    var stations = allStations.map((st, index) => {
        var nextStation = allStations[index + 1];

        var stops = events
        .filter(e =>
        e.type === 'stop' &&
        e.distance >= st.distance &&
        (!nextStation || e.distance < nextStation.distance)
        )
        .sort((a, b) => a.distance - b.distance);

        var stop =
        stops.find(s => s.cars === coaches) ||
        stops.find(s => s.cars === 0) ||
        stops.find(s => s.cars > coaches) ||
        stops[0];

        return {
            ...st,
            stopDistance: stop ? stop.distance : st.distance
        };
    });

    var railEvents = events
    .map((event, index) => ({
        event: event,
        index: index
    }))
    .filter(item =>
    item.event.type === 'rail' ||
    item.event.type === 'railend' ||
    (
        item.event.type === 'railtype' &&
        Number(item.event.rail) > 0
    )
    )
    .map(item => {

        var eventOrder = Number(item.event.order);

        return {
            ...item.event,

            // Preserve the actual order of commands at the same distance.
            order:
            item.event.order !== undefined &&
            item.event.order !== null &&
            Number.isFinite(eventOrder)
            ? eventOrder
            : item.index
        };
    })
    .sort((a, b) =>
    (a.distance - b.distance) ||
    (a.order - b.order)
    );
    // Main-track Track.RailType events (rail 0).
    // Preserve command order when multiple changes occur
    // at the same route distance.
    var mainRailTypeEvents = events
    .map((event, index) => ({
        event: event,
        index: index
    }))
    .filter(item =>
    item.event.type === 'railtype' &&
    Number(item.event.rail) === 0
    )
    .map(item => ({
        distance: item.event.distance,
        railType: item.event.railType,
        order: item.index
    }))
    .sort((a, b) =>
    (a.distance - b.distance) ||
    (a.order - b.order)
    );
    var TURN_LENGTH = getConfiguredBlockLength();
    var changes = [];

    for (var curve of curves) {
        if (curve.type === 'curve') {
            changes.push({
                distance: curve.distance,
                radius: curve.radius,
                type: 'curve',
                order: 0
            });
        }
    }

    for (var turn of curves) {
        if (turn.type !== 'turn') continue;

        var angle = Math.atan(turn.ratio);

        var turnRadius = Math.abs(angle) < 1e-12
        ? 0
        : TURN_LENGTH / angle;

        changes.push({
            distance: turn.distance,
            type: 'turnStart',
            radius: turnRadius,
            turnDistance: turn.distance,
            order: 1
        });

        changes.push({
            distance: turn.distance + TURN_LENGTH,
            type: 'turnEnd',
            turnDistance: turn.distance,
            order: 2
        });
    }

    changes.sort((a, b) =>
    (a.distance - b.distance) || (a.order - b.order)
    );

    var unifiedCurves = [];
    var baseRadius = 0;
    var activeTurn = null;

    function storeCurve(distance, radius) {
        var previous = unifiedCurves[unifiedCurves.length - 1];

        if (previous && Math.abs(previous.distance - distance) < 1e-9) {
            previous.radius = radius;
        } else {
            unifiedCurves.push({
                type: 'curve',
                distance: distance,
                radius: radius
            });
        }
    }

    for (var change of changes) {
        if (change.type === 'curve') {
            baseRadius = change.radius;

            if (!activeTurn) {
                storeCurve(change.distance, baseRadius);
            }
        } else if (change.type === 'turnStart') {
            activeTurn = change.turnDistance;
            storeCurve(change.distance, change.radius);
        } else if (change.type === 'turnEnd') {
            if (activeTurn === change.turnDistance) {
                activeTurn = null;
                storeCurve(change.distance, baseRadius);
            }
        }
    }

    unifiedCurves.sort((a, b) => a.distance - b.distance);
    curves = unifiedCurves;

    // Find the actual furthest event, then extend the route by 2000.
    var routeEndDistance = 0;

    for (var event of events) {
        if (Number.isFinite(event.distance)) {
            routeEndDistance = Math.max(routeEndDistance, event.distance);
        }
    }
    // todo  add 2000 to repeat end if works ok
    var repeatStructureEndDistance = routeEndDistance + 2000;
    var maxDistance = routeEndDistance + 2000;




    var x = 0;
    var z = 0;
    var elevation = 0;
    var heading = 0;

    // No curve or pitch command has applied at the start.
    var curveIndex = -1;
    var pitchIndex = -1;

    var samples = [];

    var d = 0;

    while (true) {

        // --------------------------------------------------------
        // FIND THE CURVE ACTIVE AT THIS DISTANCE
        // --------------------------------------------------------

        while (
            curveIndex + 1 < curves.length &&
            curves[curveIndex + 1].distance <= d + 1e-9
        ) {
            curveIndex++;
        }


        // --------------------------------------------------------
        // FIND THE PITCH ACTIVE AT THIS DISTANCE
        // --------------------------------------------------------

        while (
            pitchIndex + 1 < pitches.length &&
            pitches[pitchIndex + 1].distance <= d + 1e-9
        ) {
            pitchIndex++;
        }


        var radius =
        curveIndex >= 0
        ? (
            Number(curves[curveIndex].radius) /
            curveMultiplier || 0
        )
        : 0;

        var pitch =
        pitchIndex >= 0
        ? (Number(pitches[pitchIndex].pitch) || 0)
        : 0;


        // --------------------------------------------------------
        // STORE THE ROUTE POSITION
        // --------------------------------------------------------

        samples.push({
            d: d,
            x: x,
            z: z,
            y: elevation,
            heading: heading
        });


        if (d >= maxDistance - 1e-7) {
            break;
        }


        // Never take a step larger than one metre.
        // The last step is shortened to reach maxDistance exactly.
        var ds = Math.min(
            TRACK_DRAW_STEP,
            maxDistance - d
        );


        // --------------------------------------------------------
        // UPDATE ELEVATION
        // --------------------------------------------------------

        elevation +=
        ds *
        (pitch / 1000) *
        TRACK_GRADIENT_SCALE;


        // --------------------------------------------------------
        // UPDATE HORIZONTAL ROUTE POSITION
        // --------------------------------------------------------

        if (Math.abs(radius) > 1e-9) {

            var hStart = heading;
            var hEnd = hStart + ds / radius;

            x += radius * (
                Math.cos(hStart) -
                Math.cos(hEnd)
            );

            z += radius * (
                Math.sin(hEnd) -
                Math.sin(hStart)
            );

            heading = hEnd;

        } else {

            x += Math.sin(heading) * ds;
            z += Math.cos(heading) * ds;
        }


        d += ds;
    }

    if (!samples.length) {
        samples.push({
            d: 0,
            x: 0,
            z: 0,
            y: 0,
            heading: 0
        });
    }




    // Detect switches from raw BVE rail positions.
    // This MUST happen before buildRailTracks creates smoothed geometry.
    var routePositions = Array.isArray(events.routePositions)
    ? events.routePositions
    : [];


    // The switch database must stop at the actual route end.
    // maxDistance is extended by 2000 metres for geometry/scenery.
    var switchRouteEndDistance = routePositions.length
    ? routePositions[routePositions.length - 1]
    : routeEndDistance;

    trackSwitchMinDistance = routePositions.length
    ? routePositions[0]
    : (Number(events.firstRouteDistance) || 0);

    trackSwitchMaxDistance = switchRouteEndDistance;


    // Detect switches from raw BVE rail positions,
    // before any curve smoothing takes place.
    trackSwitches = buildTrackSwitchDatabase(
        railEvents,
        switchRouteEndDistance,
            routePositions,
            mainRailTypeEvents
    );


    // Build the rail geometry using the same actual route positions.
    var rails = buildRailTracks(
        railEvents,
        maxDistance,
        routePositions,
        samples
    );
    var railObjectRuns = Array.isArray(rails.railObjectRuns)
    ? rails.railObjectRuns
    : [];

    // ------------------------------------------------------------
    // 2. OBJECT LOOKUP
    //
    // object_linup rows:
    // [structureType, structureNumber, gpuModelIndex, poleAdditionalRails?]
    // ------------------------------------------------------------

    var threeDObjects = [];

    var objectLookup =
    typeof object_linup !== 'undefined' &&
    Array.isArray(object_linup)
    ? object_linup
    : [];

    function getNumber(e, names, fallback = 0) {
        for (var name of names) {
            if (e[name] === undefined || e[name] === null || e[name] === '') {
                continue;
            }

            var value = Number(e[name]);

            if (Number.isFinite(value)) {
                return value;
            }
        }

        return fallback;
    }

    function getText(e, names, fallback = '') {
        for (var name of names) {
            if (e[name] !== undefined && e[name] !== null) {
                return String(e[name]);
            }
        }

        return fallback;
    }


    function normalizeEventKind(value) {
        return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/^(track|railway)\./, '')
        .replace(/[\s_-]+/g, '');
    }

    function getEventKind(e) {
        var type = normalizeEventKind(e.type);

        var command = normalizeEventKind(
            e.command ?? e.kind ?? e.name ?? ''
        );

        var knownKinds = new Set([
            'freeobj',
            'beacon',

            'wall',
            'walll',
            'wallr',
            'wallend',

            'dike',
            'dikel',
            'diker',
            'dikeend',

            'pole',
            'poleend',

            'ground',

            'crack',
            'crackl',
            'crackr',

            'form',
            'formend',
            'forml',
            'formr',
            'formcl',
            'formcr',

            'roofl',
            'roofr',
            'roofcl',
            'roofcr'
        ]);

        // An explicit recognised command takes priority over a
        // broader event type such as "pole" or "object".
        if (knownKinds.has(command)) {
            return command;
        }

        if (knownKinds.has(type)) {
            return type;
        }

        var genericTypes = [
            '',
            'object',
            '3dobject',
            'track',
            'railway',
            'command',
            'structure',
            'trackevent',
            'trackcommand'
        ];

        if (genericTypes.includes(type)) {
            return command || type;
        }

        return type || command;
    }



    function findModelIndex(
        structureType,
        structureNumber,
        additionalRails = null
    ) {
        var wantedType = String(structureType).toLowerCase();
        var wantedNumber = Number(structureNumber);

        var matches = [];

        for (var row of objectLookup) {
            if (!Array.isArray(row) || row.length < 3) continue;

            if (
                String(row[0]).toLowerCase() !== wantedType ||
                Number(row[1]) !== wantedNumber ||
                !Number.isFinite(Number(row[2]))
            ) {
                continue;
            }

            var candidateIndex = Number(row[2]);
            var candidateObject = route_objects[candidateIndex];

            // A structure is usable only if its GPU model loaded successfully.
            if (
                !candidateObject ||
                candidateObject[3] !== true ||
                !candidateObject[4]
            ) {
                continue;
            }

            matches.push(row);
        }

        // Ordinary structure types are keyed by type and index.
        if (wantedType !== 'pole' || additionalRails === null) {
            return matches.length ? Number(matches[0][2]) : null;
        }

        var wantedRails = Number(additionalRails);

        // Prefer an exact match on both pole index and additional rails.
        var exactMatch = matches.find(row =>
        row.length >= 4 &&
        Number(row[3]) === wantedRails
        );

        if (exactMatch) {
            return Number(exactMatch[2]);
        }

        // Backward compatibility: accept an old three-column pole
        // row only when it is the single unambiguous definition.
        var legacyMatches = matches.filter(row => row.length < 4);

        if (matches.length === 1 && legacyMatches.length === 1) {
            return Number(legacyMatches[0][2]);
        }

        // Do not silently choose a pole model for the wrong rail count.
        return null;
    }




    function getStructureNumber(e, requestedKind = getEventKind(e)) {
        var kind = normalizeEventKind(requestedKind);

        var specificFields = {
            freeobj: ['freeObjStructureIndex', 'freeObjIndex'],
            beacon: ['beaconStructureIndex', 'beaconIndex'],

            wall: ['wallStructureIndex', 'wallIndex'],
            walll: ['wallStructureIndex', 'wallIndex'],
            wallr: ['wallStructureIndex', 'wallIndex'],

            dike: ['dikeStructureIndex', 'dikeIndex'],
            dikel: ['dikeStructureIndex', 'dikeIndex'],
            diker: ['dikeStructureIndex', 'dikeIndex'],

            pole: ['poleStructureIndex', 'poleIndex'],

            ground: [
                'groundStructureIndex',
                'groundIndex',
                'cycleIndex'
            ],

            form: [
                'formStructureIndex',
                'formStructure',
                'formIndex'
            ],

            crack: ['crackStructureIndex', 'crackIndex']
        };

        var fields = [
            ...(specificFields[kind] || []),

            // Generic fallbacks are last.
            'structureIndex',
            'structure',
            'objectIndex',
            'index',
            'number'
        ];

        return getNumber(e, fields, 0);
    }



    // ------------------------------------------------------------
    // 3. INTERPOLATE THE ROUTE AT ANY OBJECT DISTANCE
    // ------------------------------------------------------------

    function sampleGeometryAt(distance) {
        if (samples.length === 1) {
            return {
                ...samples[0],
                d: distance
            };
        }

        if (distance <= samples[0].d) {
            return {
                ...samples[0],
                d: distance
            };
        }

        var last = samples.length - 1;

        if (distance >= samples[last].d) {
            return {
                ...samples[last],
                d: distance
            };
        }

        var low = 0;
        var high = last;

        while (low + 1 < high) {
            var mid = Math.floor((low + high) * 0.5);

            if (samples[mid].d <= distance) {
                low = mid;
            } else {
                high = mid;
            }
        }

        var a = samples[low];
        var b = samples[high];

        var span = Math.max(1e-9, b.d - a.d);
        var f = clamp((distance - a.d) / span, 0, 1);

        var dh = b.heading - a.heading;

        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;

        return {
            d: distance,
            x: lerp(a.x, b.x, f),
            y: lerp(a.y, b.y, f),
            z: lerp(a.z, b.z, f),
            heading: a.heading + dh * f
        };
    }

    // ------------------------------------------------------------
    // 4. FIND AN OBJECT'S REFERENCE RAIL
    //
    // Rail 0 is the player's rail.
    // Other rail indices use the offsets built by buildRailTracks.
    // ------------------------------------------------------------

    function getRailOffset(railIndex, distance) {
        railIndex = Number(railIndex) || 0;

        if (railIndex === 0) {
            return { x: 0, y: 0 };
        }

        // A RailIndex can be ended and restarted at the same position.
        // Prefer the run with the latest start distance at shared boundaries.
        var selectedTrack = null;
        var selectedStartDistance = -Infinity;

        for (var track of rails) {
            if (Number(track.rail) !== railIndex) continue;

            var startDistance = Number(track.startDistance);
            var endDistance = Number(track.endDistance);

            if (
                !Number.isFinite(startDistance) ||
                !Number.isFinite(endDistance) ||
                distance < startDistance - 1e-7 ||
                distance > endDistance + 1e-7
            ) {
                continue;
            }

            if (startDistance >= selectedStartDistance) {
                selectedTrack = track;
                selectedStartDistance = startDistance;
            }
        }

        if (selectedTrack) {
            return interpolateRailOffset(selectedTrack, distance);
        }

        // Do not silently attach an object to the player's rail
        // if its requested reference rail cannot be found.
        return null;
    }
    function getRailWorldPoint(railIndex, distance) {
        var sample = sampleGeometryAt(distance);
        var offset = getRailOffset(railIndex, distance);

        if (!offset) return null;

        var basis = basisForSample(sample);

        return {
            x: sample.x + basis.rx * offset.x,
            y: sample.y + offset.y,
            z: sample.z + basis.rz * offset.x
        };
    }
    // ------------------------------------------------------------
    // 5. CREATE A GENERIC 3D OBJECT PLACEMENT
    //
    // No structure type is stored in the output.
    //
    // Output rotations are radians:
    // yaw includes the track heading plus the object's yaw offset.
    // ------------------------------------------------------------

    function averageTrackHeading(startDistance, endDistance) {
        var start = Number(startDistance);
        var end = Number(endDistance);

        var startHeading =
        sampleGeometryAt(start).heading;

        if (
            !Number.isFinite(end) ||
            end <= start
        ) {
            return startHeading;
        }

        // Sample the full segment, not just its endpoints.
        var routeStep = Number(TRACK_DRAW_STEP);

        if (!Number.isFinite(routeStep) || routeStep <= 0) {
            routeStep = 1;
        }

        // Use a maximum sampling interval of 2.5 metres.
        var sampleStep = TRACK_DRAW_STEP;

        var sumSin = 0;
        var sumCos = 0;

        for (
            var d = start;
        d < end;
        d += sampleStep
        ) {
            var heading = sampleGeometryAt(d).heading;

            sumSin += Math.sin(heading);
            sumCos += Math.cos(heading);
        }

        // Include the exact endpoint.
        var endHeading =
        sampleGeometryAt(end).heading;

        sumSin += Math.sin(endHeading);
        sumCos += Math.cos(endHeading);

        if (
            Math.abs(sumSin) < 1e-12 &&
            Math.abs(sumCos) < 1e-12
        ) {
            return startHeading;
        }

        // Heading convention:
        // 0 radians = forward along +Z.
        return Math.atan2(sumSin, sumCos);
    }



    function addModel(
        modelIndex,
        distance,
        railIndex = 0,
        lateral = 0,
        vertical = 0,
        yawDegrees = 0,
        pitchDegrees = 0,
        rollDegrees = 0,
        scaleX = 1,
        instanceMetadata = null
    ) {
        if (!Number.isFinite(Number(modelIndex))) return false;
        if (!Number.isFinite(distance)) return false;

        if (distance < 0 || distance > maxDistance + 1e-6) {
            return false;
        }

        var sample = sampleGeometryAt(distance);
        var offset = getRailOffset(railIndex, distance);

        if (!offset) return false;

        // Restore the original local track coordinate system.
        var basis = basisForSample(sample);
        var totalLateral = offset.x + lateral;

        threeDObjects.push({
            modelIndex: Number(modelIndex),
                           distance: distance,

                           // Use the existing track-relative right vector.
                           x: sample.x + basis.rx * totalLateral,

                           // Height relative to the selected rail.
                           y: sample.y + offset.y + vertical,

                           z: sample.z + basis.rz * totalLateral,

                           // World heading plus the object's own yaw offset.
                           yaw:
                           sample.heading +
                           Number(yawDegrees || 0) * Math.PI / 180,

                           pitch:
                           Number(pitchDegrees || 0) * Math.PI / 180,

                           roll:
                           Number(rollDegrees || 0) * Math.PI / 180,

                           scaleX: scaleX,

                           ...(instanceMetadata &&
                           typeof instanceMetadata === "object"
                           ? instanceMetadata
                           : {})
        });

        return true;
    }


    var missingStructureWarnings = new Set();














    function addStructure(
        structureType,
        structureNumber,
        distance,
        railIndex = 0,
        lateral = 0,
        vertical = 0,
        yaw = 0,
        pitch = 0,
        roll = 0,
        scaleX = 1,
        headingEndDistance = null,
        poleAdditionalRails = null,
        instanceMetadata = null
    ) {
        var modelIndex = findModelIndex(
            structureType,
            structureNumber,
            poleAdditionalRails
        );

        if (modelIndex === null) {
            var warningKey =
            String(structureType).toLowerCase() + ":" +
            String(structureNumber) + ":" +
            String(poleAdditionalRails ?? "");

            if (!missingStructureWarnings.has(warningKey)) {
                missingStructureWarnings.add(warningKey);

                console.warn(
                    "[Route objects] Missing or unloaded structure:",
                    {
                        type: structureType,
                        index: structureNumber,
                        additionalRails: poleAdditionalRails
                    }
                );
            }

            return false;
        }

        var typeKey = String(structureType).toLowerCase();

        var isFreeObject = typeKey === "freeobj";
        var isGround = typeKey === "ground";
        var isRail = typeKey === "rail";

        var isWall = [
            "wall", "walll", "wallr"
        ].includes(typeKey);

        var isDike = [
            "dike", "dikel", "diker"
        ].includes(typeKey);

        var isForm = [
            "form", "forml", "formr",
            "formcl", "formcr"
        ].includes(typeKey);

        var isRoof = [
            "roofl", "roofr", "roofcl", "roofcr"
        ].includes(typeKey);

        var followsOwnRail =
        isRail || isWall || isDike || isForm || isRoof || isGround;

        var objectYaw = Number(yaw || 0);
        var objectPitch = Number(pitch || 0);

        var pitchFollowsTrack = false;
        var pitchStartDistance = distance;
        var pitchEndDistance = null;

        // ------------------------------------------------------------
        // FREEOBJECTS
        // Preserve the working block-based yaw.
        // Pitch is controlled by freeobj_follow_pitch.
        // ------------------------------------------------------------

        if (isFreeObject) {
            var rotationBlockLength = getConfiguredBlockLength();

            var blockStart =
            Math.floor(distance / rotationBlockLength) *
            rotationBlockLength;

            var blockEnd =
            blockStart + rotationBlockLength;

            var localHeading =
            sampleGeometryAt(distance).heading;

            var blockHeading = averageTrackHeading(
                blockStart,
                blockEnd
            );

            var freeObjHeadingCorrection =
            blockHeading - localHeading;

            while (freeObjHeadingCorrection > Math.PI) {
                freeObjHeadingCorrection -= Math.PI * 2;
            }

            while (freeObjHeadingCorrection < -Math.PI) {
                freeObjHeadingCorrection += Math.PI * 2;
            }

            objectYaw +=
            freeObjHeadingCorrection * 180 / Math.PI;

            pitchFollowsTrack =
            typeof freeobj_follow_pitch !== "undefined" &&
            freeobj_follow_pitch === true;

            var freeObjPitchStep = TRACK_DRAW_STEP;

            pitchEndDistance = Math.min(
                maxDistance,
                distance + TRACK_DRAW_STEP
            );

            // ------------------------------------------------------------
            // WALLS, DIKES, FORMS, ROOFS AND GROUND
            // Yaw follows the actual path of their reference rail.
            // Pitch follows that rail only when its setting is enabled.
            // ------------------------------------------------------------

        } else if (
            followsOwnRail &&
            headingEndDistance !== null &&
            Number.isFinite(Number(headingEndDistance)) &&
            Number(headingEndDistance) > distance
        ) {
            var orientationEnd = Number(headingEndDistance);

            var routeStep = TRACK_DRAW_STEP;

            if (!Number.isFinite(routeStep) || routeStep <= 0) {
                routeStep = 1;
            }

            var sampleStep = TRACK_DRAW_STEP;

            var sumSin = 0;
            var sumCos = 0;

            var totalHorizontalDistance = 0;

            var previousPoint = getRailWorldPoint(
                railIndex,
                distance
            );

            var railPathValid = !!previousPoint;
            var currentDistance = distance;

            while (
                railPathValid &&
                currentDistance < orientationEnd - 1e-7
            ) {
                var nextDistance = Math.min(
                    currentDistance + sampleStep,
                    orientationEnd
                );

                var nextPoint = getRailWorldPoint(
                    railIndex,
                    nextDistance
                );

                if (!nextPoint) {
                    railPathValid = false;
                    break;
                }

                var dx = nextPoint.x - previousPoint.x;
                var dz = nextPoint.z - previousPoint.z;

                var horizontalDistance = Math.hypot(dx, dz);

                if (horizontalDistance > 1e-9) {
                    var segmentHeading = Math.atan2(dx, dz);

                    sumSin +=
                    Math.sin(segmentHeading) * horizontalDistance;

                    sumCos +=
                    Math.cos(segmentHeading) * horizontalDistance;

                    totalHorizontalDistance += horizontalDistance;
                }

                previousPoint = nextPoint;
                currentDistance = nextDistance;
            }

            if (
                railPathValid &&
                totalHorizontalDistance > 1e-9 &&
                Math.hypot(sumSin, sumCos) > 1e-12
            ) {
                var ownRailHeading = Math.atan2(
                    sumSin,
                    sumCos
                );

                var baseHeading =
                sampleGeometryAt(distance).heading;

                var ownHeadingCorrection =
                ownRailHeading - baseHeading;

                while (ownHeadingCorrection > Math.PI) {
                    ownHeadingCorrection -= Math.PI * 2;
                }

                while (ownHeadingCorrection < -Math.PI) {
                    ownHeadingCorrection += Math.PI * 2;
                }

                objectYaw +=
                ownHeadingCorrection * 180 / Math.PI;
            }

            // Select the independent pitch setting for this structure.
            if (isWall) {
                pitchFollowsTrack =
                typeof wall_follow_pitch !== "undefined" &&
                wall_follow_pitch === true;

            } else if (isDike) {
                pitchFollowsTrack =
                typeof dike_follow_pitch !== "undefined" &&
                dike_follow_pitch === true;

            } else if (isForm) {
                pitchFollowsTrack =
                typeof form_follow_pitch !== "undefined" &&
                form_follow_pitch === true;

            } else if (isGround) {
                pitchFollowsTrack =
                typeof ground_follow_pitch !== "undefined" &&
                ground_follow_pitch === true;
            }

            // Roofs and canopies intentionally remain level.
            pitchStartDistance = distance;
            pitchEndDistance = orientationEnd;

            // ------------------------------------------------------------
            // ALL OTHER STRUCTURES
            // Preserve the previous rotation behaviour, including poles.
            // ------------------------------------------------------------

        } else if (
            headingEndDistance !== null &&
            Number.isFinite(Number(headingEndDistance)) &&
            Number(headingEndDistance) > distance
        ) {
            var startHeading =
            sampleGeometryAt(distance).heading;

            var segmentHeading = averageTrackHeading(
                distance,
                Number(headingEndDistance)
            );

            var headingCorrection =
            segmentHeading - startHeading;

            while (headingCorrection > Math.PI) {
                headingCorrection -= Math.PI * 2;
            }

            while (headingCorrection < -Math.PI) {
                headingCorrection += Math.PI * 2;
            }

            objectYaw +=
            headingCorrection * 180 / Math.PI;
        }

        // ------------------------------------------------------------
        // APPLY TRACK PITCH WHEN ENABLED
        // Calculate it from the selected reference rail.
        // ------------------------------------------------------------

        if (
            pitchFollowsTrack &&
            Number.isFinite(pitchEndDistance) &&
            pitchEndDistance > pitchStartDistance
        ) {
            var pitchStep = TRACK_DRAW_STEP;

            if (!Number.isFinite(pitchStep) || pitchStep <= 0) {
                pitchStep = 1;
            }

            pitchStep = Math.max(
                0.5,
                Math.min(pitchStep, 2.5)
            );

            var pitchStartPoint = getRailWorldPoint(
                railIndex,
                pitchStartDistance
            );

            if (pitchStartPoint) {
                var pitchPreviousPoint = pitchStartPoint;

                var totalPitchHorizontal = 0;
                var totalPitchVertical = 0;

                var pitchPathValid = true;

                for (
                    var pitchDistance =
                    pitchStartDistance + pitchStep;
                pitchDistance < pitchEndDistance;
                pitchDistance += pitchStep
                ) {
                    var pitchPoint = getRailWorldPoint(
                        railIndex,
                        pitchDistance
                    );

                    if (!pitchPoint) {
                        pitchPathValid = false;
                        break;
                    }

                    totalPitchHorizontal += Math.hypot(
                        pitchPoint.x - pitchPreviousPoint.x,
                        pitchPoint.z - pitchPreviousPoint.z
                    );

                    totalPitchVertical +=
                    pitchPoint.y - pitchPreviousPoint.y;

                    pitchPreviousPoint = pitchPoint;
                }

                if (pitchPathValid) {
                    var pitchEndPoint = getRailWorldPoint(
                        railIndex,
                        pitchEndDistance
                    );

                    if (pitchEndPoint) {
                        totalPitchHorizontal += Math.hypot(
                            pitchEndPoint.x - pitchPreviousPoint.x,
                            pitchEndPoint.z - pitchPreviousPoint.z
                        );

                        totalPitchVertical +=
                        pitchEndPoint.y - pitchPreviousPoint.y;

                        if (totalPitchHorizontal > 1e-9) {
                            objectPitch +=
                            -Math.atan2(
                                totalPitchVertical,
                                totalPitchHorizontal
                            ) * 180 / Math.PI;
                        }
                    }
                }
            }
        }

        return addModel(
            modelIndex,
            distance,
            railIndex,
            lateral,
            vertical,
            objectYaw,
            objectPitch,
            roll,
            scaleX,
            instanceMetadata
        );
    }

















    // ------------------------------------------------------------
    // 6. SINGLE-PLACEMENT OBJECTS
    //
    // FreeObj and Beacon are placed only where their events occur.
    // Their reference rail and placement offsets are respected.
    // ------------------------------------------------------------

    for (var e of events) {
        var kind = getEventKind(e);

        if (kind === 'freeobj') {
            var freeObjNumber = getStructureNumber(e);
            var freeObjRail = getNumber(e, ['rail', 'railIndex'], 0);

            var freeObjX = getNumber(
                e,
                ['x', 'offsetX', 'lateral'],
                0
            );

            var freeObjY = getNumber(
                e,
                ['y', 'offsetY', 'vertical'],
                0
            );

            var freeObjYaw = getNumber(
                e,
                ['yaw', 'rotation', 'rotate'],
                0
            );

            var freeObjPitch = getNumber(e, ['pitch'], 0);
            var freeObjRoll = getNumber(e, ['roll'], 0);

            addStructure(
                'FreeObj',
                freeObjNumber,
                e.distance,
                freeObjRail,
                freeObjX,
                freeObjY,
                freeObjYaw,
                freeObjPitch,
                freeObjRoll
            );
        } else if (kind === 'beacon') {
            addStructure(
                'Beacon',
                getStructureNumber(e),
                         e.distance,
                         getNumber(e, ['rail', 'railIndex'], 0),
                         getNumber(e, ['x', 'offsetX'], 0),
                         getNumber(e, ['y', 'offsetY'], 0),
                         getNumber(e, ['yaw', 'rotation'], 0),
                         getNumber(e, ['pitch'], 0),
                         getNumber(e, ['roll'], 0)
            );
        }
    }

    // ------------------------------------------------------------
    // 7. REPEATING STRUCTURES
    //
    // These are stateful route commands. For example, a wall remains
    // active until a WallEnd or another Wall command changes it.
    //
    // Standard BVE block length is 25 metres. If the application
    // defines BLOCK_LENGTH, use that instead.
    // ------------------------------------------------------------

    var OBJECT_BLOCK_LENGTH = getConfiguredBlockLength();

    var repeatEvents = events
    .filter(e => {
        var k = getEventKind(e);

        return [
            'wall', 'walll', 'wallr', 'wallend',
            'dike', 'dikel', 'diker', 'dikeend',
            'pole', 'poleend',
            'ground',
            'crack', 'crackl', 'crackr',
            'form', 'formend',
            'forml', 'formr', 'formcl', 'formcr',
            'roofl', 'roofr', 'roofcl', 'roofcr'
        ].includes(k);
    })
    .sort((a, b) =>
    (a.distance - b.distance) ||
    ((a.order || 0) - (b.order || 0))
    );

    // Active walls and dikes use a separate state per reference rail
    // and per side.
    var activeWalls = new Map();
    var activeDikes = new Map();

    // Active pole command for each reference rail.
    var activePoles = new Map();

    // Ground selection for the current route section.
    var activeGround = null;

    // Active crack and form commands.
    var activeCracks = new Map();
    var activeForms = new Map();

    // Direct repeating structure types, for parsers that emit them
    // as individual events instead of a combined Form/Crack command.
    var activeDirectStructures = new Map();

    function sideKey(railIndex, side) {
        return String(railIndex) + ':' + side;
    }

    function clearRailStructures(map, railIndex) {
        var prefix = String(railIndex) + ':';

        for (var key of map.keys()) {
            if (key.startsWith(prefix)) {
                map.delete(key);
            }
        }
    }

    function setSideStructure(
        map,
        structureType,
        structureNumber,
        distance,
        railIndex,
        side
    ) {
        var key = sideKey(railIndex, side);

        map.set(key, {
            type: structureType,
            index: structureNumber,
            rail: railIndex,
            side: side,
            startDistance: distance
        });
    }

    // Apply a route command to the active structure state.
    function applyRepeatEvent(e) {
        var k = getEventKind(e);
        var distance = Number(e.distance);
        var railIndex = getNumber(e, ['rail', 'railIndex'], 0);
        var index = getStructureNumber(e, k);

        if (!Number.isFinite(distance)) return;

        // ---------------- WALLS ----------------

        // ---------------- WALLS ----------------

        if (k === 'wallend') {
            // WallEnd stops both sides for this reference rail.
            clearRailStructures(activeWalls, railIndex);
            return;
        }

        if (k === 'wall' || k === 'walll' || k === 'wallr') {
            var direction =
            k === 'walll' ? -1 :
            k === 'wallr' ? 1 :
            getNumber(e, ['direction', 'side'], 0);

            // A new Wall command replaces the wall selection on this rail.
            clearRailStructures(activeWalls, railIndex);

            if (direction <= 0) {
                setSideStructure(
                    activeWalls, 'WallL', index, distance, railIndex, 'L'
                );
            }

            if (direction >= 0) {
                setSideStructure(
                    activeWalls, 'WallR', index, distance, railIndex, 'R'
                );
            }

            return;
        }

        // ---------------- DIKES ----------------

        if (k === 'dikeend') {
            // DikeEnd stops both sides for this reference rail.
            clearRailStructures(activeDikes, railIndex);
            return;
        }

        if (k === 'dike' || k === 'dikel' || k === 'diker') {
            var dikeDirection =
            k === 'dikel' ? -1 :
            k === 'diker' ? 1 :
            getNumber(e, ['direction', 'side'], 0);

            // A new Dike command replaces the dike selection on this rail.
            clearRailStructures(activeDikes, railIndex);

            if (dikeDirection <= 0) {
                setSideStructure(
                    activeDikes, 'DikeL', index, distance, railIndex, 'L'
                );
            }

            if (dikeDirection >= 0) {
                setSideStructure(
                    activeDikes, 'DikeR', index, distance, railIndex, 'R'
                );
            }

            return;
        }

        // ---------------- POLES ----------------

        if (k === 'poleend') {
            activePoles.delete(String(railIndex));
            return;
        }

        if (k === 'pole') {
            var rawIntervalMeters = e.intervalMeters;
            var intervalMeters;

            if (
                rawIntervalMeters !== undefined &&
                rawIntervalMeters !== null &&
                rawIntervalMeters !== '' &&
                Number.isFinite(Number(rawIntervalMeters)) &&
                Number(rawIntervalMeters) > 0
            ) {
                intervalMeters = Number(rawIntervalMeters);
            } else {
                var intervalBlocks = getNumber(
                    e,
                    ['interval', 'intervalBlocks'],
                    1
                );

                intervalMeters =
                Math.max(1, intervalBlocks) * OBJECT_BLOCK_LENGTH;
            }

            activePoles.set(String(railIndex), {
                index: index,
                rail: railIndex,
                startDistance: distance,
                intervalMeters: Math.max(
                    OBJECT_BLOCK_LENGTH,
                    intervalMeters
                ),
                additionalRails: getNumber(
                    e,
                    ['additionalRails', 'numberOfAdditionalRails',
                    'additionalRailsCovered'],
                    0
                ),
                location: getNumber(e, ['location'], 0)
            });

            return;
        }

        // ---------------- GROUND ----------------

        if (k === 'ground') {
            activeGround = {
                index: getNumber(
                    e,
                    ['cycle', 'groundIndex', 'cycleIndex', 'index', 'number'],
                    0
                ),
                startDistance: distance
            };

            return;
        }

        // ---------------- CRACKS ----------------

        if (k === 'crack') {
            var rail1 = getNumber(
                e,
                ['rail1', 'railIndex1', 'leftRail'],
                0
            );

            var rail2 = getNumber(
                e,
                ['rail2', 'railIndex2', 'rightRail'],
                0
            );

            activeCracks.set(rail1 + ':' + rail2, {
                index: getNumber(
                    e,
                    ['structure', 'crackIndex', 'structureIndex', 'index'],
                    0
                ),
                rail1: rail1,
                rail2: rail2,
                startDistance: distance
            });

            return;
        }

        if (k === 'crackl' || k === 'crackr') {
            activeDirectStructures.set(
                k + ':' + railIndex,
                {
                    type: k === 'crackl' ? 'CrackL' : 'CrackR',
                    index: index,
                    rail: railIndex,
                    startDistance: distance,
                    lateral: getNumber(e, ['x', 'offsetX'], 0),
                                       vertical: getNumber(e, ['y', 'offsetY'], 0)
                }
            );

            return;
        }

        // ---------------- FORMS AND ROOFS ----------------//todo

        if (k === 'formend') {
            activeForms.clear();
            return;
        }


        if (k === 'form') {
            var formRail1 = getNumber(
                e,
                ['rail1', 'railIndex1', 'leftRail'],
                0
            );

            var formRail2Value = e.rail2;

            var formRail2 =
            typeof formRail2Value === 'string' &&
            ['L', 'R'].includes(formRail2Value.trim().toUpperCase())
            ? formRail2Value.trim().toUpperCase()
            : getNumber(
                e,
                ['rail2', 'railIndex2', 'rightRail'],
                0
            );

            var formIndex = getNumber(
                e,
                ['formStructure', 'formIndex', 'formStructureIndex'],
                0
            );

            var roofIndex = getNumber(
                e,
                ['roofStructure', 'roofIndex', 'roofStructureIndex'],
                0
            );

            // Suppress the extra Northfield platform:
            // .Form 1;2;0;3
            // Only suppress it when the same route line also defines
            // both an L platform and an R platform.
            if (
                typeof formRail2 === 'number' &&
                formRail1 === 1 &&
                    formRail2 === 2 &&
                        roofIndex === 0 &&
                        formIndex === 3
            ) {
                var sameLineForms = events.filter(function (other) {
                    return (
                        other.type === 'form' &&
                        other.line === e.line
                    );
                });

                var hasLeftForm = sameLineForms.some(function (other) {
                    return (
                        typeof other.rail2 === 'string' &&
                        other.rail2.trim().toUpperCase() === 'L'
                    );
                });

                var hasRightForm = sameLineForms.some(function (other) {
                    return (
                        typeof other.rail2 === 'string' &&
                        other.rail2.trim().toUpperCase() === 'R'
                    );
                });

                if (hasLeftForm && hasRightForm) {
                    return;
                }
            }

            activeForms.set(formRail1 + ':' + formRail2, {
                rail1: formRail1,
                rail2: formRail2,
                formIndex: formIndex,
                    roofIndex: roofIndex,
                    startDistance: distance
            });

            return;
        }


        // Handle individual repeating structure commands where present.
        if ([
            'forml', 'formr', 'formcl', 'formcr',
            'roofl', 'roofr', 'roofcl', 'roofcr'
        ].includes(k)) {
            var canonicalType = {
                forml: 'FormL',
                    formr: 'FormR',
                        formcl: 'FormCL',
                            formcr: 'FormCR',
                                roofl: 'RoofL',
                                roofr: 'RoofR',
                                roofcl: 'RoofCL',
                                roofcr: 'RoofCR'
            }[k];

            activeDirectStructures.set(
                k + ':' + railIndex,
                {
                    type: canonicalType,
                    index: index,
                    rail: railIndex,
                    startDistance: distance,
                    lateral: getNumber(e, ['x', 'offsetX'], 0),
                                       vertical: getNumber(e, ['y', 'offsetY'], 0)
                }
            );
        }
    }
    // ------------------------------------------------------------
    // RAIL OBJECT SELECTION AND PLACEMENT
    //
    // Rail objects repeat once per route block while their physical
    // rail run is active. RailType selects Structure.Rail(index).
    // Cycle.Rail uses the absolute route block position.
    // ------------------------------------------------------------

    var railStructureModelCache = new Map();

    function getRailObjectStructureIndex(railType, blockDistance) {
        var structureIndex = Number(railType);

        if (!Number.isSafeInteger(structureIndex) || structureIndex < 0) {
            return null;
        }

        var cycle = railCycles[String(structureIndex)];

        if (Array.isArray(cycle) && cycle.length > 0) {
            var blockIndex = Math.floor(
                (blockDistance + 1e-7) / OBJECT_BLOCK_LENGTH
            );

            var cycleIndex =
            ((blockIndex % cycle.length) + cycle.length) % cycle.length;

            structureIndex = Number(cycle[cycleIndex]);
        }

        return Number.isSafeInteger(structureIndex) && structureIndex >= 0
        ? structureIndex
        : null;
    }


    function addRailObject(
        railIndex,
        railType,
        blockDistance,
        segmentEndDistance,
        railRun = null
    ) {
        var structureIndex = getRailObjectStructureIndex(
            railType,
            blockDistance
        );

        if (structureIndex === null) return;

        // A RailType is allowed to have no corresponding Structure.Rail.
        // Cache the lookup and silently omit that object when it is absent.
        if (!railStructureModelCache.has(structureIndex)) {
            railStructureModelCache.set(
                structureIndex,
                findModelIndex('Rail', structureIndex)
            );
        }

        if (railStructureModelCache.get(structureIndex) === null) {
            return;
        }

        var objectRailIndex = Number(railIndex) || 0;
        var objectLateral = 0;
        var objectVertical = 0;

        // buildRailTracks deliberately omits an additional rail when its
        // entire run overlaps the master rail. Its Rail object still belongs
        // at that position, so use rail 0 plus the authored small offset.
        if (
            objectRailIndex > 0 &&
            !getRailOffset(objectRailIndex, blockDistance)
        ) {
            var rawOffset = railRun
            ? interpolateRailOffset(railRun, blockDistance)
            : null;

            if (!rawOffset) return;

            var maxAbsOffset = Math.max(
                Math.abs(Number(rawOffset.x) || 0),
                                        Math.abs(Number(rawOffset.y) || 0)
            );

            if (maxAbsOffset >= 0.001) return;

            objectRailIndex = 0;
            objectLateral = Number(rawOffset.x) || 0;
            objectVertical = Number(rawOffset.y) || 0;
        }

        addStructure(
            'Rail',
            structureIndex,
            blockDistance,
            objectRailIndex,
            objectLateral,
            objectVertical,
            0, 0, 0, 1,
            segmentEndDistance
        );
    }
    // ------------------------------------------------------------
    // 8. WALK THE ROUTE IN BLOCKS AND CREATE REPEATED INSTANCES
    // ------------------------------------------------------------

    var repeatEventIndex = 0;
    var mainRailTypeEventIndex = 0;
    var activeMainRailType = 0;

    for (
        var blockDistance = 0;
    blockDistance <= repeatStructureEndDistance + 1e-6;
    blockDistance += OBJECT_BLOCK_LENGTH
    ) {
        // Form and crack commands apply to their specified blocks.
        activeForms.clear();
        activeCracks.clear();
        activeDirectStructures.clear();

        // Apply all commands that have reached this block.
        while (
            repeatEventIndex < repeatEvents.length &&
            repeatEvents[repeatEventIndex].distance <= blockDistance + 1e-6
        ) {
            applyRepeatEvent(repeatEvents[repeatEventIndex]);
            repeatEventIndex++;
        }

        // Apply all main-rail RailType changes reached by this block.
        while (
            mainRailTypeEventIndex < mainRailTypeEvents.length &&
            mainRailTypeEvents[mainRailTypeEventIndex].distance <= blockDistance + 1e-6
        ) {
            var mainRailTypeValue = Number(
                mainRailTypeEvents[mainRailTypeEventIndex].railType
            );

            if (
                Number.isSafeInteger(mainRailTypeValue) &&
                mainRailTypeValue >= 0
            ) {
                activeMainRailType = mainRailTypeValue;
            }

            mainRailTypeEventIndex++;
        }

        // The end distance used for block-length scenery.
        var segmentEndDistance =
        blockDistance + OBJECT_BLOCK_LENGTH;

        // ---------------- RAIL OBJECTS ----------------

        // Rail 0 is the implicit player's rail and is active throughout.
        addRailObject(
            0,
            activeMainRailType,
            blockDistance,
            segmentEndDistance
        );

        // Additional rails repeat their selected Rail object from the
        // RailStart/Rail beginning up to, but not including, RailEnd.
        for (var railObjectRun of railObjectRuns) {
            if (
                !railObjectRun.points ||
                !railObjectRun.points.length
            ) {
                continue;
            }

            var railRunStart = Number(railObjectRun.points[0].d);
            var railRunEnd = Number(railObjectRun.endDistance);

            if (
                !Number.isFinite(railRunStart) ||
                !Number.isFinite(railRunEnd) ||
                blockDistance < railRunStart - 1e-6 ||
                blockDistance >= railRunEnd - 1e-6
            ) {
                continue;
            }

            var activeRailType = getRailTypeAtDistance(
                railObjectRun,
                blockDistance
            );

            addRailObject(
                railObjectRun.rail,
                activeRailType,
                blockDistance,
                segmentEndDistance,
                railObjectRun
            );
        }

        // ---------------- WALLS ----------------

        // ---------------- WALLS ----------------

        for (var wall of activeWalls.values()) {
            if (blockDistance < wall.startDistance - 1e-6) {
                continue;
            }

            addStructure(
                wall.type,
                wall.index,
                blockDistance,
                wall.rail,
                0, 0, 0, 0, 0, 1,
                segmentEndDistance
            );
        }

        // ---------------- DIKES ----------------

        for (var dike of activeDikes.values()) {
            if (blockDistance < dike.startDistance - 1e-6) {
                continue;
            }

            addStructure(
                dike.type,
                dike.index,
                blockDistance,
                dike.rail,
                0, 0, 0, 0, 0, 1,
                segmentEndDistance
            );
        }

        // ---------------- POLES ----------------


        for (var pole of activePoles.values()) {
            if (blockDistance < pole.startDistance - 1e-6) continue;

            var interval = pole.intervalMeters;

            if (!Number.isFinite(interval) || interval <= 0) continue;

            // Interval controls pole placement frequency and is measured
            // from the route origin, not from the Pole command distance.
            var multiple = blockDistance / interval;

            var isPlacementDistance =
            Math.abs(multiple - Math.round(multiple)) < 1e-6;

            if (!isPlacementDistance) continue;

            // For a single-rail pole, Location chooses the side.
            // With additional rails, it specifies the lateral offset.
            var poleLateral = pole.additionalRails >= 1
            ? pole.location * 3.8
            : 0;

            var poleScaleX =
            pole.additionalRails === 0 && pole.location > 0
            ? -1
            : 1;

            // Use the block end for the object's orientation.
            // Do not use the pole interval as the segment length.
            var segmentEndDistance =
            blockDistance + OBJECT_BLOCK_LENGTH;

            addStructure(
                'Pole',
                pole.index,
                blockDistance,
                pole.rail,
                poleLateral,
                0,
                0,
                0,
                0,
                poleScaleX,
                segmentEndDistance,
                pole.additionalRails
            );
        }


        // ---------------- GROUND ----------------

        // ---------------- GROUND ----------------

        if (
            activeGround &&
            blockDistance >= activeGround.startDistance - 1e-6
        ) {
            var groundStructureIndex = activeGround.index;
            var cycle = groundCycles[String(activeGround.index)];

            // If the cycle exists, select its entry using the absolute
            // route block number. The cycle phase starts at route position 0.
            if (Array.isArray(cycle) && cycle.length > 0) {
                var blockIndex = Math.floor(
                    (blockDistance + 1e-7) / OBJECT_BLOCK_LENGTH
                );

                groundStructureIndex =
                cycle[blockIndex % cycle.length];
            }

            var groundClearance = heightAboveGroundAt(blockDistance);

            addStructure(
                'Ground',
                groundStructureIndex,
                blockDistance,
                0,
                0,
                -groundClearance,
                0, 0, 0, 1,
                segmentEndDistance
            );
        }

        // ---------------- CRACKS ----------------

        for (var crack of activeCracks.values()) {
            if (blockDistance < crack.startDistance - 1e-6) continue;

            addStructure(
                'CrackL',
                crack.index,
                blockDistance,
                crack.rail1,
                0, 0, 0, 0, 0, 1,
                segmentEndDistance
            );

            addStructure(
                'CrackR',
                crack.index,
                blockDistance,
                crack.rail2,
                0, 0, 0, 0, 0, 1,
                segmentEndDistance
            );
        }

        // ---------------- FORMS AND ROOFS ----------------

        for (var form of activeForms.values()) {
            if (blockDistance < form.startDistance - 1e-6) continue;

            // Special L/R forms are placed without deformation.
            if (form.rail2 === "L" || form.rail2 === "R") {
                var side = form.rail2;

                addStructure(
                    "Form" + side,
                    form.formIndex,
                        blockDistance,
                        form.rail1,
                            0, 0, 0, 0, 0, 1,
                             segmentEndDistance
                );

                addStructure(
                    "FormC" + side,
                    form.formIndex,
                        blockDistance,
                        form.rail1,
                            0, 0, 0, 0, 0, 1,
                             segmentEndDistance
                );

                if (form.roofIndex > 0) {
                    addStructure(
                        "Roof" + side,
                        form.roofIndex,
                            blockDistance,
                            form.rail1,
                                0, 0, 0, 0, 0, 1,
                                 segmentEndDistance
                    );
                }

                continue;
            }

            // Numeric second rail: this is a deformable form.
            var rail1 = Number(form.rail1);
            var rail2 = Number(form.rail2);

            if (
                !Number.isInteger(rail1) ||
                !Number.isInteger(rail2) ||
                rail1 < 0 ||
                rail2 < 0
            ) {
                console.warn("[Track.Form] Invalid rail pair:", form);
                continue;
            }

            var nearRail1 = getRailWorldPoint(rail1, blockDistance);
            var nearRail2 = getRailWorldPoint(rail2, blockDistance);
            var farRail1 = getRailWorldPoint(rail1, segmentEndDistance);
            var farRail2 = getRailWorldPoint(rail2, segmentEndDistance);

            if (!nearRail1 || !nearRail2 || !farRail1 || !farRail2) {
                console.warn(
                    "[Track.Form] Cannot resolve both rails for platform:",
                    {
                        distance: blockDistance,
                        rail1: rail1,
                        rail2: rail2
                    }
                );
                continue;
            }

            // Determine the side using track-relative rail offsets,
            // not world-space coordinates.
            var railOffset1 = getRailOffset(rail1, blockDistance);
            var railOffset2 = getRailOffset(rail2, blockDistance);

            if (
                !railOffset1 ||
                !railOffset2 ||
                !Number.isFinite(railOffset1.x) ||
                !Number.isFinite(railOffset2.x)
            ) {
                console.warn(
                    "[Track.Form] Cannot determine platform side:",
                    { distance: blockDistance, rail1, rail2 }
                );
                continue;
            }

            // Positive difference means rail 2 is to the right of rail 1.
            var sideDifference = railOffset2.x - railOffset1.x;

            if (Math.abs(sideDifference) < 1e-6) {
                console.warn(
                    "[Track.Form] Rails have no clear lateral separation:",
                    { distance: blockDistance, rail1, rail2 }
                );
                continue;
            }

            var formSide = sideDifference > 0 ? "R" : "L";

            addStructure(
                "Form" + formSide,
                form.formIndex,
                    blockDistance,
                    rail1,
                    0, 0, 0, 0, 0, 1,
                    segmentEndDistance
            );

            // Preserve the two rail boundaries for the deformation step.
            addStructure(
                "FormC" + formSide,
                form.formIndex,
                    blockDistance,
                    rail1,
                    0, 0, 0, 0, 0, 1,
                    segmentEndDistance,
                    null,
                    {
                        formDeform: {
                            rail1: rail1,
                            rail2: rail2,
                            nearRail1: nearRail1,
                            nearRail2: nearRail2,
                            farRail1: farRail1,
                            farRail2: farRail2,
                            nearDistance: blockDistance,
                            farDistance: segmentEndDistance
                        }
                    }
            );

            if (form.roofIndex > 0) {
                addStructure(
                    "Roof" + formSide,
                    form.roofIndex,
                        blockDistance,
                        rail1,
                        0, 0, 0, 0, 0, 1,
                        segmentEndDistance
                );
            }

            // Numeric rail pairs still require mesh deformation
            // between rails; addStructure() does not implement that.
        }

        // ---------------- OTHER REPEATING STRUCTURES ----------------

        for (var structure of activeDirectStructures.values()) {
            if (blockDistance < structure.startDistance - 1e-6) continue;

            addStructure(
                structure.type,
                structure.index,
                blockDistance,
                structure.rail,
                structure.lateral,
                structure.vertical,
                0, 0, 0, 1,
                segmentEndDistance
            );
        }
    }

    // ------------------------------------------------------------
    // 9. RETURN THE GEOMETRY AND THE NEW 3D OBJECT DATASET
    // ------------------------------------------------------------

    return {
        samples: samples,
        firstRouteDistance: events.firstRouteDistance ?? 0,
        rails: rails,
        stations: stations,
        cracks: events.filter(e => e.type === 'crack'),
        brightnessEvents: brightnessEvents,
        mainRailTypeEvents: mainRailTypeEvents,

        "3dobject": threeDObjects,

        firstStation: stations.length
        ? stations[0].distance
        : 0,

        lastStation: (
            stations.length
            ? stations[stations.length - 1].distance
            : maxDistance
        ) + 2000,

        maxDistance: maxDistance
    };
}


















function smoothStep(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
}

function smootherStep(t) {
    t = clamp(t, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
}

/* ADDITIONAL RAIL TRACKS */
function buildRailTracks(
    events,
    maxDistance,
    routePositions,
    routeSamples
) {
    var EPS = 1e-7;
    var ZERO_RAIL_TOLERANCE = 0.001;
    var byRail = new Map();

    for (var i = 0; i < events.length; i++) {
        var event = events[i];

        if (
            event.type !== 'rail' &&
            event.type !== 'railend' &&
            event.type !== 'railtype'
        ) {
            continue;
        }

        var railNumber = Number(event.rail);

        if (!Number.isSafeInteger(railNumber) || railNumber <= 0) {
            continue;
        }

        if (!byRail.has(railNumber)) {
            byRail.set(railNumber, []);
        }

        byRail.get(railNumber).push({
            event: event,
            order: Number.isFinite(Number(event.order))
            ? Number(event.order)
            : i
        });
    }

    var completedRuns = [];
    var railRunEndpoints = [];

    for (var [rail, orderedEvents] of byRail) {
        orderedEvents.sort((a, b) =>
        (a.event.distance - b.event.distance) ||
        (a.order - b.order)
        );

        var railState = {
            x: 0,
            y: 0,
            railType: 0
        };

        var points = [];
        var railTypeEvents = [];
        var active = false;
        var lastRailUpdateDistance = NaN;

        for (var ordered of orderedEvents) {
            var event = ordered.event;
            var distance = Number(event.distance);

            if (!Number.isFinite(distance)) continue;

            // ------------------------------------------------
            // RAIL END
            // ------------------------------------------------

            if (event.type === 'railend') {
                var railEndSuppliedX =
                event.offsetX !== undefined &&
                event.offsetX !== null &&
                String(event.offsetX).trim() !== '' &&
                Number.isFinite(Number(event.offsetX));

                var railEndSuppliedY =
                event.offsetY !== undefined &&
                event.offsetY !== null &&
                String(event.offsetY).trim() !== '' &&
                Number.isFinite(Number(event.offsetY));

                if (railEndSuppliedX) {
                    railState.x = Number(event.offsetX);
                }

                if (railEndSuppliedY) {
                    railState.y = Number(event.offsetY);
                }

                if (active && points.length) {
                    if (railEndSuppliedX || railEndSuppliedY) {
                        var lastPoint = points[points.length - 1];

                        if (distance > lastPoint.d + EPS) {
                            points.push({
                                d: distance,
                                x: railState.x,
                                y: railState.y
                            });
                        } else if (Math.abs(distance - lastPoint.d) <= EPS) {
                            lastPoint.x = railState.x;
                            lastPoint.y = railState.y;
                        }
                    }

                    completedRuns.push({
                        rail: rail,
                        points: points,
                        railTypeEvents: railTypeEvents,
                        endDistance: distance
                    });

                    railRunEndpoints.push({
                        rail: rail,
                        startDistance: points[0].d,
                        endDistance: distance
                    });
                }

                points = [];
                railTypeEvents = [];
                active = false;
                lastRailUpdateDistance = NaN;
                continue;
            }

            // ------------------------------------------------
            // RAIL TYPE
            //
            // A type change must not become an X/Y interpolation
            // control point.
            // ------------------------------------------------

            if (event.type === 'railtype') {
                if (!active) continue;

                if (
                    event.railType !== undefined &&
                    event.railType !== null &&
                    String(event.railType).trim() !== '' &&
                    Number.isFinite(Number(event.railType)) &&
                    Number(event.railType) >= 0
                ) {
                    railState.railType = Number(event.railType);

                    railTypeEvents.push({
                        d: distance,
                        railType: railState.railType,
                        order: ordered.order
                    });
                }

                continue;
            }

            if (event.type !== 'rail') continue;

            // ------------------------------------------------
            // RAIL / RAIL START
            // ------------------------------------------------

            var isRailStart =
            String(event.command || '').toLowerCase() === 'railstart';

            if (!isRailStart && lastRailUpdateDistance === distance) {
                continue;
            }

            if (isRailStart) {
                lastRailUpdateDistance = NaN;

                // Close the old run at the real RailStart distance.
                // Do not move its geometry to a detection offset.
                if (active && points.length) {
                    completedRuns.push({
                        rail: rail,
                        points: points,
                        railTypeEvents: railTypeEvents,
                        endDistance: distance
                    });

                    railRunEndpoints.push({
                        rail: rail,
                        startDistance: points[0].d,
                        endDistance: distance
                    });
                }

                points = [];
                railTypeEvents = [];
                active = false;

            } else {
                lastRailUpdateDistance = distance;
            }

            var suppliedX =
            event.offsetX !== undefined &&
            event.offsetX !== null &&
            String(event.offsetX).trim() !== '' &&
            Number.isFinite(Number(event.offsetX));

            var suppliedY =
            event.offsetY !== undefined &&
            event.offsetY !== null &&
            String(event.offsetY).trim() !== '' &&
            Number.isFinite(Number(event.offsetY));

            var suppliedRailType =
            event.railType !== undefined &&
            event.railType !== null &&
            String(event.railType).trim() !== '' &&
            Number.isFinite(Number(event.railType)) &&
            Number(event.railType) >= 0;

            if (suppliedX) {
                railState.x = Number(event.offsetX);
            }

            if (suppliedY) {
                railState.y = Number(event.offsetY);
            }

            if (suppliedRailType) {
                railState.railType = Number(event.railType);
            }

            // Start a new run at the actual command position.
            if (!active) {
                points = [{
                    d: distance,
                    x: railState.x,
                    y: railState.y
                }];

                railTypeEvents = [{
                    d: distance,
                    railType: railState.railType,
                    order: ordered.order
                }];

                active = true;
                continue;
            }

            if (suppliedRailType) {
                railTypeEvents.push({
                    d: distance,
                    railType: railState.railType,
                    order: ordered.order
                });
            }

            // Only supplied X/Y values become geometric control points.
            // Other route positions and rail-type-only commands do not
            // create extra fixed points in the offset curve.
            if (suppliedX || suppliedY) {
                var currentLastPoint = points[points.length - 1];

                if (distance > currentLastPoint.d + EPS) {
                    points.push({
                        d: distance,
                        x: railState.x,
                        y: railState.y
                    });

                } else if (Math.abs(distance - currentLastPoint.d) <= EPS) {
                    currentLastPoint.x = railState.x;
                    currentLastPoint.y = railState.y;
                }
            }
        }

        // ------------------------------------------------
        // FINAL ACTIVE RUN
        // ------------------------------------------------

        if (active && points.length) {
            var finalDistance = Number(maxDistance);

            if (
                !Number.isFinite(finalDistance) ||
                finalDistance < points[0].d
            ) {
                finalDistance = points[points.length - 1].d;
            }

            completedRuns.push({
                rail: rail,
                points: points,
                railTypeEvents: railTypeEvents,
                endDistance: finalDistance
            });

            railRunEndpoints.push({
                rail: rail,
                startDistance: points[0].d,
                endDistance: finalDistance
            });
        }
    }

    // ------------------------------------------------------------
    // BUILD THE FINISHED TRACKS
    // ------------------------------------------------------------

    var tracks = [];

    for (var run of completedRuns) {
        var runPoints = run.points;

        if (!Array.isArray(runPoints) || !runPoints.length) {
            continue;
        }

        var maxAbsOffset = 0;

        for (var point of runPoints) {
            maxAbsOffset = Math.max(
                maxAbsOffset,
                Math.abs(Number(point.x) || 0),
                                    Math.abs(Number(point.y) || 0)
            );
        }

        // Do not duplicate the master track, but retain Y-only offsets.
        if (maxAbsOffset < ZERO_RAIL_TOLERANCE) {
            continue;
        }

        var typeEvents = run.railTypeEvents.slice();

        typeEvents.sort((a, b) =>
        (a.d - b.d) ||
        ((a.order || 0) - (b.order || 0))
        );

        var segments = [];

        for (var pointIndex = 0; pointIndex < runPoints.length - 1; pointIndex++) {
            var a = runPoints[pointIndex];
            var b = runPoints[pointIndex + 1];
            var segmentSpan = b.d - a.d;

            if (segmentSpan <= EPS) continue;

            var segmentRailType = typeEvents.length
            ? typeEvents[0].railType
            : 0;

            for (var typeEvent of typeEvents) {
                if (typeEvent.d <= a.d + EPS) {
                    segmentRailType = typeEvent.railType;
                } else {
                    break;
                }
            }

            segments.push({
                a: a,
                b: b,
                dx: b.x - a.x,
                dy: b.y - a.y,
                span: segmentSpan,
                railType: segmentRailType
            });
        }

        var runEndDistance = Number(run.endDistance);
        var lastControlPoint = runPoints[runPoints.length - 1];

        // This is metadata for the active run's extent, not an additional
        // interpolation point. It therefore cannot flatten the last block.
        if (
            Number.isFinite(runEndDistance) &&
            runEndDistance > lastControlPoint.d + EPS
        ) {
            var tailPoint = {
                d: runEndDistance,
                x: lastControlPoint.x,
                y: lastControlPoint.y
            };

            var tailType = typeEvents.length
            ? typeEvents[0].railType
            : 0;

            for (var tailTypeEvent of typeEvents) {
                if (tailTypeEvent.d <= lastControlPoint.d + EPS) {
                    tailType = tailTypeEvent.railType;
                } else {
                    break;
                }
            }

            segments.push({
                a: lastControlPoint,
                b: tailPoint,
                dx: 0,
                dy: 0,
                span: runEndDistance - lastControlPoint.d,
                railType: tailType
            });
        }

        tracks.push({
            rail: run.rail,
            railType: typeEvents.length ? typeEvents[0].railType : 0,
            points: runPoints,
            segments: segments,
            railTypeEvents: typeEvents,

            startDistance: runPoints[0].d,
            endDistance: Number.isFinite(runEndDistance)
            ? runEndDistance
            : lastControlPoint.d,

            totalSpan:
            (Number.isFinite(runEndDistance)
            ? runEndDistance
            : lastControlPoint.d) - runPoints[0].d,

            maxAbsX: runPoints.reduce(
                (maximum, point) => Math.max(maximum, Math.abs(point.x)),
                                      0
            ),

            maxAbsY: runPoints.reduce(
                (maximum, point) => Math.max(maximum, Math.abs(point.y)),
                                      0
            ),

            switchCurves: [],
                switchLimits: []
        });
    }

    buildSwitchSmoothingCurves(
        tracks,
        Array.isArray(routePositions) ? routePositions : [],
                               routeSamples,
                               getConfiguredBlockLength(),
                               railRunEndpoints
    );

    // Retain every authored rail run for Rail structure objects.
    // This includes runs omitted from dynamic track geometry because
    // they overlap the player's rail.
    Object.defineProperty(tracks, 'railObjectRuns', {
        value: completedRuns,
        enumerable: false
    });

    return tracks;
}


// ============================================================
// BUILD COMPLETE SWITCH SMOOTHING CURVES
//
// Facing point:
//     The branch leaves the continuing track.
//
// Non-facing point:
//     The branch curves into the continuing track.
//
// Handover:
//     The new rail inherits a smooth start from the old rail.
//
// Each curve:
//     - Starts at the actual switch position.
//     - Ends at the next relevant fixed position or switch.
//     - Never passes the next fixed block/control position.
//     - Matches the tangent of the track at both ends.
//     - Includes the underlying route curvature.
// ============================================================







function buildSwitchSmoothingCurves(
    tracks,
    fixedPositions,
    routeSamples,
    blockLength,
    railRunEndpoints
) {
    var EPS = 1e-7;
    var ENDPOINT_TOLERANCE = 1.01;

    var blockLimit = Number(blockLength);

    if (!Number.isFinite(blockLimit) || blockLimit <= 0) {
        blockLimit = 25;
    }

    // ------------------------------------------------------------
    // ANGLE HELPERS
    // ------------------------------------------------------------

    function unwrapAngle(angle) {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    }

    function unwrapNear(angle, reference) {
        while (angle - reference > Math.PI) {
            angle -= Math.PI * 2;
        }

        while (angle - reference < -Math.PI) {
            angle += Math.PI * 2;
        }

        return angle;
    }

    // ------------------------------------------------------------
    // RESET SWITCH PATHS.
    // ------------------------------------------------------------

    for (var track of tracks) {
        track.switchCurves = [];
    }

    if (
        !Array.isArray(routeSamples) ||
        routeSamples.length < 2
    ) {
        return;
    }

    // ------------------------------------------------------------
    // MASTER ROUTE SAMPLES AND CURVATURE.
    // ------------------------------------------------------------

    var masterSegments = [];
    var curvatureChanges = [];

    for (var i = 0; i < routeSamples.length - 1; i++) {
        var a = routeSamples[i];
        var b = routeSamples[i + 1];

        var span = Number(b.d) - Number(a.d);

        if (span <= EPS) continue;

        var headingDifference = unwrapAngle(
            Number(b.heading) - Number(a.heading)
        );

        masterSegments.push({
            start: Number(a.d),
                            end: Number(b.d),
                            curvature: headingDifference / span
        });

        if (masterSegments.length > 1) {
            var previousCurvature =
            masterSegments[masterSegments.length - 2].curvature;

            var currentCurvature =
            masterSegments[masterSegments.length - 1].curvature;

            if (
                Math.abs(currentCurvature - previousCurvature) >
                1e-9
            ) {
                curvatureChanges.push(Number(a.d));
            }
        }
    }

    function sampleMasterAt(distance) {
        var first = routeSamples[0];
        var last = routeSamples[routeSamples.length - 1];

        if (distance <= first.d) {
            return {
                d: distance,
                x: first.x,
                y: first.y,
                z: first.z,
                heading: first.heading
            };
        }

        if (distance >= last.d) {
            return {
                d: distance,
                x: last.x,
                y: last.y,
                z: last.z,
                heading: last.heading
            };
        }

        var low = 0;
        var high = routeSamples.length - 1;

        while (low + 1 < high) {
            var middle = Math.floor((low + high) * 0.5);

            if (routeSamples[middle].d <= distance) {
                low = middle;
            } else {
                high = middle;
            }
        }

        var a = routeSamples[low];
        var b = routeSamples[high];

        var span = b.d - a.d;

        if (span <= EPS) {
            return {
                d: distance,
                x: a.x,
                y: a.y,
                z: a.z,
                heading: a.heading
            };
        }

        var f = (distance - a.d) / span;

        var dh = unwrapAngle(
            b.heading - a.heading
        );

        return {
            d: distance,
            x: a.x + (b.x - a.x) * f,
            y: a.y + (b.y - a.y) * f,
            z: a.z + (b.z - a.z) * f,
            heading: a.heading + dh * f
        };
    }

    function masterCurvatureAt(distance) {
        if (!masterSegments.length) return 0;

        var low = 0;
        var high = masterSegments.length - 1;

        while (low < high) {
            var middle = Math.ceil((low + high) * 0.5);

            if (masterSegments[middle].start <= distance) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }

        return masterSegments[low].curvature;
    }

    // ------------------------------------------------------------
    // AUTHORED RAIL POSITIONS.
    // ------------------------------------------------------------

    function rawOffset(track, distance) {
        if (!track) {
            return {
                x: 0,
                y: 0,
                dx: 0,
                dy: 0
            };
        }

        var offset = interpolateRailOffset(
            track,
            distance,
            true
        );

        if (
            !offset ||
            !Number.isFinite(offset.x) ||
            !Number.isFinite(offset.y)
        ) {
            return null;
        }

        return {
            x: offset.x,
            y: offset.y,
            dx: Number(offset.dx) || 0,
            dy: Number(offset.dy) || 0
        };
    }

    function rawWorldPoint(track, distance) {
        var master = sampleMasterAt(distance);

        if (!master) return null;

        var offset = track
        ? rawOffset(track, distance)
        : { x: 0, y: 0, dx: 0, dy: 0 };

        if (!offset) return null;

        var ch = Math.cos(master.heading);
        var sh = Math.sin(master.heading);

        return {
            x: master.x + ch * offset.x,
            y: master.y + offset.y,
            z: master.z - sh * offset.x
        };
    }

    function findTrackAt(rail, distance) {
        if (Number(rail) === 0) return null;

        for (var candidate of tracks) {
            if (Number(candidate.rail) !== Number(rail)) {
                continue;
            }

            if (
                distance >= Number(candidate.startDistance) - EPS &&
                distance <= Number(candidate.endDistance) + EPS
            ) {
                return candidate;
            }
        }

        return null;
    }
    function rawOffsetAtRail(rail, distance) {
        var targetTrack = findTrackAt(rail, distance);

        // Rail 0 is the master route, whose lateral and vertical
        // offsets relative to itself are zero.
        if (!targetTrack && Number(rail) === 0) {
            return {
                x: 0,
                y: 0,
                dx: 0,
                dy: 0
            };
        }

        if (!targetTrack) {
            return null;
        }

        return rawOffset(targetTrack, distance);
    }
    // ------------------------------------------------------------
    // ACTUAL WORLD HEADING OF A RAIL.
    // ------------------------------------------------------------

    function worldHeadingAtRail(
        rail,
        distance,
        preferForward = true
    ) {
        if (Number(rail) === 0) {
            return sampleMasterAt(distance).heading;
        }

        var targetTrack = findTrackAt(
            rail,
            distance
        );

        if (!targetTrack) {
            return sampleMasterAt(distance).heading;
        }

        var probe = 0.5;

        var before = null;
        var after = null;

        var canSampleForward =
        distance + probe <=
        Number(targetTrack.endDistance) + EPS;

        var canSampleBackward =
        distance - probe >=
        Number(targetTrack.startDistance) - EPS;

        if (preferForward && canSampleForward) {
            before = rawWorldPoint(targetTrack, distance);
            after = rawWorldPoint(targetTrack, distance + probe);

        } else if (canSampleBackward) {
            before = rawWorldPoint(targetTrack, distance - probe);
            after = rawWorldPoint(targetTrack, distance);

        } else if (canSampleForward) {
            before = rawWorldPoint(targetTrack, distance);
            after = rawWorldPoint(targetTrack, distance + probe);
        }

        if (!before || !after) {
            return sampleMasterAt(distance).heading;
        }

        var dx = after.x - before.x;
        var dz = after.z - before.z;

        if (Math.hypot(dx, dz) <= EPS) {
            return sampleMasterAt(distance).heading;
        }

        return Math.atan2(dx, dz);
    }

    // ------------------------------------------------------------
    // PHYSICAL SWITCH DISTANCE.
    // ------------------------------------------------------------

    function switchPhysicalDistance(sw) {
        var distance = Number(sw[5]);

        if (!Number.isFinite(distance)) {
            distance = Number(sw[0]);
        }

        return distance;
    }

    // ------------------------------------------------------------
    // FIND A STARTING MARKER FOR A RAIL RUN.
    //
    // Facing points: the rail is sw[2], the branch.
    // Front buffer: the rail is sw[1], starting independently.
    // ------------------------------------------------------------

    function findStartMarker(track) {
        var rail = Number(track.rail);
        var runStart = Number(track.startDistance);

        var best = null;
        var bestScore = Infinity;

        for (var sw of trackSwitches) {
            if (!Array.isArray(sw) || sw.length < 5) {
                continue;
            }

            var type = sw[3];
            var distance = switchPhysicalDistance(sw);

            if (!Number.isFinite(distance)) continue;

            var isFacingStart =
            type === 'facing points' &&
            Number(sw[2]) === rail;

            var isBufferStart =
            type === 'frontbuffer' &&
            Number(sw[1]) === rail;

            if (!isFacingStart && !isBufferStart) {
                continue;
            }

            var difference = Math.abs(distance - runStart);

            if (difference > ENDPOINT_TOLERANCE) {
                continue;
            }

            var score = difference;

            if (isFacingStart) {
                score -= 0.0001;
            }

            if (score < bestScore) {
                bestScore = score;

                best = {
                    type: type,
                    distance: distance,
                    switchData: sw
                };
            }
        }

        return best;
    }

    // ------------------------------------------------------------
    // FIND THE END OF A BRANCH RUN.
    //
    // CRITICAL CORRECTION:
    //
    // At a non-facing switch:
    //     sw[1] = continuing rail.
    //     sw[2] = branch rail that merges.
    //
    // ONLY sw[2] is eligible to have its geometry recalculated.
    // The continuing rail sw[1] must remain untouched.
    // ------------------------------------------------------------

    function findEndMarker(track, startDistance, startMarker) {
        var rail = Number(track.rail);
        var runEnd = Number(track.endDistance);

        var best = null;
        var bestDistance = Infinity;

        for (var sw of trackSwitches) {
            if (
                !Array.isArray(sw) ||
                sw.length < 5 ||
                sw[3] !== 'non facing points'
            ) {
                continue;
            }

            var distance = switchPhysicalDistance(sw);

            if (
                !Number.isFinite(distance) ||
                distance <= startDistance + EPS ||
                distance > runEnd + ENDPOINT_TOLERANCE
            ) {
                continue;
            }

            // A branch run terminates at the continuing rail.
            var isBranchEnd = Number(sw[2]) === rail;

            // An independently-started run can also be bounded by
            // the first switch at which it acts as the continuing rail.
            var isIndependentStemJoin =
            startMarker &&
            startMarker.type === 'frontbuffer' &&
            Number(sw[1]) === rail;

            if (!isBranchEnd && !isIndependentStemJoin) {
                continue;
            }

            if (distance < bestDistance) {
                bestDistance = distance;

                best = {
                    type: 'non facing points',
                    distance: distance,
                    role: isBranchEnd ? 'branch' : 'stem',
                    switchData: sw
                };
            }
        }

        return best;
    }


    // ------------------------------------------------------------
    // BUILD CURVATURE-AWARE PATHS FOR ACTUAL BRANCH RUNS.
    //
    // Continuing/stem tracks are not changed.
    // ------------------------------------------------------------

    for (var track of tracks) {
        var rail = Number(track.rail);

        if (!Number.isSafeInteger(rail) || rail <= 0) {
            continue;
        }

        var startMarker = findStartMarker(track);

        if (!startMarker) {
            continue;
        }

        var pathStart = Number(track.startDistance);

        if (!Number.isFinite(pathStart)) {
            continue;
        }

        var endMarker = findEndMarker(
            track,
            pathStart,
            startMarker
        );

        var localEnd = false;
        var pathEnd;

        if (endMarker) {
            pathEnd = Math.min(
                endMarker.distance,
                Number(track.endDistance)
            );

        } else if (startMarker.type === 'facing points') {
            pathEnd = Math.min(
                Number(track.endDistance),
                               pathStart + blockLimit
            );

            localEnd = true;

        } else {
            continue;
        }

        if (
            !Number.isFinite(pathEnd) ||
            pathEnd - pathStart <= EPS
        ) {
            continue;
        }
        var mergeApproachStart = null;

        // Only apply this to a branch joining another track.
        // A continuing track must retain its own tangent.
        if (endMarker && endMarker.role !== 'stem') {
            mergeApproachStart = Math.max(
                pathStart,
                pathEnd - MERGE_APPROACH_DISTANCE
            );
        }

        // --------------------------------------------------------
        // INITIAL WORLD HEADING.
        //
        // A newly starting track has no incoming tangent.
        // Its initial heading is assumed to be straight ahead.
        // --------------------------------------------------------

        var startHeading;

        if (startMarker.type === 'facing points') {
            var startTargetRail =
            Number(startMarker.switchData[1]);

            startHeading = worldHeadingAtRail(
                startTargetRail,
                startMarker.distance,
                true
            );

        } else {
            startHeading = sampleMasterAt(pathStart).heading;
        }

        // --------------------------------------------------------
        // FINAL WORLD HEADING.
        //
        // Only an actual branch merge receives a destination
        // target heading.
        // --------------------------------------------------------

        var endHeading;

        if (endMarker && endMarker.role === 'branch') {
            var endTargetRail =
            Number(endMarker.switchData[1]);

            endHeading = worldHeadingAtRail(
                endTargetRail,
                pathEnd,
                true
            );

        } else {
            // The path is the continuing rail.
            // Preserve its own outgoing world tangent.
            endHeading = worldHeadingAtRail(
                rail,
                pathEnd,
                true
            );
        }

        // --------------------------------------------------------
        // COLLECT ALL CONTROL POSITIONS.
        // --------------------------------------------------------

        var distances = [
            pathStart,
            pathEnd
        ];

        for (var point of track.points) {
            var pointDistance = Number(point.d);

            if (
                pointDistance > pathStart + EPS &&
                pointDistance < pathEnd - EPS
            ) {
                distances.push(pointDistance);
            }
        }

        for (var curveChange of curvatureChanges) {
            if (
                curveChange > pathStart + EPS &&
                curveChange < pathEnd - EPS
            ) {
                distances.push(curveChange);
            }
        }
        // Give the merge approach enough intermediate positions
        // to distribute the small tangent adjustment smoothly.
        if (mergeApproachStart !== null) {
            var approachSpan = pathEnd - mergeApproachStart;

            if (approachSpan > EPS) {
                distances.push(mergeApproachStart);
                distances.push(mergeApproachStart + approachSpan / 3);
                distances.push(mergeApproachStart + approachSpan * 2 / 3);
            }
        }
        distances.sort((a, b) => a - b);

        var uniqueDistances = [];

        for (var distance of distances) {
            if (
                !uniqueDistances.length ||
                Math.abs(
                    distance -
                    uniqueDistances[uniqueDistances.length - 1]
                ) > EPS
            ) {
                uniqueDistances.push(distance);
            }
        }

        // --------------------------------------------------------
        // BUILD WORLD POSITIONS.
        // --------------------------------------------------------

        var nodes = [];
        var validPath = true;

        for (var distance of uniqueDistances) {
            var offset = rawOffset(track, distance);
            var master = sampleMasterAt(distance);

            if (!offset || !master) {
                validPath = false;
                break;
            }

            var ch = Math.cos(master.heading);
            var sh = Math.sin(master.heading);

            nodes.push({
                d: distance,

                x: offset.x,
                y: offset.y,

                master: master,

                worldX: master.x + ch * offset.x,
                worldY: master.y + offset.y,
                worldZ: master.z - sh * offset.x
            });
        }

        if (!validPath || nodes.length < 2) {
            continue;
        }
        // ------------------------------------------------------------
        // EXACT DESTINATION POSITION FOR A BRANCH MERGE
        // ------------------------------------------------------------

        var mergeTargetOffset = null;

        if (endMarker && endMarker.role === 'branch') {
            var targetRail = Number(endMarker.switchData[1]);

            mergeTargetOffset = rawOffsetAtRail(
                targetRail,
                pathEnd
            );

            if (!mergeTargetOffset) {
                continue;
            }

            var endpoint = nodes[nodes.length - 1];
            var endpointMaster = endpoint.master;

            // The branch must physically finish at the destination rail.
            endpoint.x = mergeTargetOffset.x;
            endpoint.y = mergeTargetOffset.y;

            var ch = Math.cos(endpointMaster.heading);
            var sh = Math.sin(endpointMaster.heading);

            endpoint.worldX =
            endpointMaster.x + ch * endpoint.x;

            endpoint.worldY =
            endpointMaster.y + endpoint.y;

            endpoint.worldZ =
            endpointMaster.z - sh * endpoint.x;
        }
        // --------------------------------------------------------
        // CALCULATE REQUIRED WORLD HEADINGS.
        // --------------------------------------------------------

        var desiredHeadings = [];

        for (var i = 0; i < nodes.length; i++) {
            var desiredHeading;

            if (i === 0) {
                desiredHeading = startHeading;

            } else if (i === nodes.length - 1) {
                desiredHeading = endHeading;

            } else {
                var before = nodes[i - 1];
                var after = nodes[i + 1];

                var worldDX =
                after.worldX - before.worldX;

                var worldDZ =
                after.worldZ - before.worldZ;

                if (Math.hypot(worldDX, worldDZ) <= EPS) {
                    desiredHeading =
                    desiredHeadings[i - 1];

                } else {
                    desiredHeading = Math.atan2(
                        worldDX,
                        worldDZ
                    );
                }
            }

            if (desiredHeadings.length) {
                desiredHeading = unwrapNear(
                    desiredHeading,
                    desiredHeadings[desiredHeadings.length - 1]
                );
            }

            desiredHeadings.push(desiredHeading);
        }


        // ------------------------------------------------------------
        // GENTLE MERGE TANGENT ANTICIPATION
        // ------------------------------------------------------------

        if (mergeApproachStart !== null) {
            var approachSpan = pathEnd - mergeApproachStart;

            if (approachSpan > EPS) {
                for (var i = 1; i < nodes.length - 1; i++) {
                    var u = clamp(
                        (nodes[i].d - mergeApproachStart) / approachSpan,
                                  0,
                                  1
                    );

                    // Smoothly increase the influence towards the merge.
                    var weight = u * u * (3 - 2 * u);

                    var targetHeading = unwrapNear(
                        endHeading,
                        desiredHeadings[i]
                    );

                    var influence =
                    MERGE_APPROACH_STRENGTH * weight;

                    desiredHeadings[i] +=
                    (targetHeading - desiredHeadings[i]) * influence;
                }
            }
        }


        // --------------------------------------------------------
        // VERTICAL OFFSET TANGENTS.
        // --------------------------------------------------------

        var verticalTangents = [];

        for (var i = 0; i < nodes.length; i++) {
            if (i === 0) {
                var firstSpan =
                nodes[1].d - nodes[0].d;

                verticalTangents.push(
                    (nodes[1].y - nodes[0].y) / firstSpan
                );

            } else if (i === nodes.length - 1) {
                var lastSpan =
                nodes[i].d - nodes[i - 1].d;

                verticalTangents.push(
                    (nodes[i].y - nodes[i - 1].y) / lastSpan
                );

            } else {
                var previous = nodes[i - 1];
                var next = nodes[i + 1];

                verticalTangents.push(
                    (next.y - previous.y) /
                    (next.d - previous.d)
                );
            }
        }

        // --------------------------------------------------------
        // BUILD CURVATURE-AWARE HERMITE INTERVALS.
        // --------------------------------------------------------

        var intervals = [];

        for (var i = 0; i < nodes.length - 1; i++) {
            var a = nodes[i];
            var b = nodes[i + 1];

            var span = b.d - a.d;

            if (span <= EPS) continue;

            var midpoint = (a.d + b.d) * 0.5;

            var curvature = masterCurvatureAt(midpoint);

            var alpha0 = unwrapAngle(
                desiredHeadings[i] -
                a.master.heading
            );

            var alpha1 = unwrapAngle(
                desiredHeadings[i + 1] -
                b.master.heading
            );

            alpha0 = clamp(alpha0, -1.52, 1.52);
            alpha1 = clamp(alpha1, -1.52, 1.52);

            var m0x =
            (1 - curvature * a.x) *
            Math.tan(alpha0);

            var m1x =
            (1 - curvature * b.x) *
            Math.tan(alpha1);

            intervals.push({
                startDistance: a.d,
                endDistance: b.d,

                x0: a.x,
                x1: b.x,

                y0: a.y,
                y1: b.y,

                m0x: m0x,
                m1x: m1x,

                m0y: verticalTangents[i],
                m1y: verticalTangents[i + 1]
            });
        }

        if (!intervals.length) {
            continue;
        }

        track.switchCurves.push({
            startDistance: pathStart,
            endDistance: pathEnd,

            targetDistance: pathEnd,

            mode: endMarker ? 'merge' : 'diverge',

            intervals: intervals
        });
    }

    // ------------------------------------------------------------
    // KEEP PATHS IN ROUTE ORDER.
    // ------------------------------------------------------------

    for (var track of tracks) {
        track.switchCurves.sort((a, b) =>
        a.startDistance - b.startDistance
        );
    }
}








function interpolateRailOffset(
    track,
    d,
    skipSwitchCurves = false,
    visited = null
) {
    var EPS = 1e-7;

    var points =
    track && Array.isArray(track.points)
    ? track.points
    : null;

    if (
        !points ||
        !points.length ||
        !Number.isFinite(Number(d))
    ) {
        return null;
    }

    var startDistance = Number.isFinite(Number(track.startDistance))
    ? Number(track.startDistance)
    : points[0].d;

    var endDistance = Number.isFinite(Number(track.endDistance))
    ? Number(track.endDistance)
    : points[points.length - 1].d;

    if (
        d < startDistance - EPS ||
        d > endDistance + EPS
    ) {
        return null;
    }

    // ------------------------------------------------------------
    // ORIGINAL AUTHORED TRACK INTERPOLATION.
    //
    // This remains the fallback outside switch-connected paths.
    // ------------------------------------------------------------

    var result;

    if (points.length === 1) {
        result = {
            x: points[0].x,
            y: points[0].y,
            dx: 0,
            dy: 0
        };

    } else if (d > points[points.length - 1].d + EPS) {
        var lastPoint = points[points.length - 1];

        result = {
            x: lastPoint.x,
            y: lastPoint.y,
            dx: 0,
            dy: 0
        };

    } else {
        var segmentIndex = -1;

        for (var i = 0; i < points.length - 1; i++) {
            if (
                d >= points[i].d - EPS &&
                d <= points[i + 1].d + EPS
            ) {
                segmentIndex = i;
                break;
            }
        }

        if (segmentIndex < 0) {
            return null;
        }

        var a = points[segmentIndex];
        var b = points[segmentIndex + 1];

        var span = b.d - a.d;

        if (span <= EPS) {
            return null;
        }

        var t = clamp(
            (d - a.d) / span,
                      0,
                      1
        );

        var currentSlopeX = (b.x - a.x) / span;
        var currentSlopeY = (b.y - a.y) / span;

        var m0x = currentSlopeX;
        var m0y = currentSlopeY;

        var m1x = currentSlopeX;
        var m1y = currentSlopeY;

        // Incoming tangent.
        if (segmentIndex > 0) {
            var previous = points[segmentIndex - 1];
            var previousSpan = a.d - previous.d;

            if (previousSpan > EPS) {
                var previousSlopeX =
                (a.x - previous.x) / previousSpan;

                var previousSlopeY =
                (a.y - previous.y) / previousSpan;

                if (previousSlopeX * currentSlopeX <= 0) {
                    m0x = 0;
                } else {
                    var wx1 = 2 * span + previousSpan;
                    var wx2 = span + 2 * previousSpan;

                    m0x = (wx1 + wx2) /
                    (wx1 / previousSlopeX +
                    wx2 / currentSlopeX);
                }

                if (previousSlopeY * currentSlopeY <= 0) {
                    m0y = 0;
                } else {
                    var wy1 = 2 * span + previousSpan;
                    var wy2 = span + 2 * previousSpan;

                    m0y = (wy1 + wy2) /
                    (wy1 / previousSlopeY +
                    wy2 / currentSlopeY);
                }
            }
        }

        // Outgoing tangent.
        if (segmentIndex + 2 < points.length) {
            var next = points[segmentIndex + 2];
            var nextSpan = next.d - b.d;

            if (nextSpan > EPS) {
                var nextSlopeX =
                (next.x - b.x) / nextSpan;

                var nextSlopeY =
                (next.y - b.y) / nextSpan;

                if (currentSlopeX * nextSlopeX <= 0) {
                    m1x = 0;
                } else {
                    var wx3 = 2 * nextSpan + span;
                    var wx4 = nextSpan + 2 * span;

                    m1x = (wx3 + wx4) /
                    (wx3 / currentSlopeX +
                    wx4 / nextSlopeX);
                }

                if (currentSlopeY * nextSlopeY <= 0) {
                    m1y = 0;
                } else {
                    var wy3 = 2 * nextSpan + span;
                    var wy4 = nextSpan + 2 * span;

                    m1y = (wy3 + wy4) /
                    (wy3 / currentSlopeY +
                    wy4 / nextSlopeY);
                }
            }
        }

        // Cubic Hermite interpolation.
        var t2 = t * t;
        var t3 = t2 * t;

        var h00 = 2 * t3 - 3 * t2 + 1;
        var h10 = t3 - 2 * t2 + t;
        var h01 = -2 * t3 + 3 * t2;
        var h11 = t3 - t2;

        var x =
        h00 * a.x +
        h10 * span * m0x +
        h01 * b.x +
        h11 * span * m1x;

        var y =
        h00 * a.y +
        h10 * span * m0y +
        h01 * b.y +
        h11 * span * m1y;

        var dh00 = 6 * t2 - 6 * t;
        var dh10 = 3 * t2 - 4 * t + 1;
        var dh01 = -6 * t2 + 6 * t;
        var dh11 = 3 * t2 - 2 * t;

        var dx =
        (dh00 * a.x + dh01 * b.x) / span +
        dh10 * m0x +
        dh11 * m1x;

        var dy =
        (dh00 * a.y + dh01 * b.y) / span +
        dh10 * m0y +
        dh11 * m1y;

        result = {
            x: x,
            y: y,
            dx: dx,
            dy: dy
        };
    }

    // ------------------------------------------------------------
    // SWITCH-PATH INTERPOLATION.
    //
    // skipSwitchCurves=true returns the original authored geometry.
    // This is required while the switch paths themselves are built.
    // ------------------------------------------------------------

    if (
        skipSwitchCurves ||
        !Array.isArray(track.switchCurves) ||
        !track.switchCurves.length
    ) {
        return result;
    }

    // ------------------------------------------------------------
    // FIND THE ACTIVE SWITCH PATH.
    // ------------------------------------------------------------

    var activeCurve = null;

    for (var curve of track.switchCurves) {
        if (
            d >= Number(curve.startDistance) - EPS &&
            d <= Number(curve.endDistance) + EPS &&
            Array.isArray(curve.intervals) &&
            curve.intervals.length
        ) {
            activeCurve = curve;
            break;
        }
    }

    if (!activeCurve) {
        return result;
    }

    // ------------------------------------------------------------
    // FIND THE LOCAL INTERVAL.
    // ------------------------------------------------------------

    var intervals = activeCurve.intervals;

    var low = 0;
    var high = intervals.length - 1;

    while (low < high) {
        var middle = Math.floor((low + high) * 0.5);

        if (
            d <= intervals[middle].endDistance + EPS
        ) {
            high = middle;
        } else {
            low = middle + 1;
        }
    }

    var interval = intervals[low];

    var span =
    interval.endDistance -
    interval.startDistance;

    if (span <= EPS) {
        return result;
    }

    var t = clamp(
        (d - interval.startDistance) / span,
                  0,
                  1
    );

    // ------------------------------------------------------------
    // CURVATURE-AWARE OFFSET HERMITE INTERPOLATION.
    // ------------------------------------------------------------

    var t2 = t * t;
    var t3 = t2 * t;

    var h00 = 2 * t3 - 3 * t2 + 1;
    var h10 = t3 - 2 * t2 + t;
    var h01 = -2 * t3 + 3 * t2;
    var h11 = t3 - t2;

    var x =
    h00 * interval.x0 +
    h10 * span * interval.m0x +
    h01 * interval.x1 +
    h11 * span * interval.m1x;

    var y =
    h00 * interval.y0 +
    h10 * span * interval.m0y +
    h01 * interval.y1 +
    h11 * span * interval.m1y;

    var dh00 = 6 * t2 - 6 * t;
    var dh10 = 3 * t2 - 4 * t + 1;
    var dh01 = -6 * t2 + 6 * t;
    var dh11 = 3 * t2 - 2 * t;

    var dx =
    (dh00 * interval.x0 +
    dh01 * interval.x1) / span +
    dh10 * interval.m0x +
    dh11 * interval.m1x;

    var dy =
    (dh00 * interval.y0 +
    dh01 * interval.y1) / span +
    dh10 * interval.m0y +
    dh11 * interval.m1y;

    return {
        x: x,
        y: y,
        dx: dx,
        dy: dy
    };
}











/* ROUTE SAMPLING */
function sampleAt(distance, includeRails = true) {
    var s = route.samples;

    if (!Array.isArray(s) || !s.length) {
        return null;
    }

    var last = s.length - 1;

    if (s.length === 1) {
        return {
            ...s[0],
            d: distance,
            curvature: 0,
            rails: {}
        };
    }

    var low;
    var high;

    if (distance <= s[0].d) {
        low = 0;
        high = 1;

    } else if (distance >= s[last].d) {
        low = last - 1;
        high = last;

    } else {
        low = 0;
        high = last;

        while (low + 1 < high) {
            var middle = Math.floor((low + high) * 0.5);

            if (s[middle].d <= distance) {
                low = middle;
            } else {
                high = middle;
            }
        }
    }

    var a = s[low];
    var b = s[high];

    var span = b.d - a.d;

    if (span <= 1e-9) {
        return {
            ...a,
            d: distance,
            curvature: 0,
            rails: {}
        };
    }

    var f = clamp(
        (distance - a.d) / span,
                  0,
                  1
    );

    var dh = b.heading - a.heading;

    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;

    // This is the curvature of the actual master-route interval.
    // At an exact sample boundary, the outgoing interval is used.
    var masterCurvature = dh / span;

    var p = {
        d: distance,

        x: lerp(a.x, b.x, f),
        z: lerp(a.z, b.z, f),
        y: lerp(a.y, b.y, f),

        heading: a.heading + dh * f,

        curvature: masterCurvature,

        rails: {}
    };

    if (
        includeRails &&
        Array.isArray(route.rails)
    ) {
        for (var track of route.rails) {
            var off = interpolateRailOffset(
                track,
                distance
            );

            if (off) {
                p.rails[track.rail] = off;
            }
        }
    }

    return p;
}







/* CAMERA AND OVERLAY */

function cameraBasis(cam) {
    var sh = Math.sin(cam.heading);
    var ch = Math.cos(cam.heading);

    return {
        fx: sh,
        fz: ch,
        rx: ch,
        rz: -sh
    };
}

function basisForSample(s) {
    var sh = Math.sin(s.heading);
    var ch = Math.cos(s.heading);

    return {
        fx: sh,
        fz: ch,
        rx: ch,
        rz: -sh
    };
}



/* TEXTURED WORLD GEOMETRY */

function worldPoint(sample, lateral, height, trackOffset = null) {

    var basis = basisForSample(sample);

    var offsetX = trackOffset
    ? Number(trackOffset.x) || 0
    : 0;

    var offsetDX = trackOffset
    ? Number(trackOffset.dx) || 0
    : 0;

    var curvature = Number(sample.curvature) || 0;

    // Actual tangent of the offset track:
    //
    // P'(s) = (1 - curvature * x)T + x'N
    //
    var along = 1 - curvature * offsetX;
    var across = offsetDX;

    var tangentLength = Math.hypot(along, across);

    if (tangentLength < 1e-9) {
        along = 1;
        across = 0;
        tangentLength = 1;
    }

    var rightX = (
        along * basis.rx -
        across * basis.fx
    ) / tangentLength;

    var rightZ = (
        along * basis.rz -
        across * basis.fz
    ) / tangentLength;

    var centreX = sample.x + basis.rx * offsetX;
    var centreZ = sample.z + basis.rz * offsetX;

    // The incoming lateral value already includes offsetX.
    var localLateral = trackOffset
    ? lateral - offsetX
    : lateral;

    return {
        x: centreX + rightX * localLateral,
        y: sample.y + height,
        z: centreZ + rightZ * localLateral,

        u: lateral / (2 * BED_HALF_WIDTH),
        v: sample.d / 1.3,

        brightness: sample.brightness ?? 1
    };
}


function trackbedPoint(
    sample,
    trackCentre,
    localLateral,
    height,
    textureDistance,
    trackOffset = null
) {

    var basis = basisForSample(sample);

    var offsetX = Number(trackCentre) || 0;

    var offsetDX = trackOffset
    ? Number(trackOffset.dx) || 0
    : 0;

    var curvature = Number(sample.curvature) || 0;

    var along = 1 - curvature * offsetX;
    var across = offsetDX;

    var tangentLength = Math.hypot(along, across);

    if (tangentLength < 1e-9) {
        along = 1;
        across = 0;
        tangentLength = 1;
    }

    var rightX = (
        along * basis.rx -
        across * basis.fx
    ) / tangentLength;

    var rightZ = (
        along * basis.rz -
        across * basis.fz
    ) / tangentLength;

    var centreX = sample.x + basis.rx * offsetX;
    var centreZ = sample.z + basis.rz * offsetX;

    return {
        x: centreX + rightX * localLateral,
        y: sample.y + height,
        z: centreZ + rightZ * localLateral,

        u: (
            localLateral + BED_HALF_WIDTH
        ) / (2 * BED_HALF_WIDTH),

        v: textureDistance / 1.3,

        brightness: sample.brightness ?? 1
    };
}







function pushVertex(vertices, p, textureIndex, colour) {
    var c = colour || [1, 1, 1];
    var brightness = Number.isFinite(p.brightness)
    ? p.brightness
    : 1;

    vertices.push(
        p.x, p.y, p.z,
        p.u, p.v,
        textureIndex,
        c[0] * brightness,
        c[1] * brightness,
        c[2] * brightness
    );
}

function addTriangle(vertices, a, b, c, textureIndex, colour) {
    pushVertex(vertices, a, textureIndex, colour);
    pushVertex(vertices, b, textureIndex, colour);
    pushVertex(vertices, c, textureIndex, colour);
}

function addQuad(vertices, a, b, c, d, textureIndex, colour) {
    addTriangle(vertices, a, b, c, textureIndex, colour);
    addTriangle(vertices, a, c, d, textureIndex, colour);
}

function getRailTypeAtDistance(track, distance) {
    if (!track) return 0;

    var typeEvents = Array.isArray(track.railTypeEvents)
    ? track.railTypeEvents
    : [];

    if (typeEvents.length) {
        var railType = Number(typeEvents[0].railType) || 0;

        for (var event of typeEvents) {
            if (Number(event.d) <= distance + 1e-7) {
                railType = Number(event.railType) || 0;
            } else {
                break;
            }
        }

        return railType;
    }

    return Number(track.railType) || 0;
}







function getCrackOuterOffsets(railNumber, distance, ownX, cracks, railTracks) {
    var left = OUTER_BED_HALF_WIDTH;
    var right = -OUTER_BED_HALF_WIDTH;

    for (var crack of cracks || []) {
        if (!crack || !Number.isFinite(crack.distance)) continue;

        if (distance < crack.distance || distance > (crack.distance + getConfiguredBlockLength())) {
            continue;
        }

        var rail1 = Number(crack.rail1);
        var rail2 = Number(crack.rail2);
        var otherRailNumber;

        if (rail1 === railNumber) {
            otherRailNumber = rail2;
        } else if (rail2 === railNumber) {
            otherRailNumber = rail1;
        } else {
            continue;
        }

        var otherX = 0;

        if (otherRailNumber !== 0) {
            var otherOffset = null;

            // A rail number can have multiple separate geometry runs.
            // Find the run that actually covers this distance.
            for (var candidate of railTracks) {
                if (Number(candidate.rail) !== otherRailNumber) {
                    continue;
                }

                var candidateOffset = interpolateRailOffset(
                    candidate,
                    distance
                );

                if (
                    candidateOffset &&
                    Number.isFinite(candidateOffset.x)
                ) {
                    otherOffset = candidateOffset;
                    break;
                }
            }

            if (!otherOffset) continue;

            otherX = otherOffset.x;
        }

        // Calculate the halfway point relative to this track.
        var halfwayOffset = (otherX - ownX) / 2;

        // Extend the existing outer edge towards the other rail.
        if (halfwayOffset > 0) {
            left = Math.max(left, halfwayOffset);
        } else if (halfwayOffset < 0) {
            right = Math.min(right, halfwayOffset);
        }
    }

    return {
        left: left,
        right: right
    };
}






function addTrackbedSegment(
    vertices,
    p0,
    p1,
    track,
    textureDistance0,
    textureDistance1,
    railTypeOverride,
    railTracks,
    cracks
) {
    var o0 = track
    ? interpolateRailOffset(track, p0.d)
    : { x: 0, y: 0, dx: 0, dy: 0 };

    var o1 = track
    ? interpolateRailOffset(track, p1.d)
    : { x: 0, y: 0, dx: 0, dy: 0 };

    if (!o0 || !o1) return;

    var routeSpan = p1.d - p0.d;
    var headingDifference = p1.heading - p0.heading;

    while (headingDifference > Math.PI) {
        headingDifference -= Math.PI * 2;
    }

    while (headingDifference < -Math.PI) {
        headingDifference += Math.PI * 2;
    }

    var fallbackCurvature = routeSpan > 1e-9
    ? headingDifference / routeSpan
    : 0;

    // Match the local curvature used by the switch calculation.
    var curvature0 = Number.isFinite(Number(p0.curvature))
    ? Number(p0.curvature)
    : fallbackCurvature;

    var curvature1 = Number.isFinite(Number(p1.curvature))
    ? Number(p1.curvature)
    : fallbackCurvature;

    var sample0 = {
        ...p0,
        curvature: curvature0
    };

    var sample1 = {
        ...p1,
        curvature: curvature1
    };

    var trackOffset0 = track ? o0 : null;
    var trackOffset1 = track ? o1 : null;

    var railType = track
    ? getRailTypeAtDistance(track, p0.d)
    : (
        Number.isSafeInteger(railTypeOverride) &&
        railTypeOverride >= 0
        ? railTypeOverride
        : 0
    );

    var mapping = use_track_texture[railType];
    var textureIndex = mapping ? mapping[0] + 1 : 1;

    var w = BED_HALF_WIDTH;

    var left0 = trackbedPoint(
        sample0, o0.x, w,
        o0.y + BED_EDGE_HEIGHT,
        textureDistance0,
        trackOffset0
    );

    var right0 = trackbedPoint(
        sample0, o0.x, -w,
        o0.y + BED_EDGE_HEIGHT,
        textureDistance0,
        trackOffset0
    );

    var left1 = trackbedPoint(
        sample1, o1.x, w,
        o1.y + BED_EDGE_HEIGHT,
        textureDistance1,
        trackOffset1
    );

    var right1 = trackbedPoint(
        sample1, o1.x, -w,
        o1.y + BED_EDGE_HEIGHT,
        textureDistance1,
        trackOffset1
    );

    var centre0 = trackbedPoint(
        sample0, o0.x, 0,
        o0.y + BED_CROWN_HEIGHT,
        textureDistance0,
        trackOffset0
    );

    var centre1 = trackbedPoint(
        sample1, o1.x, 0,
        o1.y + BED_CROWN_HEIGHT,
        textureDistance1,
        trackOffset1
    );

    addTriangle(vertices, left0, centre0, centre1, textureIndex);
    addTriangle(vertices, left0, centre1, left1, textureIndex);
    addTriangle(vertices, centre0, right0, right1, textureIndex);
    addTriangle(vertices, centre0, right1, centre1, textureIndex);

    var railNumber = track ? Number(track.rail) : 0;

    var crackOffsets0 = getCrackOuterOffsets(
        railNumber,
        p0.d,
        o0.x,
        cracks,
        railTracks
    );

    var crackOffsets1 = getCrackOuterOffsets(
        railNumber,
        p1.d,
        o1.x,
        cracks,
        railTracks
    );

    var outerLeft0 = trackbedPoint(
        sample0, o0.x, crackOffsets0.left,
        o0.y + OUTER_BED_EDGE_HEIGHT,
        textureDistance0,
        trackOffset0
    );

    var outerLeft1 = trackbedPoint(
        sample1, o1.x, crackOffsets1.left,
        o1.y + OUTER_BED_EDGE_HEIGHT,
        textureDistance1,
        trackOffset1
    );

    var outerRight0 = trackbedPoint(
        sample0, o0.x, crackOffsets0.right,
        o0.y + OUTER_BED_EDGE_HEIGHT,
        textureDistance0,
        trackOffset0
    );

    var outerRight1 = trackbedPoint(
        sample1, o1.x, crackOffsets1.right,
        o1.y + OUTER_BED_EDGE_HEIGHT,
        textureDistance1,
        trackOffset1
    );

    left0.u = 0;
    left1.u = 0;
    right0.u = 1;
    right1.u = 1;

    outerLeft0.u = 1;
    outerLeft1.u = 1;
    outerRight0.u = 0;
    outerRight1.u = 0;

    addTriangle(
        vertices,
        left0,
        outerLeft0,
        outerLeft1,
        textureIndex + textureCount
    );

    addTriangle(
        vertices,
        left0,
        outerLeft1,
        left1,
        textureIndex + textureCount
    );

    addTriangle(
        vertices,
        right0,
        outerRight0,
        outerRight1,
        textureIndex + textureCount
    );

    addTriangle(
        vertices,
        right0,
        outerRight1,
        right1,
        textureIndex + textureCount
    );
}













function addRailSegment(
    vertices,
    p0,
    p1,
    track,
    railSide,
    railTypeOverride,
    pointOptions = null
) {
    var off0 = track
    ? interpolateRailOffset(track, p0.d)
    : { x: 0, y: 0, dx: 0, dy: 0 };

    var off1 = track
    ? interpolateRailOffset(track, p1.d)
    : { x: 0, y: 0, dx: 0, dy: 0 };

    if (!off0 || !off1) return;

    var routeSpan = p1.d - p0.d;
    var headingDifference = p1.heading - p0.heading;

    while (headingDifference > Math.PI) {
        headingDifference -= Math.PI * 2;
    }

    while (headingDifference < -Math.PI) {
        headingDifference += Math.PI * 2;
    }

    var fallbackCurvature = routeSpan > 1e-9
    ? headingDifference / routeSpan
    : 0;

    // Use the curvature belonging to each endpoint.
    // Do not average across a change in the master route curve.
    var curvature0 = Number.isFinite(Number(p0.curvature))
    ? Number(p0.curvature)
    : fallbackCurvature;

    var curvature1 = Number.isFinite(Number(p1.curvature))
    ? Number(p1.curvature)
    : fallbackCurvature;

    var sample0 = {
        ...p0,
        curvature: curvature0
    };

    var sample1 = {
        ...p1,
        curvature: curvature1
    };

    var shift0 = pointOptions
    ? Number(pointOptions.offsetShift0) || 0
    : 0;

    var shift1 = pointOptions
    ? Number(pointOptions.offsetShift1) || 0
    : 0;

    var widthScale0 = pointOptions &&
    Number.isFinite(Number(pointOptions.widthScale0))
    ? clamp(Number(pointOptions.widthScale0), 0.1, 1)
    : 1;

    var widthScale1 = pointOptions &&
    Number.isFinite(Number(pointOptions.widthScale1))
    ? clamp(Number(pointOptions.widthScale1), 0.1, 1)
    : 1;

    var trackOffset0 = track ? off0 : null;
    var trackOffset1 = track ? off1 : null;

    if (pointOptions) {
        trackOffset0 = {
            x: off0.x + shift0,
            y: off0.y,
            dx: (Number(off0.dx) || 0) +
            (Number(pointOptions.offsetGradient0) || 0),
            dy: Number(off0.dy) || 0
        };

        trackOffset1 = {
            x: off1.x + shift1,
            y: off1.y,
            dx: (Number(off1.dx) || 0) +
            (Number(pointOptions.offsetGradient1) || 0),
            dy: Number(off1.dy) || 0
        };
    }

    var railColours = [
        [0.46, 0.39, 0.32],
        [0.49, 0.45, 0.40],
        [0.58, 0.59, 0.58],
        [0.39, 0.40, 0.40],
        [0.44, 0.37, 0.31],
        [0.55, 0.57, 0.58],
        [0.53, 0.54, 0.53],
        [0.48, 0.45, 0.40]
    ];

    var railType = track ? track.railType : 0;
    var mapping = use_track_texture[railType];
    var colourIndex = mapping ? mapping[0] : 0;
    var railColour = railColours[colourIndex] || railColours[0];

    var halfWidth0 = RAIL_WIDTH * 0.5 * widthScale0;
    var halfWidth1 = RAIL_WIDTH * 0.5 * widthScale1;
    var h = RAIL_HEIGHT;
    var hh = RAIL_VERTICAL_OFFSET;

    var lateral0 =
    off0.x + shift0 + railSide * TRACK_GAUGE * 0.5;

    var lateral1 =
    off1.x + shift1 + railSide * TRACK_GAUGE * 0.5;
    var topOuter0 = worldPoint(
        sample0,
        lateral0 + halfWidth0,
        off0.y + h + hh,
        trackOffset0
    );

    var topInner0 = worldPoint(
        sample0,
        lateral0 - halfWidth0,
        off0.y + h + hh,
        trackOffset0
    );

    var topOuter1 = worldPoint(
        sample1,
        lateral1 + halfWidth1,
        off1.y + h + hh,
        trackOffset1
    );

    var topInner1 = worldPoint(
        sample1,
        lateral1 - halfWidth1,
        off1.y + h + hh,
        trackOffset1
    );

    var lowOuter0 = worldPoint(
        sample0,
        lateral0 + halfWidth0,
        off0.y + hh,
        trackOffset0
    );

    var lowInner0 = worldPoint(
        sample0,
        lateral0 - halfWidth0,
        off0.y + hh,
        trackOffset0
    );

    var lowOuter1 = worldPoint(
        sample1,
        lateral1 + halfWidth1,
        off1.y + hh,
        trackOffset1
    );

    var lowInner1 = worldPoint(
        sample1,
        lateral1 - halfWidth1,
        off1.y + hh,
        trackOffset1
    );

    var sideColour = [
        railColour[0] * 0.8,
        railColour[1] * 0.8,
        railColour[2] * 0.8
    ];

    addQuad(
        vertices,
        topOuter0, topInner0, topInner1, topOuter1,
        0,
        railColour
    );

    addQuad(
        vertices,
        lowOuter0, topOuter0, topOuter1, lowOuter1,
        0,
        sideColour
    );

    addQuad(
        vertices,
        lowInner0, topInner0, topInner1, lowInner1,
        0,
        sideColour
    );
}







/* ROUTE MESH UPLOAD */


function prepareRouteMesh(newRoute) {
    if (routeMesh && routeMesh.zones) {
        for (var oldZone of routeMesh.zones) {
            gl.deleteBuffer(oldZone.buffer);
            gl.deleteVertexArray(oldZone.vao);
            if (oldZone.pointBuffer) {
                gl.deleteBuffer(oldZone.pointBuffer);
            }

            if (oldZone.pointVao) {
                gl.deleteVertexArray(oldZone.pointVao);
            }
        }
    }

    routeMesh = null;

    if (!newRoute || newRoute.samples.length < 2) return;

    var samples = newRoute.samples;
    var segmentTotal = samples.length - 1;
    var physicalTracks = [null, ...newRoute.rails];
    var firstRouteDistance = newRoute.firstRouteDistance;
    var cracks = newRoute.cracks || [];

    var brightnessEvents = newRoute.brightnessEvents || [];

    // BVE default brightness is 255.
    var brightnessPoints = [
        { distance: 0, value: 255, order: -1 }
    ];

    for (var brightnessEvent of brightnessEvents) {
        if (
            !Number.isFinite(brightnessEvent.distance) ||
            !Number.isSafeInteger(brightnessEvent.value) ||
            brightnessEvent.value < 0 ||
            brightnessEvent.value > 255
        ) {
            continue;
        }

        brightnessPoints.push({
            distance: brightnessEvent.distance,
            value: brightnessEvent.value,
            order: brightnessEvent.order || 0
        });
    }

    brightnessPoints.sort((a, b) =>
    (a.distance - b.distance) || (a.order - b.order)
    );

    // At the same distance, the last command takes priority.
    var uniqueBrightnessPoints = [];

    for (var brightnessPoint of brightnessPoints) {
        var previousBrightnessPoint =
        uniqueBrightnessPoints[uniqueBrightnessPoints.length - 1];

        if (
            previousBrightnessPoint &&
            Math.abs(
                previousBrightnessPoint.distance -
                brightnessPoint.distance
            ) < 1e-9
        ) {
            previousBrightnessPoint.value = brightnessPoint.value;
        } else {
            uniqueBrightnessPoints.push({
                distance: brightnessPoint.distance,
                value: brightnessPoint.value
            });
        }
    }

    var brightnessPointIndex = 0;

    var brightnessSmoothing = clamp(
        Number(TRACK_BRIGHTNESS_SMOOTHING) || 0,
                                    0,
                                    1
    );

    for (var sample of samples) {
        while (
            brightnessPointIndex + 1 < uniqueBrightnessPoints.length &&
            uniqueBrightnessPoints[brightnessPointIndex + 1].distance
            <= sample.d + 1e-9
        ) {
            brightnessPointIndex++;
        }

        var brightnessFrom =
        uniqueBrightnessPoints[brightnessPointIndex];

        var brightnessTo =
        uniqueBrightnessPoints[brightnessPointIndex + 1];

        var brightnessValue = brightnessFrom.value;

        if (
            brightnessTo &&
            brightnessTo.distance > brightnessFrom.distance
        ) {
            var brightnessT = clamp(
                (sample.d - brightnessFrom.distance) /
                (brightnessTo.distance - brightnessFrom.distance),
                                    0,
                                    1
            );

            // Blend linear interpolation with smootherStep.
            var easedBrightnessT = lerp(
                brightnessT,
                smootherStep(brightnessT),
                                        brightnessSmoothing
            );

            brightnessValue = lerp(
                brightnessFrom.value,
                brightnessTo.value,
                easedBrightnessT
            );
        }

        var fullBrightnessLevel = Math.max(
            1,
            Number(full_brightness)
        );

        var minimumBrightnessLevel = clamp(
            Number(min_brightness),
                                           0,
                                           255
        );

        // Map BVE brightness onto the configured brightness range.
        // Zero gives min_brightness.
        // full_brightness and anything above gives full brightness.
        var brightnessRatio = clamp(
            brightnessValue / fullBrightnessLevel,
            0,
            1
        );

        var actualBrightness =
        minimumBrightnessLevel +
        (255 - minimumBrightnessLevel) * brightnessRatio;

        sample.brightness = actualBrightness / 255;
    }


    // Main-track Track.RailType events, sorted by distance and command order.
    var mainRailTypeEvents = newRoute.mainRailTypeEvents || [];
    var mainRailTypeIndex = 0;
    var mainRailType = 0;

    var trackTextureDistances = new Map();

    for (var physicalTrack of physicalTracks) {
        var distances = new Float64Array(samples.length);
        var totalDistance = 0;
        var previousPoint = null;

        for (var distanceIndex = 0; distanceIndex < samples.length; distanceIndex++) {
            var sample = samples[distanceIndex];

            var offset = physicalTrack
            ? interpolateRailOffset(physicalTrack, sample.d)
            : { x: 0, y: 0 };

            if (
                !offset ||
                !Number.isFinite(offset.x) ||
                !Number.isFinite(offset.y)
            ) {
                previousPoint = null;
                totalDistance = 0;
                distances[distanceIndex] = 0;
                continue;
            }

            var basis = basisForSample(sample);

            var currentPoint = {
                x: sample.x + basis.rx * offset.x,
                y: sample.y + offset.y,
                z: sample.z + basis.rz * offset.x
            };

            if (previousPoint) {
                var dx = currentPoint.x - previousPoint.x;
                var dy = currentPoint.y - previousPoint.y;
                var dz = currentPoint.z - previousPoint.z;

                totalDistance += Math.sqrt(
                    dx * dx + dy * dy + dz * dz
                );
            }

            distances[distanceIndex] = totalDistance;
            previousPoint = currentPoint;
        }

        trackTextureDistances.set(physicalTrack, distances);
    }

    var ZONE_LENGTH = 100;
    var SEGMENTS_PER_ZONE = Math.max(
        1,
        Math.round(ZONE_LENGTH / TRACK_DRAW_STEP)
    );

    for (var p of samples) {
        p.rails = {};

        for (var track of newRoute.rails) {
            var off = interpolateRailOffset(track, p.d);
            if (off) p.rails[track.rail] = off;
        }
    }
    // ============================================================
    // POINT BLADE GEOMETRY
    //
    // Uses the existing trackSwitches records.
    // Does not create or modify switch records.
    //
    // Each switch produces four GPU geometry states:
    //
    //     Stem blade:   original and moved
    //     Branch blade: original and moved
    //
    // The two blade sides are selected from their actual
    // lateral positions, not hardcoded left/right assumptions.
    // ============================================================

    var POINT_BLADE_LENGTH = pointsMovingLength;
    var POINT_EPS = 1e-7;
    var POINT_THIN_WIDTH = clamp(
        Number(pointsThinWidth),
                                 0,
                                 1
    );


    var pointSwitchDefinitions = [];
    var pointBladeSegments = new Map();

    var pointThrowDistance =
    Number(pointsMovedDistance) * Number(RAIL_WIDTH);

    if (!Number.isFinite(pointThrowDistance)) {
        pointThrowDistance = 0;
    }


    // ------------------------------------------------------------
    // FIND THE RAIL RUN THAT COVERS THE COMPLETE POINT WINDOW
    // ------------------------------------------------------------

    function findPointTrack(rail, startDistance, endDistance) {

        rail = Number(rail);

        // Rail zero is the master track.
        if (rail === 0) {
            return {
                found: true,
                track: null
            };
        }

        for (var candidate of newRoute.rails) {

            if (Number(candidate.rail) !== rail) {
                continue;
            }

            if (
                Number(candidate.startDistance) <= startDistance + POINT_EPS &&
                Number(candidate.endDistance) >= endDistance - POINT_EPS
            ) {
                return {
                    found: true,
                    track: candidate
                };
            }
        }

        return {
            found: false,
            track: null
        };
    }


    // ------------------------------------------------------------
    // SAMPLE THE ACTUAL ROUTE AT AN EXACT DISTANCE
    //
    // This lets the point geometry use ten individual one-metre
    // segments even if the normal route sampling changes.
    // ------------------------------------------------------------

    function samplePointMasterAt(distance) {

        if (
            distance < samples[0].d - POINT_EPS ||
            distance > samples[samples.length - 1].d + POINT_EPS
        ) {
            return null;
        }

        var low = 0;
        var high = samples.length - 1;

        while (low + 1 < high) {

            var middle = Math.floor((low + high) * 0.5);

            if (samples[middle].d <= distance) {
                low = middle;
            } else {
                high = middle;
            }
        }

        var a = samples[low];
        var b = samples[high];

        var span = b.d - a.d;

        if (span <= POINT_EPS) {
            return null;
        }

        var f = clamp(
            (distance - a.d) / span,
                      0,
                      1
        );

        var headingDifference = b.heading - a.heading;

        while (headingDifference > Math.PI) {
            headingDifference -= Math.PI * 2;
        }

        while (headingDifference < -Math.PI) {
            headingDifference += Math.PI * 2;
        }

        var brightness0 = Number.isFinite(Number(a.brightness))
        ? Number(a.brightness)
        : 1;

        var brightness1 = Number.isFinite(Number(b.brightness))
        ? Number(b.brightness)
        : 1;

        return {
            d: distance,

            x: lerp(a.x, b.x, f),
            y: lerp(a.y, b.y, f),
            z: lerp(a.z, b.z, f),

            heading: a.heading + headingDifference * f,

            curvature: headingDifference / span,

            brightness: lerp(brightness0, brightness1, f)
        };
    }


    // ------------------------------------------------------------
    // OFFSET HELPER
    // ------------------------------------------------------------

    function pointOffsetAt(track, distance) {

        if (!track) {
            return {
                x: 0,
                y: 0,
                dx: 0,
                dy: 0
            };
        }

        return interpolateRailOffset(track, distance);
    }


    // ------------------------------------------------------------
    // MAIN TRACK RAIL TYPE
    // ------------------------------------------------------------

    function pointMainRailTypeAt(distance) {

        var type = 0;

        for (var event of mainRailTypeEvents) {

            if (event.distance <= distance + POINT_EPS) {
                type = Number(event.railType) || 0;
            } else {
                break;
            }
        }

        return type;
    }


    // ------------------------------------------------------------
    // READ EXISTING SWITCHES
    // ------------------------------------------------------------

    var pointSwitchSource =
    typeof trackSwitches !== 'undefined' &&
    Array.isArray(trackSwitches)
    ? trackSwitches
    : [];

    for (
        var switchIndex = 0;
    switchIndex < pointSwitchSource.length;
         switchIndex++
    ) {

        var sw = pointSwitchSource[switchIndex];

        if (!Array.isArray(sw) || sw.length < 5) {
            continue;
        }

        var switchType = sw[3];

        if (
            switchType !== 'facing points' &&
                switchType !== 'non facing points'
        ) {
            continue;
        }

        var physicalDistance = Number(sw[5]);

        if (!Number.isFinite(physicalDistance)) {
            physicalDistance = Number(sw[0]);
        }

        if (!Number.isFinite(physicalDistance)) {
            continue;
        }

        var stemRail = Number(sw[1]);
        var branchRail = Number(sw[2]);

        if (
            !Number.isSafeInteger(stemRail) ||
            !Number.isSafeInteger(branchRail) ||
            stemRail === branchRail
        ) {
            continue;
        }


        // Facing points:
        // The branch starts at the physical point.
        //
        // Non-facing points:
        // The branch finishes at the physical point.

        var windowStart;
        var windowEnd;

        if (switchType === 'facing points') {

            windowStart = physicalDistance;
            windowEnd = physicalDistance + POINT_BLADE_LENGTH;

        } else {

            windowStart = physicalDistance - POINT_BLADE_LENGTH;
            windowEnd = physicalDistance;
        }


        // Both rail runs must cover the whole window.
        // Do not extrapolate rails beyond their actual runs.

        var stemResult = findPointTrack(
            stemRail,
            windowStart,
            windowEnd
        );

        var branchResult = findPointTrack(
            branchRail,
            windowStart,
            windowEnd
        );

        if (!stemResult.found || !branchResult.found) {
            continue;
        }

        var stemTrack = stemResult.track;
        var branchTrack = branchResult.track;


        // --------------------------------------------------------
        // DETERMINE WHICH RAIL SIDES FACE EACH OTHER
        // --------------------------------------------------------

        var referenceDistance =
        (windowStart + windowEnd) * 0.5;

        var stemReference = pointOffsetAt(
            stemTrack,
            referenceDistance
        );

        var branchReference = pointOffsetAt(
            branchTrack,
            referenceDistance
        );

        if (!stemReference || !branchReference) {
            continue;
        }

        var separation =
        branchReference.x - stemReference.x;

        // If their offsets coincide at the midpoint, try other
        // positions in the same physical window.

        if (Math.abs(separation) <= POINT_EPS) {

            for (var probeStep = 1; probeStep < POINT_BLADE_LENGTH; probeStep++) {

                var probeDistance = windowStart + probeStep;

                var probeStem = pointOffsetAt(
                    stemTrack,
                    probeDistance
                );

                var probeBranch = pointOffsetAt(
                    branchTrack,
                    probeDistance
                );

                if (!probeStem || !probeBranch) continue;

                separation = probeBranch.x - probeStem.x;

                if (Math.abs(separation) > POINT_EPS) {
                    break;
                }
            }
        }

        if (Math.abs(separation) <= POINT_EPS) {
            continue;
        }

        // The inner rail of the stem faces the branch.
        // The inner rail of the branch faces the stem.

        var stemSide = separation > 0 ? 1 : -1;
        var branchSide = -stemSide;


        var pointDefinition = {

            switchIndex: switchIndex,

                type: switchType,

                track1: stemRail,
                track2: branchRail,

                physicalDistance: physicalDistance,

                windowStart: windowStart,
                windowEnd: windowEnd,

                blades: [

                    {
                        bladeIndex: 0,

                        rail: stemRail,
                        track: stemTrack,
                        railSide: stemSide,

                        // Move away from the other track.
                        moveX: -stemSide * pointThrowDistance
                    },

                    {
                        bladeIndex: 1,

                        rail: branchRail,
                        track: branchTrack,
                        railSide: branchSide,

                        // Move away from the other track.
                        moveX: -branchSide * pointThrowDistance
                    }
                ],

                segments: []
        };


        // --------------------------------------------------------
        // CREATE EXACTLY TEN ONE-METRE GEOMETRY SEGMENTS
        // --------------------------------------------------------

        for (
            var step = 0;
        step < POINT_BLADE_LENGTH;
        step++
        ) {

            var d0 = windowStart + step;
            var d1 = d0 + 1;

            var p0 = samplePointMasterAt(d0);
            var p1 = samplePointMasterAt(d1);

            if (!p0 || !p1) {
                continue;
            }

            var stem0 = pointOffsetAt(stemTrack, d0);
            var stem1 = pointOffsetAt(stemTrack, d1);

            var branch0 = pointOffsetAt(branchTrack, d0);
            var branch1 = pointOffsetAt(branchTrack, d1);

            if (
                !stem0 ||
                !stem1 ||
                !branch0 ||
                !branch1
            ) {
                continue;
            }

            pointDefinition.segments.push({
                step: step,
                p0: p0,
                p1: p1
            });
        }

        if (!pointDefinition.segments.length) {
            continue;
        }


        // --------------------------------------------------------
        // MARK THE NORMAL RAIL GEOMETRY TO BE REPLACED
        //
        // Trackbed geometry remains untouched.
        // Only the two inner rail sides are replaced.
        // --------------------------------------------------------

        for (var baseIndex = 0; baseIndex < segmentTotal; baseIndex++) {

            var baseP0 = samples[baseIndex];
            var baseP1 = samples[baseIndex + 1];

            if (
                baseP0.d < windowStart - POINT_EPS ||
                baseP1.d > windowEnd + POINT_EPS
            ) {
                continue;
            }

            var baseStem0 = pointOffsetAt(stemTrack, baseP0.d);
            var baseStem1 = pointOffsetAt(stemTrack, baseP1.d);

            var baseBranch0 = pointOffsetAt(branchTrack, baseP0.d);
            var baseBranch1 = pointOffsetAt(branchTrack, baseP1.d);

            if (
                !baseStem0 ||
                !baseStem1 ||
                !baseBranch0 ||
                !baseBranch1
            ) {
                continue;
            }

            var segmentKeys = pointBladeSegments.get(baseIndex);

            if (!segmentKeys) {
                segmentKeys = new Set();
                pointBladeSegments.set(baseIndex, segmentKeys);
            }

            for (var blade of pointDefinition.blades) {
                segmentKeys.add(
                    blade.rail + ':' + blade.railSide
                );
            }
        }

        pointSwitchDefinitions.push(pointDefinition);
    }
    var zones = [];
    var totalVertices = 0;

    for (
        var zoneStart = 0;
    zoneStart < segmentTotal;
    zoneStart += SEGMENTS_PER_ZONE
    ) {
        var zoneEnd = Math.min(segmentTotal, zoneStart + SEGMENTS_PER_ZONE);

        var vertices = [];
        var pointVertices = [];
        var pointRanges = [];

        var zoneSegmentCount = zoneEnd - zoneStart;
        var segmentFirst = new Uint32Array(zoneSegmentCount);
        var segmentCount = new Uint32Array(zoneSegmentCount);

        for (var i = zoneStart; i < zoneEnd; i++) {
            var localIndex = i - zoneStart;

            segmentFirst[localIndex] = vertices.length / FLOATS_PER_VERTEX;

            var p0 = samples[i];
            var p1 = samples[i + 1];

            // Apply any main-track RailType changes at this segment's start.
            while (
                mainRailTypeIndex < mainRailTypeEvents.length &&
                mainRailTypeEvents[mainRailTypeIndex].distance <= p0.d + 1e-6
            ) {
                mainRailType =
                mainRailTypeEvents[mainRailTypeIndex].railType;
                mainRailTypeIndex++;
            }

            for (var physicalTrack of physicalTracks) {

                // Skip main track geometry before the lowest route position.
                if (
                    physicalTrack === null &&
                    p0.d < firstRouteDistance
                ) {
                    continue;
                }

                var trackDistances = trackTextureDistances.get(physicalTrack);

                // Only the main track (null) uses the event-based override.
                // Only the main track (null) uses the event-based override.
                var railTypeOverride =
                physicalTrack === null ? mainRailType : undefined;

                // Get the actual track type used by this segment.
                var effectiveRailType = physicalTrack === null
                ? mainRailType
                : getRailTypeAtDistance(physicalTrack, p0.d);

                // Any negative texture mapping means this track is invisible.
                // Skip its trackbed and both rails before generating vertices.
                var textureMapping = use_track_texture[effectiveRailType];

                if (
                    textureMapping &&
                    Number(textureMapping[0]) < 0
                ) {
                    segmentCount[localIndex] = 0;
                    continue;
                }

                addTrackbedSegment(
                    vertices,
                    p0,
                    p1,
                    physicalTrack,
                    trackDistances[i],
                    trackDistances[i + 1],
                    railTypeOverride,
                    newRoute.rails,
                    cracks
                );

                var pointKeys = pointBladeSegments.get(i);

                var physicalRailNumber = physicalTrack
                ? Number(physicalTrack.rail)
                : 0;


                // The normal rail is retained unless it is being replaced
                // by dedicated switch blade geometry.

                if (
                    !pointKeys ||
                    !pointKeys.has(physicalRailNumber + ':-1')
                ) {
                    addRailSegment(
                        vertices,
                        p0,
                        p1,
                        physicalTrack,
                        -1,
                        railTypeOverride
                    );
                }

                if (
                    !pointKeys ||
                    !pointKeys.has(physicalRailNumber + ':1')
                ) {
                    addRailSegment(
                        vertices,
                        p0,
                        p1,
                        physicalTrack,
                        1,
                        railTypeOverride
                    );
                }
            }

            segmentCount[localIndex] =
            vertices.length / FLOATS_PER_VERTEX -
            segmentFirst[localIndex];
        }
        // ============================================================
        // GENERATE THE FOUR POINT BLADE VARIANTS
        //
        // Each blade gets:
        //     1. Original position
        //     2. Moved position
        //
        // Width tapers from 100% to 10% over ten one-metre segments.
        // ============================================================

        var zoneStartDistance = samples[zoneStart].d;
        var zoneEndDistance = samples[zoneEnd].d;

        for (var pointDefinition of pointSwitchDefinitions) {

            for (var blade of pointDefinition.blades) {

                for (var position of ['original', 'moved']) {

                    var firstPointVertex =
                    pointVertices.length / FLOATS_PER_VERTEX;

                    for (var pointSegment of pointDefinition.segments) {

                        var pp0 = pointSegment.p0;
                        var pp1 = pointSegment.p1;

                        // Each one-metre segment belongs to one zone.
                        if (
                            pp0.d < zoneStartDistance - POINT_EPS ||
                            pp1.d > zoneEndDistance + POINT_EPS
                        ) {
                            continue;
                        }


                        // Respect the existing rail texture visibility setting.
                        // Respect the existing rail texture visibility setting.
                        var pointRailType = blade.track
                        ? getRailTypeAtDistance(blade.track, pp0.d)
                        : pointMainRailTypeAt(pp0.d);

                        var pointTextureMapping =
                        use_track_texture[pointRailType];

                        // Any negative texture mapping means the blade is invisible.
                        if (
                            pointTextureMapping &&
                            Number(pointTextureMapping[0]) < 0
                        ) {
                            continue;
                        }


                        // --------------------------------------------------------
                        // POSITION ALONG THE POINT BLADE
                        // --------------------------------------------------------

                        var u0 = clamp(
                            pointSegment.step / POINT_BLADE_LENGTH,
                            0,
                            1
                        );

                        var u1 = clamp(
                            (pointSegment.step + 1) / POINT_BLADE_LENGTH,
                                       0,
                                       1
                        );

                        var isFacing =
                        pointDefinition.type === 'facing points';


                        // --------------------------------------------------------
                        // WIDTH TAPER
                        //
                        // Facing points:
                        //     Narrow at the physical switch end.
                        //
                        // Non-facing points:
                        //     Narrow at the physical switch end, approached
                        //     from the opposite direction.
                        // --------------------------------------------------------

                        var widthScale0 = isFacing
                        ? POINT_THIN_WIDTH +
                        (1 - POINT_THIN_WIDTH) * u0
                        : 1 - (1 - POINT_THIN_WIDTH) * u0;

                        var widthScale1 = isFacing
                        ? POINT_THIN_WIDTH +
                        (1 - POINT_THIN_WIDTH) * u1
                        : 1 - (1 - POINT_THIN_WIDTH) * u1;


                        // --------------------------------------------------------
                        // GRADUAL MOVEMENT
                        //
                        // Non-facing:
                        //     No movement at the wide end.
                        //     Full movement at the narrow end.
                        //
                        // Facing:
                        //     Full movement at the narrow end.
                        //     No movement at the wide end.
                        //
                        // smoothStep prevents an abrupt change of direction
                        // at either end of the blade.
                        // --------------------------------------------------------

                        var movementProgress0 = isFacing
                        ? 1 - u0
                        : u0;

                        var movementProgress1 = isFacing
                        ? 1 - u1
                        : u1;

                        // --------------------------------------------------------
                        // --------------------------------------------------------
                        // INWARD OFFSET ONLY AT THE NARROW TIP
                        // --------------------------------------------------------

                        var inwardAmount = position === 'original'
                        ? -blade.railSide * RAIL_WIDTH * 0.45
                        : 0;

                        // Facing points have their narrow tip at u = 0.
                        // Non-facing points have their narrow tip at u = 1.

                        var tipProgress0 = isFacing ? 1 - u0 : u0;
                        var tipProgress1 = isFacing ? 1 - u1 : u1;

                        var offsetShift0 =
                        inwardAmount * smoothStep(tipProgress0);

                        var offsetShift1 =
                        inwardAmount * smoothStep(tipProgress1);

                        var offsetGradient0 =
                        inwardAmount *
                        (isFacing ? -1 : 1) *
                        6 * tipProgress0 * (1 - tipProgress0) /
                        POINT_BLADE_LENGTH;

                        var offsetGradient1 =
                        inwardAmount *
                        (isFacing ? -1 : 1) *
                        6 * tipProgress1 * (1 - tipProgress1) /
                        POINT_BLADE_LENGTH;


                        // --------------------------------------------------------
                        // GRADUAL MOVEMENT OF THE SWITCHED BLADE
                        // --------------------------------------------------------

                        if (position === 'moved') {

                            offsetShift0 =
                            blade.moveX * smoothStep(movementProgress0);

                            offsetShift1 =
                            blade.moveX * smoothStep(movementProgress1);

                            var movementDirection = isFacing ? -1 : 1;

                            offsetGradient0 =
                            blade.moveX *
                            movementDirection *
                            6 * u0 * (1 - u0) /
                            POINT_BLADE_LENGTH;

                            offsetGradient1 =
                            blade.moveX *
                            movementDirection *
                            6 * u1 * (1 - u1) /
                            POINT_BLADE_LENGTH;
                        }


                        // --------------------------------------------------------
                        // GENERATE THIS BLADE SEGMENT
                        // --------------------------------------------------------

                        addRailSegment(
                            pointVertices,
                            pp0,
                            pp1,
                            blade.track,
                            blade.railSide,
                            undefined,
                            {
                                offsetShift0: offsetShift0,
                                offsetShift1: offsetShift1,

                                offsetGradient0: offsetGradient0,
                                offsetGradient1: offsetGradient1,

                                widthScale0: widthScale0,
                                widthScale1: widthScale1
                            }
                        );
                    }

                    var pointVertexCount =
                    pointVertices.length / FLOATS_PER_VERTEX -
                    firstPointVertex;

                    if (pointVertexCount > 0) {

                        pointRanges.push({

                            switchIndex: pointDefinition.switchIndex,

                                type: pointDefinition.type,

                                track1: pointDefinition.track1,
                                track2: pointDefinition.track2,

                                bladeIndex: blade.bladeIndex,

                                rail: blade.rail,
                                railSide: blade.railSide,

                                position: position,

                                first: firstPointVertex,
                                count: pointVertexCount,

                                startDistance: pointDefinition.windowStart,
                                endDistance: pointDefinition.windowEnd
                        });
                    }
                }
            }
        }
        // Do not allocate GPU resources for a zone with no visible geometry.
        if (
            vertices.length === 0 &&
            pointVertices.length === 0
        ) {
            continue;
        }

        var meshData = new Float32Array(vertices);
        var pointMeshData = new Float32Array(pointVertices);

        var buffer = gl.createBuffer();
        var zoneVao = gl.createVertexArray();

        var pointBuffer = null;
        var pointVao = null;

        if (pointMeshData.length > 0) {
            pointBuffer = gl.createBuffer();
            pointVao = gl.createVertexArray();
        }

        if (
            !buffer ||
            !zoneVao ||
            (
                pointMeshData.length > 0 &&
                (!pointBuffer || !pointVao)
            )
        ) {

            if (buffer) gl.deleteBuffer(buffer);
            if (zoneVao) gl.deleteVertexArray(zoneVao);

            if (pointBuffer) gl.deleteBuffer(pointBuffer);
            if (pointVao) gl.deleteVertexArray(pointVao);

            for (var allocatedZone of zones) {

                gl.deleteBuffer(allocatedZone.buffer);
                gl.deleteVertexArray(allocatedZone.vao);

                if (allocatedZone.pointBuffer) {
                    gl.deleteBuffer(allocatedZone.pointBuffer);
                }

                if (allocatedZone.pointVao) {
                    gl.deleteVertexArray(allocatedZone.pointVao);
                }
            }

            throw new Error(
                'Could not allocate WebGL resources for a route zone.'
            );
        }

        if (!buffer || !zoneVao) {
            if (buffer) gl.deleteBuffer(buffer);
            if (zoneVao) gl.deleteVertexArray(zoneVao);

            for (var allocatedZone of zones) {
                gl.deleteBuffer(allocatedZone.buffer);
                gl.deleteVertexArray(allocatedZone.vao);
            }

            throw new Error('Could not allocate WebGL resources for a route zone.');
        }

        gl.bindVertexArray(zoneVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(
            aPosition, 3, gl.FLOAT, false, BYTES_PER_VERTEX, 0
        );

        gl.enableVertexAttribArray(aTexCoord);
        gl.vertexAttribPointer(
            aTexCoord, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 12
        );

        gl.enableVertexAttribArray(aTextureIndex);
        gl.vertexAttribPointer(
            aTextureIndex, 1, gl.FLOAT, false, BYTES_PER_VERTEX, 20
        );

        gl.enableVertexAttribArray(aColour);
        gl.vertexAttribPointer(
            aColour, 3, gl.FLOAT, false, BYTES_PER_VERTEX, 24
        );

        gl.bufferData(gl.ARRAY_BUFFER, meshData, gl.STATIC_DRAW);
        // ------------------------------------------------------------
        // UPLOAD POINT BLADE GEOMETRY
        // ------------------------------------------------------------

        if (pointMeshData.length > 0) {

            gl.bindVertexArray(pointVao);

            gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);

            gl.enableVertexAttribArray(aPosition);
            gl.vertexAttribPointer(
                aPosition, 3, gl.FLOAT, false, BYTES_PER_VERTEX, 0
            );

            gl.enableVertexAttribArray(aTexCoord);
            gl.vertexAttribPointer(
                aTexCoord, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 12
            );

            gl.enableVertexAttribArray(aTextureIndex);
            gl.vertexAttribPointer(
                aTextureIndex, 1, gl.FLOAT, false, BYTES_PER_VERTEX, 20
            );

            gl.enableVertexAttribArray(aColour);
            gl.vertexAttribPointer(
                aColour, 3, gl.FLOAT, false, BYTES_PER_VERTEX, 24
            );

            gl.bufferData(
                gl.ARRAY_BUFFER,
                pointMeshData,
                gl.STATIC_DRAW
            );
        }
        zones.push({
            buffer: buffer,
            vao: zoneVao,

            pointBuffer: pointBuffer,
            pointVao: pointVao,
            pointRanges: pointRanges,

            segmentStart: zoneStart,
            segmentEnd: zoneEnd,

            segmentFirst: segmentFirst,
            segmentCount: segmentCount,

            vertexCount: meshData.length / FLOATS_PER_VERTEX,

            pointVertexCount:
            pointMeshData.length / FLOATS_PER_VERTEX
        });

        totalVertices +=
        meshData.length / FLOATS_PER_VERTEX +
        pointMeshData.length / FLOATS_PER_VERTEX;

        totalVertices += meshData.length / FLOATS_PER_VERTEX;
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

    routeMesh = {
        zones: zones,
        segmentTotal: segmentTotal,
        vertexTotal: totalVertices,
        zoneLength: ZONE_LENGTH
    };
    // Index the uploaded point geometry by its trackSwitches index.
    // This is built once, not during rendering.

    routeMesh.pointRangesBySwitch = new Map();

    for (var zone of routeMesh.zones) {

        for (var pointRange of zone.pointRanges || []) {

            var switchIndex = pointRange.switchIndex;

            if (!routeMesh.pointRangesBySwitch.has(switchIndex)) {
                routeMesh.pointRangesBySwitch.set(
                    switchIndex,
                        []
                );
            }

            routeMesh.pointRangesBySwitch.get(switchIndex).push({
                zone: zone,
                range: pointRange
            });
        }

        zone.activePointRanges = [];
    }

    console.log(
        'Route mesh ready: ' + zones.length +
        ' zones, ' + ZONE_LENGTH + ' m per zone, ' +
        totalVertices.toLocaleString() + ' vertices.'
    );
}



















/* 3D OBJECT RENDERER */

var objectProgram = null;
var objectLocations = null;

// The placement rotation values should be radians.
// This matches JavaScript Math.sin() and Math.cos().
function compileObjectShader(type, source) {
    var shader = gl.createShader(type);

    if (!shader) {
        throw new Error('Could not create object shader.');
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);

        throw new Error('Object shader compilation failed: ' + message);
    }

    return shader;
}

function ensureObjectRenderer() {
    if (objectProgram) return;

    var vertexSource = `#version 300 es
    precision highp float;

    in vec3 aPosition;
    in vec3 aNormal;
    in vec2 aTexCoord;

    uniform vec3 uModelPosition;
    uniform float uYaw;
    uniform float uPitch;
    uniform float uRoll;

    uniform vec3 uCameraPosition;
    uniform vec3 uForward;
    uniform vec3 uRight;

    uniform vec2 uResolution;
    uniform float uTanHalfFov;
    uniform float uNear;
    uniform float uFar;

    out vec2 vTexCoord;
    out vec3 vNormal;

    vec3 rotateModel(vec3 p) {
        float cr = cos(uRoll);
        float sr = sin(uRoll);

        p = vec3(
            cr * p.x - sr * p.y,
            sr * p.x + cr * p.y,
            p.z
        );

        float cp = cos(uPitch);
        float sp = sin(uPitch);

        p = vec3(
            p.x,
            cp * p.y - sp * p.z,
            sp * p.y + cp * p.z
        );

        float cy = cos(uYaw);
        float sy = sin(uYaw);

        p = vec3(
            cy * p.x + sy * p.z,
            p.y,
            -sy * p.x + cy * p.z
        );

        return p;
    }

    void main() {
        vec3 worldPosition = uModelPosition + rotateModel(aPosition);
        vec3 delta = worldPosition - uCameraPosition;

        float forward = dot(delta, uForward);
        float lateral = dot(delta, uRight);

        vec3 cameraUp = cross(uForward, uRight);
        float vertical = dot(delta, cameraUp);

        float aspect = uResolution.x / uResolution.y;

        float xClip = lateral / (uTanHalfFov * aspect);
        float yClip = vertical / uTanHalfFov - 0.08 * forward;

        float A = (uFar + uNear) / (uFar - uNear);
        float B = (-2.0 * uFar * uNear) / (uFar - uNear);

        gl_Position = vec4(
            xClip,
            yClip,
            A * forward + B,
            forward
        );

        vTexCoord = aTexCoord;
        vNormal = normalize(rotateModel(aNormal));
    }
    `;

    var fragmentSource = `#version 300 es
    precision highp float;

    in vec2 vTexCoord;
    in vec3 vNormal;

    uniform sampler2D uTexture;
    uniform bool uHasTexture;

    uniform vec4 uColour;
    uniform bool uUseTransparentColor;
    uniform vec3 uTransparentColor;
    uniform bool uRepeatS;
    uniform bool uRepeatT;
    uniform int uAlphaPass;

    out vec4 outColour;


    void main() {
        vec2 uv = vTexCoord;

        if (uRepeatS) uv.x = fract(uv.x);
        if (uRepeatT) uv.y = fract(uv.y);

        vec4 texel = uHasTexture
        ? texture(uTexture, uv)
        : vec4(1.0);

        if (
            uHasTexture &&
            uUseTransparentColor &&
            all(lessThan(
                abs(texel.rgb - uTransparentColor),
                         vec3(0.5 / 255.0)
            ))
        ) {
            discard;
        }

        vec4 colour = texel * uColour;

        // Fully transparent pixels must never write colour or depth.
        if (colour.a <= 0.001) discard;

        // Pass 0: draw only opaque pixels and write their depth.
        if (uAlphaPass == 0) {
            if (colour.a < 0.999) discard;
            colour.a = 1.0;
        }
        // Pass 1: draw only semi-transparent pixels.
        // They will blend with the already-rendered scenery.
        else {
            if (colour.a >= 0.999) discard;
        }

        vec3 lightDirection = normalize(vec3(-0.35, 0.8, 0.45));

        float light = 0.35
        + 0.65 * max(
            dot(normalize(vNormal), lightDirection),
                     0.0
        );

        outColour = vec4(colour.rgb * light, colour.a);
    }

    `;

    var vertexShader = compileObjectShader(
        gl.VERTEX_SHADER,
        vertexSource
    );

    var fragmentShader;

    try {
        fragmentShader = compileObjectShader(
            gl.FRAGMENT_SHADER,
            fragmentSource
        );
    } catch (error) {
        gl.deleteShader(vertexShader);
        throw error;
    }

    var newProgram = gl.createProgram();

    if (!newProgram) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error('Could not create object shader program.');
    }

    gl.attachShader(newProgram, vertexShader);
    gl.attachShader(newProgram, fragmentShader);
    gl.linkProgram(newProgram);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(newProgram, gl.LINK_STATUS)) {
        var message = gl.getProgramInfoLog(newProgram);
        gl.deleteProgram(newProgram);

        throw new Error('Object shader link failed: ' + message);
    }

    objectProgram = newProgram;

    objectLocations = {
        aPosition: gl.getAttribLocation(objectProgram, 'aPosition'),
        aNormal: gl.getAttribLocation(objectProgram, 'aNormal'),
        aTexCoord: gl.getAttribLocation(objectProgram, 'aTexCoord'),

        uModelPosition: gl.getUniformLocation(
            objectProgram, 'uModelPosition'
        ),
        uYaw: gl.getUniformLocation(objectProgram, 'uYaw'),
        uPitch: gl.getUniformLocation(objectProgram, 'uPitch'),
        uRoll: gl.getUniformLocation(objectProgram, 'uRoll'),

        uCameraPosition: gl.getUniformLocation(
            objectProgram, 'uCameraPosition'
        ),
        uForward: gl.getUniformLocation(objectProgram, 'uForward'),
        uRight: gl.getUniformLocation(objectProgram, 'uRight'),

        uResolution: gl.getUniformLocation(objectProgram, 'uResolution'),
        uTanHalfFov: gl.getUniformLocation(
            objectProgram, 'uTanHalfFov'
        ),
        uNear: gl.getUniformLocation(objectProgram, 'uNear'),
        uFar: gl.getUniformLocation(objectProgram, 'uFar'),

        uTexture: gl.getUniformLocation(objectProgram, 'uTexture'),
        uHasTexture: gl.getUniformLocation(objectProgram, 'uHasTexture'),
        uColour: gl.getUniformLocation(objectProgram, 'uColour'),

        uUseTransparentColor: gl.getUniformLocation(
            objectProgram, 'uUseTransparentColor'
        ),

        uTransparentColor: gl.getUniformLocation(
            objectProgram, 'uTransparentColor'
        ),

        uRepeatS: gl.getUniformLocation(objectProgram, 'uRepeatS'),

        uRepeatT: gl.getUniformLocation(objectProgram, 'uRepeatT'),

        uAlphaPass: gl.getUniformLocation(objectProgram, 'uAlphaPass')
    };

    console.log('3D object renderer initialised.');
}




function drawRouteObjects(pos, startDistance, endDistance, cam, basis) {
    var placements = route["3dobject"];

    if (!Array.isArray(placements) || placements.length === 0) {
        return;
    }

    ensureObjectRenderer();

    var oldBlend = gl.isEnabled(gl.BLEND);
    var oldCull = gl.isEnabled(gl.CULL_FACE);
    var oldDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Route objects are currently drawn two-sided.
    gl.disable(gl.CULL_FACE);

    gl.useProgram(objectProgram);

    gl.uniform3f(
        objectLocations.uCameraPosition,
        cam.x, cam.y, cam.z
    );

    gl.uniform3f(
        objectLocations.uForward,
        basis.fx, basis.fy, basis.fz
    );

    gl.uniform3f(
        objectLocations.uRight,
        basis.rx, 0, basis.rz
    );

    gl.uniform2f(
        objectLocations.uResolution,
        canvas.width, canvas.height
    );

    gl.uniform1f(
        objectLocations.uTanHalfFov,
        Math.tan(FOV_DEG * Math.PI / 360)
    );

    gl.uniform1f(objectLocations.uNear, NEAR);

    gl.uniform1f(
        objectLocations.uFar,
        DRAW_AHEAD + DRAW_BEHIND + 500
    );

    gl.uniform1i(objectLocations.uTexture, 0);

    function objectCameraDepth(p) {
        return (
            ((Number(p.x) || 0) - cam.x) * basis.fx +
            ((Number(p.z) || 0) - cam.z) * basis.fz
        );
    }

    // Draw farther objects before nearer objects.
    var orderedPlacements = placements.slice();

    orderedPlacements.sort(function (a, b) {
        return objectCameraDepth(b) - objectCameraDepth(a);
    });

    try {
        // Pass 0 draws opaque pixels.
        // Pass 1 draws semi-transparent pixels.
        for (var alphaPass = 0; alphaPass < 2; alphaPass++) {
            gl.depthMask(alphaPass === 0);

            gl.uniform1i(
                objectLocations.uAlphaPass,
                alphaPass
            );

            for (var placement of orderedPlacements) {

                // Only draw objects in the camera's route-distance range.
                if (
                    Number.isFinite(placement.distance) &&
                    (
                        placement.distance < startDistance ||
                        placement.distance > endDistance
                    )
                ) {
                    continue;
                }

                var modelIndex = Number(placement.modelIndex);

                if (
                    !Number.isInteger(modelIndex) ||
                    modelIndex < 0
                ) {
                    continue;
                }

                var entry = route_objects[modelIndex];

                if (
                    !entry ||
                    entry[3] !== true ||
                    !entry[4] ||
                    !Array.isArray(entry[4].meshes)
                ) {
                    continue;
                }

                var modelMeshes = entry[4].meshes;

                // Set all model transforms for this route object.
                gl.uniform3f(
                    objectLocations.uModelPosition,
                    Number(placement.x) || 0,
                             Number(placement.y) || 0,
                             Number(placement.z) || 0
                );

                gl.uniform1f(
                    objectLocations.uYaw,
                    Number(placement.yaw) || 0
                );

                gl.uniform1f(
                    objectLocations.uPitch,
                    Number(placement.pitch) || 0
                );

                gl.uniform1f(
                    objectLocations.uRoll,
                    Number(placement.roll) || 0
                );

                for (var mesh of modelMeshes) {
                    if (
                        !mesh.positionBuffer ||
                        !mesh.normalBuffer ||
                        !mesh.uvBuffer ||
                        !mesh.indexBuffer ||
                        mesh.indexCount <= 0
                    ) {
                        continue;
                    }

                    // Create a VAO once for each uploaded model mesh.
                    if (!mesh.objectVao) {
                        mesh.objectVao = gl.createVertexArray();

                        if (!mesh.objectVao) {
                            throw new Error(
                                'Could not create a model vertex array.'
                            );
                        }

                        gl.bindVertexArray(mesh.objectVao);

                        gl.bindBuffer(
                            gl.ARRAY_BUFFER,
                            mesh.positionBuffer
                        );

                        gl.enableVertexAttribArray(
                            objectLocations.aPosition
                        );

                        gl.vertexAttribPointer(
                            objectLocations.aPosition,
                            3, gl.FLOAT, false, 0, 0
                        );

                        gl.bindBuffer(
                            gl.ARRAY_BUFFER,
                            mesh.normalBuffer
                        );

                        gl.enableVertexAttribArray(
                            objectLocations.aNormal
                        );

                        gl.vertexAttribPointer(
                            objectLocations.aNormal,
                            3, gl.FLOAT, false, 0, 0
                        );

                        gl.bindBuffer(
                            gl.ARRAY_BUFFER,
                            mesh.uvBuffer
                        );

                        gl.enableVertexAttribArray(
                            objectLocations.aTexCoord
                        );

                        gl.vertexAttribPointer(
                            objectLocations.aTexCoord,
                            2, gl.FLOAT, false, 0, 0
                        );

                        gl.bindBuffer(
                            gl.ELEMENT_ARRAY_BUFFER,
                            mesh.indexBuffer
                        );

                        gl.bindVertexArray(null);
                    }

                    // Set this mesh's texture and material.
                    gl.activeTexture(gl.TEXTURE0);

                    gl.bindTexture(
                        gl.TEXTURE_2D,
                        mesh.texture
                    );

                    gl.uniform1i(
                        objectLocations.uHasTexture,
                        mesh.texture ? 1 : 0
                    );

                    gl.uniform4fv(
                        objectLocations.uColour,
                        mesh.colour || [1, 1, 1, 1]
                    );

                    var transparentColor = mesh.transparentColor;

                    gl.uniform1i(
                        objectLocations.uUseTransparentColor,
                        transparentColor ? 1 : 0
                    );

                    gl.uniform3fv(
                        objectLocations.uTransparentColor,
                        transparentColor || [0, 0, 0]
                    );

                    gl.uniform1i(
                        objectLocations.uRepeatS,
                        mesh.repeatS ? 1 : 0
                    );

                    gl.uniform1i(
                        objectLocations.uRepeatT,
                        mesh.repeatT ? 1 : 0
                    );

                    gl.bindVertexArray(mesh.objectVao);

                    gl.drawElements(
                        gl.TRIANGLES,
                        mesh.indexCount,
                        mesh.indexType,
                        0
                    );
                }
            }
        }

    } finally {
        gl.bindVertexArray(null);

        // Restore the previous depth-writing state.
        gl.depthMask(oldDepthMask);

        // ----------------------------------------------------
        // RESET THE SHARED OBJECT SHADER
        //
        // The train body also uses objectProgram.
        // Do not leave the last scenery object's transforms
        // or material settings for the train renderer to inherit.
        // ----------------------------------------------------

        gl.uniform3f(
            objectLocations.uModelPosition,
            0, 0, 0
        );

        gl.uniform1f(
            objectLocations.uYaw,
            0
        );

        gl.uniform1f(
            objectLocations.uPitch,
            0
        );

        gl.uniform1f(
            objectLocations.uRoll,
            0
        );

        gl.uniform1i(
            objectLocations.uAlphaPass,
            0
        );

        gl.uniform1i(
            objectLocations.uHasTexture,
            0
        );

        gl.uniform4f(
            objectLocations.uColour,
            1, 1, 1, 1
        );

        gl.uniform1i(
            objectLocations.uUseTransparentColor,
            0
        );

        gl.uniform3f(
            objectLocations.uTransparentColor,
            0, 0, 0
        );

        gl.uniform1i(
            objectLocations.uRepeatS,
            0
        );

        gl.uniform1i(
            objectLocations.uRepeatT,
            0
        );

        // Restore the previous blending state.
        if (oldBlend) {
            gl.enable(gl.BLEND);
        } else {
            gl.disable(gl.BLEND);
        }

        // Restore the previous culling state.
        // This preserves the existing two-sided setting
        // whenever culling was disabled before this function.
        if (oldCull) {
            gl.enable(gl.CULL_FACE);
        } else {
            gl.disable(gl.CULL_FACE);
        }
    }
}







function updateStatus() {
    if (!route) { statusElement.textContent = 'No route loaded.'; return; }

    var d = pos
    var stations = route.stations || [];
    var limits = route.speedLimits || [];
    var stationIndex = Math.max(0, Math.min(Math.floor(Number(stationprogression) || 0), stations.length - 1));
    var nextStation = stations[stationIndex];
    var nearestStation = stations.length ? stations.reduce((a, b) => Math.abs(a.stopDistance - d) <= Math.abs(b.stopDistance - d) ? a : b) : null;
    var currentLimit = null;
    var upcomingLimits = [];
    for (var limit of limits) { if (limit.distance <= d + 1e-9) currentLimit = limit; else upcomingLimits.push(limit); }
    var activeZone = stations.find(s => Number.isFinite(Number(s.freeroamstart)) && Number.isFinite(Number(s.freeroamend)) && d >= Number(s.freeroamstart) - 1e-6 && d <= Number(s.freeroamend) + 1e-6) || null;
    var nearestFree = stations.reduce((best, s) => { var start = Number(s.freeroamstart); var end = Number(s.freeroamend); if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return best; var boundary = d < start ? start : d > end ? end : d - start <= end - d ? start : end; var gap = Math.abs(boundary - d); return !best || gap < best.gap ? { boundary: boundary, gap: gap } : best; }, null);


    var line1 = ('Pos ' + Math.floor(d) + ' | Next: ' + (nextStation ? nextStation.name + ' @ ' + Math.floor(nextStation.stopDistance) + ' (' + Math.floor(nextStation.stopDistance - d) + ')' + (nextStation.stopSide ? ' on ' + nextStation.stopSide : '') : 'none') + ' | nearest: ' + (nearestStation ? nearestStation.name + ' @ ' + Math.floor(nearestStation.stopDistance) + ' (' + Math.floor(nearestStation.stopDistance - d) + ')' + (nearestStation.stopSide ? ' on ' + nearestStation.stopSide : '') : 'none'))

    var line2 = ('Limit: ' + (currentLimit ? Math.floor(currentLimit.speed) + ' @ ' + Math.floor(currentLimit.distance) + ' (' + Math.floor(currentLimit.distance - d) + ')' : 'none') + ', Next: ' + (upcomingLimits[0] ? Math.floor(upcomingLimits[0].speed) + ' @ ' + Math.floor(upcomingLimits[0].distance) + ' (' + Math.floor(upcomingLimits[0].distance - d) + ')' : 'none') + ', after: ' + (upcomingLimits[1] ? Math.floor(upcomingLimits[1].speed) + ' @ ' + Math.floor(upcomingLimits[1].distance) + ' (' + Math.floor(upcomingLimits[1].distance - d) + ')' : 'none'))



    var line3 = (activeZone ? (activeZone.freeroamFromPlatform === true ? 'plat based ' : 'fixed based ') + Math.floor(activeZone.freeroamstart) + ' to ' + Math.floor(activeZone.freeroamend) : nearestFree ? 'nearest free ' + Math.floor(nearestFree.boundary) + ' (' + Math.floor(nearestFree.gap) + ')' : 'no free zones');




    // Helper function to safely round a value to 1 decimal place if it is a number
    const round1D = (val) => typeof val === 'number' ? Math.round(val * 10) / 10 : val;

    var statusSample = sampleAt(d);

    var mainTypeEvent = route.mainRailTypeEvents
    .filter(e => e.distance <= d)
    .slice(-1)[0];

    var mainType = mainTypeEvent?.railType ?? 0;

    // Find the rail run that actually covers the current distance.
    var rail1Track = route.rails.find(t => t.rail === 1 && t.segments.some(s => d >= s.a.d - 1e-7 && d < s.b.d - 1e-7));
    var rail2Track = route.rails.find(t => t.rail === 2 && t.segments.some(s => d >= s.a.d - 1e-7 && d < s.b.d - 1e-7));
    var rail3Track = route.rails.find(t => t.rail === 3 && t.segments.some(s => d >= s.a.d - 1e-7 && d < s.b.d - 1e-7));
    var rail4Track = route.rails.find(t => t.rail === 4 && t.segments.some(s => d >= s.a.d - 1e-7 && d < s.b.d - 1e-7));
    var rail5Track = route.rails.find(t => t.rail === 5 && t.segments.some(s => d >= s.a.d - 1e-7 && d < s.b.d - 1e-7));

    // Get the type for each active rail run.
    var rail1Type = rail1Track ? getRailTypeAtDistance(rail1Track, d) : '-';
    var rail2Type = rail2Track ? getRailTypeAtDistance(rail2Track, d) : '-';
    var rail3Type = rail3Track ? getRailTypeAtDistance(rail3Track, d) : '-';
    var rail4Type = rail4Track ? getRailTypeAtDistance(rail4Track, d) : '-';
    var rail5Type = rail5Track ? getRailTypeAtDistance(rail5Track, d) : '-';

    var line4 =
    '(0 t:' + mainType +
    ' v:' + (use_track_texture[mainType]?.[0] ?? '-') +
    ' s:' + (use_track_texture[mainType]?.[1] ?? '-') +
    ' x:0 y:0)' +

    ' (1 t:' + rail1Type +
    ' v:' + (use_track_texture[rail1Type]?.[0] ?? '-') +
    ' s:' + (use_track_texture[rail1Type]?.[1] ?? '-') +
    ' x:' + round1D(statusSample.rails[1]?.x ?? '-') +
    ' y:' + round1D(statusSample.rails[1]?.y ?? '-') + ')' +

    ' (2 t:' + rail2Type +
    ' v:' + (use_track_texture[rail2Type]?.[0] ?? '-') +
    ' s:' + (use_track_texture[rail2Type]?.[1] ?? '-') +
    ' x:' + round1D(statusSample.rails[2]?.x ?? '-') +
    ' y:' + round1D(statusSample.rails[2]?.y ?? '-') + ')' +

    ' (3 t:' + rail3Type +
    ' v:' + (use_track_texture[rail3Type]?.[0] ?? '-') +
    ' s:' + (use_track_texture[rail3Type]?.[1] ?? '-') +
    ' x:' + round1D(statusSample.rails[3]?.x ?? '-') +
    ' y:' + round1D(statusSample.rails[3]?.y ?? '-') + ')' +

    ' (4 t:' + rail4Type +
    ' v:' + (use_track_texture[rail4Type]?.[0] ?? '-') +
    ' s:' + (use_track_texture[rail4Type]?.[1] ?? '-') +
    ' x:' + round1D(statusSample.rails[4]?.x ?? '-') +
    ' y:' + round1D(statusSample.rails[4]?.y ?? '-') + ')' +

    ' (5 t:' + rail5Type +
    ' v:' + (use_track_texture[rail5Type]?.[0] ?? '-') +
    ' s:' + (use_track_texture[rail5Type]?.[1] ?? '-') +
    ' x:' + round1D(statusSample.rails[5]?.x ?? '-') +
    ' y:' + round1D(statusSample.rails[5]?.y ?? '-') + ')';


    statusElement.innerHTML = (line1 + '<br>' + line2 + '<br>' + line3 + '<br>' + line4 + '<br>' + fps)
}







window.addEventListener('dragover', function (e) {
    e.preventDefault();
});

window.addEventListener('drop', async function (e) {
    e.preventDefault();

    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;

    try {
        var text = await readFileText(f);
        installRoute(buildGeometry(parseEvents(text)));
    } catch (err) {
        console.error(err);
        statusElement.textContent = 'Could not load file: ' + err.message;
    }
});

window.addEventListener('wheel', function (e) {
    e.preventDefault();
}, { passive: false });













window.initSimulator = function () {

    main_menu(0)
    //loadBtn.click();
};
