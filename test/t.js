



var route_contains_translucent_textured_faces = false
var traindoors = [];
var door_positions = [];

// ============================================================
// PASSENGERS
// ============================================================

var passengers = [];

// Index in route.stations of the station whose passengers
// are currently waiting.
var passengerStationIndex = -1;

// Detect when a different route is loaded.
var passengerRouteReference = null;

// Time of the previous passenger update.
var passengerLastUpdateTime = 0;

// Walking speed in metres per second.
var passengerWalkSpeed = 1;

// GPU mesh used by the temporary passenger cubes.
var passengerPlaceholderMesh = null;
var freeroamX = 3
var freeroamY = 0.6
var left_doors = 0;  //  how far opened are the doors 0 is fully shut and 1 is fully open
var right_doors = 0;  //   how far opened are the doors 0 is fully shut and 1 is fully open
var left_doors_mode = 0;  // 0 is shut, 1 is opening, 2 is open, a minus number is waiting to close and it is a timestamp (in negative) of when the door will close, and 4 is closing
var right_doors_mode = 0;  // 0 is shut, 1 is opening, 2 is open, a minus number is waiting to close and it is a timestamp (in negative) of when the door will close, and 4 is closing
var door_speed = 3;   // how many seconds to open the doors
var door_alarm = 3;   // how many seconds to wait before closing doors
var gangways = true;
var cab3d = [];
var train_body_dimentions = [];
train_body_thickness = 0.1;
var trainBodyMeshes = [];

var trainBodyTextureOuter = null;
var trainBodyTextureInner = null;

var trainDoorTextureOuter = null;
var trainDoorTextureInner = null;
var trainBetweenTextureOuter = null;
var trainBetweenTextureInner = null;
var trainCabTextureOuter = null;
var trainCabTextureInner = null;
var roundDepth = 0.2;
var roundWidth = 0.25;
var trainEndMeshes = [];
var trainNPCDoorMeshes = [];
var trainBodyTextureCache = new Map();
var trainFloorMeshes = [];
var trainFloorPlacements = [];
var trainComponentMeshes = [];
var trainComponentPlacements = [];
var trainGangwayMeshes = [];
var boatMeshes = [];
var bogies = [];
var bogies_npc = [];
var coach_positions = [];
var coach_positions_npc = [];
var bogies_angle = [];
var bogies_angle_npc = [];
var Jacobs_bogies = false; // true means its like a tram where coaches sit between bogies.  False means regukar train bogies.
var trains_bogies_percentage = 50;  //  For non Jacobs bogies only. Value of how far the trains bogies are down the coach.  100 means they are at the very ends and overlapping next coach, and 0 means they are in the very middle.  So 50 is a normal value.
var coaches = 4;
var coachlength = 22;
var cab_overhang = 1;  // On the very front and rear how much longer should the coach be.  This is important for Jacobs_bogies.
var non_cab_overhang = -0.5;  // how huch should the non cab end of coaches overhang.  set to -0.5 for normal train so coaches are not touching, and set to -1.5 on jacobs bogies, so make sure the bendy gangway can be seen.
var bogie_proportions = 1.9;
var bogie_height = 1;
var livery_includes_cab = false;

var train_use_bogies = true;
var train_use_body = true;

var train_floor_height = 1;
var train_roof_height = 3.6;
var train_doortop_percentage = 0.8;


var EYE_HEIGHT = 2;
var cameraXOffset = -0.5;
var camera_view = 1;
var camera_subview = 0;
var lookx = 0;
var looky = 0;
var cameraArrowKeys = {
    left: false,
    right: false,
    up: false,
    down: false,
    space: false,
    b: false,
    n: false,
    dot: false,
    commar: false
};
var cameraMoveOffset = {
    x: 0,
    y: 0,
    z: 0
};


var trainWidth = 2
var LOOK_AHEAD = 6.0;
var train_length = ((coaches * coachlength) + (cab_overhang * 2));
var adjusted_train_length = train_length;
var reverser = 0;
var throttle = 0;
var crashed = false;
var crashedtext = "";
var current_train = "UK Class 323";
var current_vf = "unknown";
var current_livery = null;

function setup_new_train(set_train,set_livery){

    list_of_trains.find(t => t.name === current_train).scripts.train_config();

    lookx = 0;
    looky = 0;

    cameraArrowKeys = {
        left: false,
        right: false,
        up: false,
        down: false,
        space: false
    };
    cameraMoveOffset = {
        x: 0,
        y: 0,
        z: 0
    };
    LOOK_AHEAD = 6.0;
    train_length = ((coaches * coachlength) + (cab_overhang * 2));
    reverser = 0;
    throttle = 0;

    camera_subview = 0;
    crashed = false;
    crashedtext = "";
    current_train = set_train;
    current_livery = set_livery;
    // GPU meshes are created later, after route installation.
}



























// ============================================================
// PASSENGER RENDERER
// ============================================================

var passengerProgram = null;
var passengerLocations = null;
var passengerPlaceholderMesh = null;

// Reserved for the later GLB loader.
var passengerConfig = null;
var passengerModels = Object.create(null);
var passengerTextures = new Array(11).fill(null);

// Instanced cube data.
// Each passenger occupies 9 values / 36 bytes:
// position x, y, z, yaw,
// colour r, g, b, a,
// bone palette base.
var passengerInstanceCapacity = 0;
var passengerInstanceData = null;
var passengerInstanceFloats = null;
var passengerInstanceUint32 = null;
var passengerInstanceBytes = null;


// ============================================================
// COMPILE PASSENGER SHADER
// ============================================================

function compilePassengerShader(type, source) {

    var shader = gl.createShader(type);

    if (!shader) {
        throw new Error('Could not create passenger shader.');
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {

        var message = gl.getShaderInfoLog(shader);

        gl.deleteShader(shader);

        throw new Error(
            'Passenger shader compilation failed: ' + message
        );
    }

    return shader;
}


// ============================================================
// SET UP PASSENGER RENDERER
//
// Call once after WebGL has been initialised.
//
// The vertex shader supports:
// - Position
// - Normal
// - Texture coordinates
// - Four bone indices
// - Four bone weights
// - Per-passenger position and yaw
// - Per-passenger bone palette offset
//
// The current fallback cubes do not use skinning.
// ============================================================

function setup_passenger_renderer() {

    if (passengerProgram && passengerPlaceholderMesh) {
        return;
    }

    var vertexSource = `#version 300 es
    precision highp float;
    precision highp int;

    in vec3 aPosition;
    in vec3 aNormal;
    in vec2 aTexCoord;

    // Skeletal skinning attributes.
    in uvec4 aJoints;
    in vec4 aWeights;

    // Per-passenger instance attributes.
    // xyz = world position, w = yaw.
    in vec4 aInstancePositionYaw;

    in vec4 aInstanceColour;

    // Index of this passenger's first bone matrix
    // in the shared bone texture.
    in uint aInstanceBoneBase;

    uniform sampler2D uBoneMatrices;
    uniform bool uSkinned;

    uniform vec3 uCameraPosition;
    uniform vec3 uForward;
    uniform vec3 uRight;

    uniform vec2 uResolution;
    uniform float uTanHalfFov;
    uniform float uNear;
    uniform float uFar;

    out vec2 vTexCoord;
    out vec3 vNormal;
    out vec4 vColour;


    // --------------------------------------------------------
    // GET ONE BONE MATRIX FROM THE BONE TEXTURE
    //
    // Each matrix occupies four consecutive RGBA texels.
    // The texture width is 1.
    // --------------------------------------------------------

    mat4 getBoneMatrix(uint jointIndex) {

        int firstTexel =
        int(aInstanceBoneBase + jointIndex) * 4;

        return mat4(

            texelFetch(
                uBoneMatrices,
                ivec2(0, firstTexel),
                       0
            ),

            texelFetch(
                uBoneMatrices,
                ivec2(0, firstTexel + 1),
                       0
            ),

            texelFetch(
                uBoneMatrices,
                ivec2(0, firstTexel + 2),
                       0
            ),

            texelFetch(
                uBoneMatrices,
                ivec2(0, firstTexel + 3),
                       0
            )
        );
    }


    // --------------------------------------------------------
    // APPLY THE PASSENGER YAW
    //
    // This is the same Y-axis rotation used by the
    // existing object shader.
    // --------------------------------------------------------

    vec3 rotatePassenger(vec3 p, float yaw) {

        float cy = cos(yaw);
        float sy = sin(yaw);

        return vec3(
            cy * p.x + sy * p.z,
            p.y,
            -sy * p.x + cy * p.z
        );
    }


    void main() {

        vec3 localPosition = aPosition;
        vec3 localNormal = aNormal;

        // ----------------------------------------------------
        // SKELETAL SKINNING
        //
        // Four bone influences per vertex.
        // The cube fallback has uSkinned=false.
        // ----------------------------------------------------

        if (uSkinned) {

            float weightTotal =
            aWeights.x +
            aWeights.y +
            aWeights.z +
            aWeights.w;

            if (weightTotal > 0.00001) {

                mat4 skinMatrix = mat4(0.0);

                if (aWeights.x > 0.0) {
                    skinMatrix +=
                    getBoneMatrix(aJoints.x) * aWeights.x;
                }

                if (aWeights.y > 0.0) {
                    skinMatrix +=
                    getBoneMatrix(aJoints.y) * aWeights.y;
                }

                if (aWeights.z > 0.0) {
                    skinMatrix +=
                    getBoneMatrix(aJoints.z) * aWeights.z;
                }

                if (aWeights.w > 0.0) {
                    skinMatrix +=
                    getBoneMatrix(aJoints.w) * aWeights.w;
                }

                skinMatrix *= 1.0 / weightTotal;

                localPosition =
                (skinMatrix * vec4(aPosition, 1.0)).xyz;

                localNormal =
                mat3(skinMatrix) * aNormal;
            }
        }


        // ----------------------------------------------------
        // WORLD POSITION
        // ----------------------------------------------------

        float yaw = aInstancePositionYaw.w;

        vec3 worldPosition =
        aInstancePositionYaw.xyz +
        rotatePassenger(localPosition, yaw);

        vec3 delta = worldPosition - uCameraPosition;

        float forward = dot(delta, uForward);
        float lateral = dot(delta, uRight);

        vec3 cameraUp = cross(uForward, uRight);

        float vertical = dot(delta, cameraUp);

        float aspect =
        uResolution.x / uResolution.y;

        float xClip =
        lateral / (uTanHalfFov * aspect);

        float yClip =
        vertical / uTanHalfFov - 0.08 * forward;

        float A =
        (uFar + uNear) / (uFar - uNear);

        float B =
        (-2.0 * uFar * uNear) / (uFar - uNear);


        // ----------------------------------------------------
        // SAME PROJECTION AS THE MAIN OBJECT SHADER
        // ----------------------------------------------------

        gl_Position = vec4(
            xClip,
            yClip,
            A * forward + B,
            forward
        );

        vTexCoord = aTexCoord;

        vNormal = normalize(
            rotatePassenger(localNormal, yaw)
        );

        vColour = aInstanceColour;
    }
    `;


    var fragmentSource = `#version 300 es
    precision highp float;

    in vec2 vTexCoord;
    in vec3 vNormal;
    in vec4 vColour;

    uniform sampler2D uTexture;
    uniform bool uHasTexture;
    uniform vec4 uMaterialColour;

    out vec4 outColour;

    void main() {

        vec4 texel = uHasTexture
        ? texture(uTexture, vTexCoord)
        : vec4(1.0);

        vec4 colour =
        texel * vColour * uMaterialColour;

        if (colour.a <= 0.001) {
            discard;
        }

        vec3 lightDirection =
        normalize(vec3(-0.35, 0.8, 0.45));

        float light = 0.35
        + 0.65 * max(
            dot(normalize(vNormal), lightDirection),
                     0.0
        );

        outColour = vec4(
            colour.rgb * light,
            colour.a
        );
    }
    `;


    // --------------------------------------------------------
    // COMPILE AND LINK
    // --------------------------------------------------------

    var vertexShader = compilePassengerShader(
        gl.VERTEX_SHADER,
        vertexSource
    );

    var fragmentShader;

    try {

        fragmentShader = compilePassengerShader(
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

        throw new Error(
            'Could not create passenger shader program.'
        );
    }

    gl.attachShader(newProgram, vertexShader);
    gl.attachShader(newProgram, fragmentShader);

    gl.linkProgram(newProgram);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(newProgram, gl.LINK_STATUS)) {

        var message = gl.getProgramInfoLog(newProgram);

        gl.deleteProgram(newProgram);

        throw new Error(
            'Passenger shader link failed: ' + message
        );
    }

    passengerProgram = newProgram;


    // --------------------------------------------------------
    // SHADER LOCATIONS
    // --------------------------------------------------------

    passengerLocations = {

        aPosition:
        gl.getAttribLocation(passengerProgram, 'aPosition'),

        aNormal:
        gl.getAttribLocation(passengerProgram, 'aNormal'),

        aTexCoord:
        gl.getAttribLocation(passengerProgram, 'aTexCoord'),

        aJoints:
        gl.getAttribLocation(passengerProgram, 'aJoints'),

        aWeights:
        gl.getAttribLocation(passengerProgram, 'aWeights'),

        aInstancePositionYaw:
        gl.getAttribLocation(
            passengerProgram,
            'aInstancePositionYaw'
        ),

        aInstanceColour:
        gl.getAttribLocation(
            passengerProgram,
            'aInstanceColour'
        ),

        aInstanceBoneBase:
        gl.getAttribLocation(
            passengerProgram,
            'aInstanceBoneBase'
        ),

        uBoneMatrices:
        gl.getUniformLocation(
            passengerProgram,
            'uBoneMatrices'
        ),

        uSkinned:
        gl.getUniformLocation(
            passengerProgram,
            'uSkinned'
        ),

        uCameraPosition:
        gl.getUniformLocation(
            passengerProgram,
            'uCameraPosition'
        ),

        uForward:
        gl.getUniformLocation(
            passengerProgram,
            'uForward'
        ),

        uRight:
        gl.getUniformLocation(
            passengerProgram,
            'uRight'
        ),

        uResolution:
        gl.getUniformLocation(
            passengerProgram,
            'uResolution'
        ),

        uTanHalfFov:
        gl.getUniformLocation(
            passengerProgram,
            'uTanHalfFov'
        ),

        uNear:
        gl.getUniformLocation(
            passengerProgram,
            'uNear'
        ),

        uFar:
        gl.getUniformLocation(
            passengerProgram,
            'uFar'
        ),

        uTexture:
        gl.getUniformLocation(
            passengerProgram,
            'uTexture'
        ),

        uHasTexture:
        gl.getUniformLocation(
            passengerProgram,
            'uHasTexture'
        ),

        uMaterialColour:
        gl.getUniformLocation(
            passengerProgram,
            'uMaterialColour'
        )
    };


    // --------------------------------------------------------
    // CREATE THE FALLBACK CUBE
    //
    // Dimensions:
    // X = 0.5
    // Y = 1.6
    // Z = 0.25
    //
    // The bottom is at local Y=0.
    // --------------------------------------------------------

    var halfWidth = 0.25;
    var halfDepth = 0.125;
    var height = 1.6;

    var faces = [

        // RIGHT
        {
            normal: [1, 0, 0],
            vertices: [
                [halfWidth, 0, -halfDepth],
                [halfWidth, height, -halfDepth],
                [halfWidth, height, halfDepth],
                [halfWidth, 0, halfDepth]
            ]
        },

        // LEFT
        {
            normal: [-1, 0, 0],
            vertices: [
                [-halfWidth, 0, halfDepth],
                [-halfWidth, height, halfDepth],
                [-halfWidth, height, -halfDepth],
                [-halfWidth, 0, -halfDepth]
            ]
        },

        // TOP
        {
            normal: [0, 1, 0],
            vertices: [
                [-halfWidth, height, -halfDepth],
                [-halfWidth, height, halfDepth],
                [halfWidth, height, halfDepth],
                [halfWidth, height, -halfDepth]
            ]
        },

        // BOTTOM
        {
            normal: [0, -1, 0],
            vertices: [
                [-halfWidth, 0, halfDepth],
                [-halfWidth, 0, -halfDepth],
                [halfWidth, 0, -halfDepth],
                [halfWidth, 0, halfDepth]
            ]
        },

        // FRONT
        {
            normal: [0, 0, 1],
            vertices: [
                [-halfWidth, 0, halfDepth],
                [halfWidth, 0, halfDepth],
                [halfWidth, height, halfDepth],
                [-halfWidth, height, halfDepth]
            ]
        },

        // REAR
        {
            normal: [0, 0, -1],
            vertices: [
                [halfWidth, 0, -halfDepth],
                [-halfWidth, 0, -halfDepth],
                [-halfWidth, height, -halfDepth],
                [halfWidth, height, -halfDepth]
            ]
        }
    ];


    var cubePositions = [];
    var cubeNormals = [];
    var cubeUvs = [];
    var cubeIndices = [];

    for (var face of faces) {

        var firstVertex =
        cubePositions.length / 3;

        for (var vertex of face.vertices) {

            cubePositions.push(
                vertex[0],
                vertex[1],
                vertex[2]
            );

            cubeNormals.push(
                face.normal[0],
                face.normal[1],
                face.normal[2]
            );

            cubeUvs.push(0, 0);
        }

        cubeIndices.push(
            firstVertex,
            firstVertex + 1,
            firstVertex + 2,

            firstVertex,
            firstVertex + 2,
            firstVertex + 3
        );
    }


    var cubeIndexData =
    new Uint16Array(cubeIndices);

    var cubeVertexCount =
    cubePositions.length / 3;

    var initialCapacity = Math.max(
        64,
        Array.isArray(passengers) ? passengers.length : 0
    );

    passengerInstanceCapacity = initialCapacity;

    passengerInstanceData =
    new ArrayBuffer(initialCapacity * 36);

    passengerInstanceFloats =
    new Float32Array(passengerInstanceData);

    passengerInstanceUint32 =
    new Uint32Array(passengerInstanceData);

    passengerInstanceBytes =
    new Uint8Array(passengerInstanceData);


    // --------------------------------------------------------
    // CREATE GPU BUFFERS AND VAO
    // --------------------------------------------------------

    var mesh = {

        objectVao: gl.createVertexArray(),

        positionBuffer: gl.createBuffer(),

        normalBuffer: gl.createBuffer(),

        uvBuffer: gl.createBuffer(),

        jointsBuffer: gl.createBuffer(),

        weightsBuffer: gl.createBuffer(),

        indexBuffer: gl.createBuffer(),

        instanceBuffer: gl.createBuffer(),

        indexCount: cubeIndexData.length,

        indexType: gl.UNSIGNED_SHORT
    };


    if (
        !mesh.objectVao ||
        !mesh.positionBuffer ||
        !mesh.normalBuffer ||
        !mesh.uvBuffer ||
        !mesh.jointsBuffer ||
        !mesh.weightsBuffer ||
        !mesh.indexBuffer ||
        !mesh.instanceBuffer
    ) {

        throw new Error(
            'Could not create passenger cube buffers.'
        );
    }


    gl.bindVertexArray(mesh.objectVao);


    // Position
    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        mesh.positionBuffer
    );

    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(cubePositions),
                  gl.STATIC_DRAW
    );

    gl.enableVertexAttribArray(
        passengerLocations.aPosition
    );

    gl.vertexAttribPointer(
        passengerLocations.aPosition,
        3,
        gl.FLOAT,
        false,
        0,
        0
    );


    // Normal
    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        mesh.normalBuffer
    );

    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(cubeNormals),
                  gl.STATIC_DRAW
    );

    gl.enableVertexAttribArray(
        passengerLocations.aNormal
    );

    gl.vertexAttribPointer(
        passengerLocations.aNormal,
        3,
        gl.FLOAT,
        false,
        0,
        0
    );


    // Texture coordinates
    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        mesh.uvBuffer
    );

    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(cubeUvs),
                  gl.STATIC_DRAW
    );

    gl.enableVertexAttribArray(
        passengerLocations.aTexCoord
    );

    gl.vertexAttribPointer(
        passengerLocations.aTexCoord,
        2,
        gl.FLOAT,
        false,
        0,
        0
    );


    // Bone indices.
    // Zeroed because the fallback cube is not skinned.
    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        mesh.jointsBuffer
    );

    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Uint8Array(cubeVertexCount * 4),
                  gl.STATIC_DRAW
    );

    gl.enableVertexAttribArray(
        passengerLocations.aJoints
    );

    gl.vertexAttribIPointer(
        passengerLocations.aJoints,
        4,
        gl.UNSIGNED_BYTE,
        0,
        0
    );


    // Bone weights.
    // Zeroed because uSkinned is false for the cube.
    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        mesh.weightsBuffer
    );

    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(cubeVertexCount * 4),
                  gl.STATIC_DRAW
    );

    gl.enableVertexAttribArray(
        passengerLocations.aWeights
    );

    gl.vertexAttribPointer(
        passengerLocations.aWeights,
        4,
        gl.FLOAT,
        false,
        0,
        0
    );


    // Indices
    gl.bindBuffer(
        gl.ELEMENT_ARRAY_BUFFER,
        mesh.indexBuffer
    );

    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        cubeIndexData,
        gl.STATIC_DRAW
    );


    // --------------------------------------------------------
    // INSTANCE BUFFER
    //
    // 9 values per passenger:
    // 4 floats for position/yaw
    // 4 floats for colour
    // 1 unsigned integer for bone base
    // --------------------------------------------------------

    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        mesh.instanceBuffer
    );

    gl.bufferData(
        gl.ARRAY_BUFFER,
        initialCapacity * 36,
        gl.DYNAMIC_DRAW
    );


    // Position and yaw
    gl.enableVertexAttribArray(
        passengerLocations.aInstancePositionYaw
    );

    gl.vertexAttribPointer(
        passengerLocations.aInstancePositionYaw,
        4,
        gl.FLOAT,
        false,
        36,
        0
    );

    gl.vertexAttribDivisor(
        passengerLocations.aInstancePositionYaw,
        1
    );


    // Passenger colour
    gl.enableVertexAttribArray(
        passengerLocations.aInstanceColour
    );

    gl.vertexAttribPointer(
        passengerLocations.aInstanceColour,
        4,
        gl.FLOAT,
        false,
        36,
        16
    );

    gl.vertexAttribDivisor(
        passengerLocations.aInstanceColour,
        1
    );


    // Bone palette base
    gl.enableVertexAttribArray(
        passengerLocations.aInstanceBoneBase
    );

    gl.vertexAttribIPointer(
        passengerLocations.aInstanceBoneBase,
        1,
        gl.UNSIGNED_INT,
        36,
        32
    );

    gl.vertexAttribDivisor(
        passengerLocations.aInstanceBoneBase,
        1
    );


    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    passengerPlaceholderMesh = mesh;


    // Sampler assignments are constant.
    gl.useProgram(passengerProgram);

    gl.uniform1i(
        passengerLocations.uTexture,
        0
    );

    gl.uniform1i(
        passengerLocations.uBoneMatrices,
        1
    );

    // Leave the existing object program active, as the old
    // passenger function did.
    if (objectProgram) {
        gl.useProgram(objectProgram);
    } else {
        gl.useProgram(null);
    }

    console.log('Passenger renderer initialised.');
}











function draw_passenger_placeholders(
    startDistance,
    endDistance,
    cam,
    basis
) {

    if (!Array.isArray(passengers) || passengers.length === 0) {
        return;
    }

    if (!passengerProgram || !passengerPlaceholderMesh) {
        setup_passenger_renderer();
    }

    var mesh = passengerPlaceholderMesh;

    // --------------------------------------------------------
    // EXPAND THE INSTANCE BUFFER ONLY WHEN NECESSARY
    // --------------------------------------------------------

    if (passengers.length > passengerInstanceCapacity) {

        var newCapacity = passengerInstanceCapacity;

        while (newCapacity < passengers.length) {
            newCapacity *= 2;
        }

        passengerInstanceCapacity = newCapacity;

        passengerInstanceData =
        new ArrayBuffer(newCapacity * 36);

        passengerInstanceFloats =
        new Float32Array(passengerInstanceData);

        passengerInstanceUint32 =
        new Uint32Array(passengerInstanceData);

        passengerInstanceBytes =
        new Uint8Array(passengerInstanceData);

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            mesh.instanceBuffer
        );

        gl.bufferData(
            gl.ARRAY_BUFFER,
            newCapacity * 36,
            gl.DYNAMIC_DRAW
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }


    // --------------------------------------------------------
    // ANIMATION STATE
    //
    // Position changes in passenger[2] / passenger[3]
    // identify movement independently of train movement.
    //
    // These animation clocks are ready for the later model
    // animation evaluator. The cube itself is not animated.
    // --------------------------------------------------------

    var animationNow = performance.now() * 0.001;


    // --------------------------------------------------------
    // TEMPORARY COLOUR PALETTE
    //
    // Retains the existing jacket-based cube colours.
    // --------------------------------------------------------

    var jacketColours = [

        [0.8, 0.15, 0.12, 1],

        [0.12, 0.3, 0.85, 1],

        [0.12, 0.65, 0.25, 1],

        [0.8, 0.65, 0.1, 1]

    ];


    var instanceCount = 0;


    // --------------------------------------------------------
    // COLLECT PASSENGERS
    // --------------------------------------------------------

    for (var passenger of passengers) {

        if (!passenger) continue;


        // ----------------------------------------------------
        // STANDING / WALKING STATE
        //
        // Both animations retain their own playback position.
        // A short 0.15 second hold prevents walking from
        // flickering off between position updates.
        // ----------------------------------------------------

        if (!Number.isFinite(passenger._standingAnimationPosition)) {
            passenger._standingAnimationPosition = 0;
        }

        if (!Number.isFinite(passenger._walkingAnimationPosition)) {
            passenger._walkingAnimationPosition = 0;
        }

        var animationX = Number(passenger[2]);
        var animationZ = Number(passenger[3]);

        if (
            Number.isFinite(animationX) &&
            Number.isFinite(animationZ)
        ) {

            if (
                Number.isFinite(passenger._lastAnimationX) &&
                Number.isFinite(passenger._lastAnimationZ)
            ) {

                var animationDX =
                animationX - passenger._lastAnimationX;

                var animationDZ =
                animationZ - passenger._lastAnimationZ;

                if (
                    animationDX * animationDX +
                    animationDZ * animationDZ > 0.000001
                ) {
                    passenger._walkingUntil =
                    animationNow + 0.15;
                }
            }

            passenger._lastAnimationX = animationX;
            passenger._lastAnimationZ = animationZ;
        }


        passenger._activeAnimation =
        animationNow < (Number(passenger._walkingUntil) || 0)
        ? "walking"
        : "standing";


        var previousAnimationTime =
        Number(passenger._lastAnimationTime);

        if (Number.isFinite(previousAnimationTime)) {

            var animationDelta = Math.max(
                0,
                Math.min(animationNow - previousAnimationTime, 0.1)
            );

            if (passenger._activeAnimation === "walking") {

                passenger._walkingAnimationPosition +=
                animationDelta;

            } else {

                passenger._standingAnimationPosition +=
                animationDelta;
            }
        }

        passenger._lastAnimationTime = animationNow;


        // ----------------------------------------------------
        // PASSENGER WORLD POSITION
        // ----------------------------------------------------

        var worldX;
        var worldY;
        var worldZ;

        var passengerYaw =
        Number(passenger[4]);


        // ----------------------------------------------------
        // ONBOARD PASSENGER
        //
        // Z is local to the assigned coach door.
        // ----------------------------------------------------

        if (passenger[0] === true) {

            var door =
            door_positions[Number(passenger[1])];

            if (!door) continue;

            var coachIndex =
            Number(door.coach);

            if (passenger._isPlayerPassenger === true) {

                var playerCoachIndex =
                Number(passenger._playerCoachIndex);

                if (
                    Number.isInteger(playerCoachIndex) &&
                    playerCoachIndex >= 0 &&
                    playerCoachIndex < coach_positions.length
                ) {
                    coachIndex = playerCoachIndex;
                }
            }

            var coach =
            coach_positions[coachIndex];

            if (!coach) continue;

            var coachRoute =
            Number(coach[1]);

            if (
                !Number.isFinite(coachRoute) ||
                coachRoute < startDistance ||
                coachRoute > endDistance
            ) {
                continue;
            }

            var centreX =
            Number(coach[4]);

            var trackY =
            Number(coach[3]);

            var centreZ =
            Number(coach[5]);

            var coachYaw =
            Number(coach[7]);

            if (
                !Number.isFinite(centreX) ||
                !Number.isFinite(trackY) ||
                !Number.isFinite(centreZ)
            ) {
                continue;
            }

            if (!Number.isFinite(coachYaw)) {
                coachYaw = 0;
            }

            var localX =
            Number(passenger[2]);

            var localZ =
            Number(passenger[3]);

            if (
                !Number.isFinite(localX) ||
                !Number.isFinite(localZ)
            ) {
                continue;
            }

            var cosYaw =
            Math.cos(coachYaw);

            var sinYaw =
            Math.sin(coachYaw);

            worldX =
            centreX +
            cosYaw * localX +
            sinYaw * localZ;


            var passengerTrackY = trackY;

            if (!boat_mode) {

                var passengerSample = sampleAt(
                    coachRoute + localZ,
                    false
                );

                if (
                    passengerSample &&
                    Number.isFinite(Number(passengerSample.y))
                ) {
                    passengerTrackY =
                    Number(passengerSample.y);
                }
            }

            worldY =
            passengerTrackY +
            Number(RAIL_VERTICAL_OFFSET) +
            Number(RAIL_HEIGHT) +
            (
                Number.isFinite(Number(passenger._height))
                ? Number(passenger._height)
                : Number(train_floor_height)
            );

            worldZ =
            centreZ -
            sinYaw * localX +
            cosYaw * localZ;


            // Passengers remain upright.
            if (!Number.isFinite(passengerYaw)) {
                passengerYaw = coachYaw;
            }
        }


        // ----------------------------------------------------
        // PLATFORM PASSENGER
        //
        // Z is global route distance.
        // ----------------------------------------------------

        else {

            var passengerRoute =
            Number(passenger[3]);

            if (
                !Number.isFinite(passengerRoute) ||
                passengerRoute < startDistance ||
                passengerRoute > endDistance
            ) {
                continue;
            }

            var sample =
            sampleAt(passengerRoute, false);

            if (!sample) continue;

            var trackOffset =
            Number(passenger._trackOffset);

            if (!Number.isFinite(trackOffset)) {
                trackOffset = 0;
            }

            var passengerX =
            Number(passenger[2]);

            if (!Number.isFinite(passengerX)) {
                continue;
            }

            var point = worldPoint(
                sample,
                trackOffset + passengerX,
                0
            );

            if (!point) continue;

            worldX = Number(point.x);

            worldZ = Number(point.z);

            var platformPassengerHeight =
            Number(passenger._height);

            if (!Number.isFinite(platformPassengerHeight)) {
                platformPassengerHeight =
                Number(freeroamY) || 0;
            }

            worldY =
            Number(sample.y) +
            Number(RAIL_VERTICAL_OFFSET) +
            Number(RAIL_HEIGHT) +
            platformPassengerHeight;

            if (!Number.isFinite(passengerYaw)) {
                passengerYaw = Number(sample.heading);
            }
        }


        // ----------------------------------------------------
        // FINAL POSITION VALIDATION
        // ----------------------------------------------------

        if (
            !Number.isFinite(worldX) ||
            !Number.isFinite(worldY) ||
            !Number.isFinite(worldZ)
        ) {
            continue;
        }


        // ----------------------------------------------------
        // JACKET COLOUR
        // ----------------------------------------------------

        var jacketIndex =
        Math.floor(Number(passenger[8]));

        if (
            !Number.isFinite(jacketIndex) ||
            jacketIndex < 0 ||
            jacketIndex > 3
        ) {
            jacketIndex = 0;
        }


        // ----------------------------------------------------
        // WRITE THIS PASSENGER INTO THE INSTANCE BUFFER
        //
        // 9 values per passenger:
        // [x, y, z, yaw, r, g, b, a, boneBase]
        // ----------------------------------------------------

        var instanceBase = instanceCount * 9;

        passengerInstanceFloats[instanceBase] =
        worldX;

        passengerInstanceFloats[instanceBase + 1] =
        worldY;

        passengerInstanceFloats[instanceBase + 2] =
        worldZ;

        passengerInstanceFloats[instanceBase + 3] =
        passengerYaw;

        passengerInstanceFloats[instanceBase + 4] =
        jacketColours[jacketIndex][0];

        passengerInstanceFloats[instanceBase + 5] =
        jacketColours[jacketIndex][1];

        passengerInstanceFloats[instanceBase + 6] =
        jacketColours[jacketIndex][2];

        passengerInstanceFloats[instanceBase + 7] =
        jacketColours[jacketIndex][3];

        passengerInstanceUint32[instanceBase + 8] = 0;

        instanceCount++;
    }


    if (instanceCount === 0) {
        return;
    }


    // --------------------------------------------------------
    // DRAW ALL FALLBACK CUBES IN ONE CALL
    // --------------------------------------------------------

    gl.useProgram(passengerProgram);


    gl.uniform3f(
        passengerLocations.uCameraPosition,
        cam.x,
        cam.y,
        cam.z
    );

    gl.uniform3f(
        passengerLocations.uForward,
        basis.fx,
        basis.fy,
        basis.fz
    );

    gl.uniform3f(
        passengerLocations.uRight,
        basis.rx,
        0,
        basis.rz
    );

    gl.uniform2f(
        passengerLocations.uResolution,
        canvas.width,
        canvas.height
    );

    gl.uniform1f(
        passengerLocations.uTanHalfFov,
        Math.tan(FOV_DEG * Math.PI / 360)
    );

    gl.uniform1f(
        passengerLocations.uNear,
        NEAR
    );

    gl.uniform1f(
        passengerLocations.uFar,
        DRAW_AHEAD + DRAW_BEHIND + 500
    );


    // The fallback cubes are not skinned or textured.
    gl.uniform1i(
        passengerLocations.uSkinned,
        0
    );

    gl.uniform1i(
        passengerLocations.uHasTexture,
        0
    );

    gl.uniform4f(
        passengerLocations.uMaterialColour,
        1, 1, 1, 1
    );


    // Upload only the instances actually used this frame.
    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        mesh.instanceBuffer
    );

    gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        passengerInstanceFloats,
        0,
        instanceCount * 9
    );


    gl.bindVertexArray(mesh.objectVao);

    gl.drawElementsInstanced(
        gl.TRIANGLES,
        mesh.indexCount,
        mesh.indexType,
        0,
        instanceCount
    );


    gl.bindVertexArray(null);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);


    // Retain the old function's final program convention.
    if (objectProgram) {
        gl.useProgram(objectProgram);
    }
}

























/*
 R e*place the cube placeholders in draw_passenger_placeholders() with fully modelled 3D human characters.

 First, understand and preserve the existing rendering and positioning logic. The function already calculates the correct world position and orientation for every passenger, whether they are onboard a train or standing on a platform. Do not rewrite or alter these calculations.

 ONBOARD PASSENGERS:
 - Use the assigned door and coach to determine the passenger's coach.
 - Preserve the special _playerCoachIndex handling for the player passenger.
 - Preserve the conversion from coach-local X and Z coordinates into world coordinates.
 - Preserve track-height sampling and the existing vertical positioning.
 - Keep passengers upright, using yaw only. Do not apply coach pitch or roll.

 PLATFORM PASSENGERS:
 - Preserve global route-distance filtering.
 - Preserve track sampling, _trackOffset and lateral positioning through worldPoint().
 - Preserve the existing vertical positioning and track-heading fallback for yaw.

 HUMAN CHARACTER RENDERING:
 - Use actual 3D human character models rather than cubes or simple geometric placeholders.
 - Use passenger[6] for model selection, passenger[7] for skin, passenger[8] for jacket and passenger[9] for trousers.
 - Ensure these stored appearance values determine the appropriate character model and clothing appearance.
 - Apply each passenger's calculated world position and yaw to their character model.
 - Characters must stand at the calculated floor position, remain vertically upright and face the correct direction.
 - Support different character models and clothing combinations so passengers do not all look identical.
 - Reuse loaded models, meshes, textures and GPU buffers. Do not load or create character resources separately for every passenger on every frame.

 IMPLEMENTATION REQUIREMENTS:
 - Replace the cube mesh creation, cube colour palette and cube draw call with the human character rendering system.
 - Retain the existing passenger loop, validity checks, route-range filtering and WebGL state management wherever possible.
 - Integrate with the simulator's existing WebGL2 object-rendering system and shader conventions.
 - Do not introduce a separate rendering framework or unnecessarily duplicate existing functionality.
 - Do not change passenger movement, passenger array structure, AI behaviour, door assignments, coach positioning or camera behaviour.
 - Do not guess at existing model-loading functions or renderer interfaces. Inspect the existing source and use its actual functions and data structures.
 - Provide the complete revised function, not isolated fragments, and ensure the changes do not interfere with the rendering of trains, tracks or other simulator objects.
 */




// ============================================================
// DRAW PASSENGER PLACEHOLDERS
//
// Draws one cube for every passenger.
//
// Off-train:
//     passenger Z is global route distance.
//
// On-train:
//     passenger Z is local to the assigned coach door.
//
// This is a temporary visual representation. The random
// character and clothing values remain stored in the passenger
// array for a future character renderer.
// ============================================================

/*
function draw_passenger_placeholders(
    startDistance,
    endDistance,
    cam,
    basis
) {

    if (!Array.isArray(passengers) || passengers.length === 0) {
        return;
    }

    ensureObjectRenderer();

    // --------------------------------------------------------
    // CREATE THE CUBE MESH ONCE
    // --------------------------------------------------------

    if (!passengerPlaceholderMesh) {

        var halfSize = 0.2;

        var faces = [

            // RIGHT
            {
                normal: [1, 0, 0],
                vertices: [
                    [0.2, 0, -0.2],
                    [0.2, 1.6, -0.2],
                    [0.2, 1.6, 0.2],
                    [0.2, 0, 0.2]
                ]
            },

            // LEFT
            {
                normal: [-1, 0, 0],
                vertices: [
                    [-0.2, 0, 0.2],
                    [-0.2, 1.6, 0.2],
                    [-0.2, 1.6, -0.2],
                    [-0.2, 0, -0.2]
                ]
            },

            // TOP
            {
                normal: [0, 1, 0],
                vertices: [
                    [-0.2, 1.6, -0.2],
                    [-0.2, 1.6, 0.2],
                    [0.2, 1.6, 0.2],
                    [0.2, 1.6, -0.2]
                ]
            },

            // BOTTOM
            {
                normal: [0, -1, 0],
                vertices: [
                    [-0.2, 0, 0.2],
                    [-0.2, 0, -0.2],
                    [0.2, 0, -0.2],
                    [0.2, 0, 0.2]
                ]
            },

            // FRONT
            {
                normal: [0, 0, 1],
                vertices: [
                    [-0.2, 0, 0.2],
                    [0.2, 0, 0.2],
                    [0.2, 1.6, 0.2],
                    [-0.2, 1.6, 0.2]
                ]
            },

            // REAR
            {
                normal: [0, 0, -1],
                vertices: [
                    [0.2, 0, -0.2],
                    [-0.2, 0, -0.2],
                    [-0.2, 1.6, -0.2],
                    [0.2, 1.6, -0.2]
                ]
            }
        ];

        var cubePositions = [];
        var cubeNormals = [];
        var cubeUvs = [];
        var cubeIndices = [];

        for (var face of faces) {

            var firstVertex =
            cubePositions.length / 3;

            for (var vertex of face.vertices) {

                cubePositions.push(
                    vertex[0],
                    vertex[1],
                    vertex[2]
                );

                cubeNormals.push(
                    face.normal[0],
                    face.normal[1],
                    face.normal[2]
                );

                cubeUvs.push(0, 0);
            }

            cubeIndices.push(
                firstVertex,
                firstVertex + 1,
                firstVertex + 2,

                firstVertex,
                firstVertex + 2,
                firstVertex + 3
            );
        }

        var cubeIndexData =
        new Uint16Array(cubeIndices);

        passengerPlaceholderMesh = {

            positionBuffer: gl.createBuffer(),

            normalBuffer: gl.createBuffer(),

            uvBuffer: gl.createBuffer(),

            indexBuffer: gl.createBuffer(),

            objectVao: gl.createVertexArray(),

            indexCount: cubeIndexData.length,

            indexType: gl.UNSIGNED_SHORT,

            indexData: cubeIndexData,

            positions: new Float32Array(cubePositions),

            normals: new Float32Array(cubeNormals),

            uvs: new Float32Array(cubeUvs)

        };

        var mesh = passengerPlaceholderMesh;

        if (
            !mesh.positionBuffer ||
            !mesh.normalBuffer ||
            !mesh.uvBuffer ||
            !mesh.indexBuffer ||
            !mesh.objectVao
        ) {

            passengerPlaceholderMesh = null;

            return;
        }

        gl.bindVertexArray(mesh.objectVao);

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            mesh.positionBuffer
        );

        gl.bufferData(
            gl.ARRAY_BUFFER,
            mesh.positions,
            gl.STATIC_DRAW
        );

        gl.enableVertexAttribArray(
            objectLocations.aPosition
        );

        gl.vertexAttribPointer(
            objectLocations.aPosition,
            3,
            gl.FLOAT,
            false,
            0,
            0
        );

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            mesh.normalBuffer
        );

        gl.bufferData(
            gl.ARRAY_BUFFER,
            mesh.normals,
            gl.STATIC_DRAW
        );

        gl.enableVertexAttribArray(
            objectLocations.aNormal
        );

        gl.vertexAttribPointer(
            objectLocations.aNormal,
            3,
            gl.FLOAT,
            false,
            0,
            0
        );

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            mesh.uvBuffer
        );

        gl.bufferData(
            gl.ARRAY_BUFFER,
            mesh.uvs,
            gl.STATIC_DRAW
        );

        gl.enableVertexAttribArray(
            objectLocations.aTexCoord
        );

        gl.vertexAttribPointer(
            objectLocations.aTexCoord,
            2,
            gl.FLOAT,
            false,
            0,
            0
        );

        gl.bindBuffer(
            gl.ELEMENT_ARRAY_BUFFER,
            mesh.indexBuffer
        );

        gl.bufferData(
            gl.ELEMENT_ARRAY_BUFFER,
            mesh.indexData,
            gl.STATIC_DRAW
        );

        gl.bindVertexArray(null);
    }

    // --------------------------------------------------------
    // SAVE WEBGL STATE
    // --------------------------------------------------------

    var oldBlend = gl.isEnabled(gl.BLEND);
    var oldCull = gl.isEnabled(gl.CULL_FACE);
    var oldDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);

    var oldCullFace = gl.getParameter(gl.CULL_FACE_MODE);
    var oldFrontFace = gl.getParameter(gl.FRONT_FACE);

    var oldBlendSrcRGB = gl.getParameter(gl.BLEND_SRC_RGB);
    var oldBlendDstRGB = gl.getParameter(gl.BLEND_DST_RGB);
    var oldBlendSrcAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA);
    var oldBlendDstAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);

    // --------------------------------------------------------
    // SET OBJECT RENDERER
    // --------------------------------------------------------

    gl.enable(gl.BLEND);

    gl.blendFunc(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA
    );

    gl.disable(gl.CULL_FACE);

    gl.depthMask(true);

    gl.useProgram(objectProgram);

    gl.uniform3f(
        objectLocations.uCameraPosition,
        cam.x,
        cam.y,
        cam.z
    );

    gl.uniform3f(
        objectLocations.uForward,
        basis.fx,
        basis.fy,
        basis.fz
    );

    gl.uniform3f(
        objectLocations.uRight,
        basis.rx,
        0,
        basis.rz
    );

    gl.uniform2f(
        objectLocations.uResolution,
        canvas.width,
        canvas.height
    );

    gl.uniform1f(
        objectLocations.uTanHalfFov,
        Math.tan(FOV_DEG * Math.PI / 360)
    );

    gl.uniform1f(
        objectLocations.uNear,
        NEAR
    );

    gl.uniform1f(
        objectLocations.uFar,
        DRAW_AHEAD + DRAW_BEHIND + 500
    );

    gl.uniform1i(
        objectLocations.uTexture,
        0
    );

    gl.uniform1i(
        objectLocations.uHasTexture,
        0
    );

    gl.uniform1i(
        objectLocations.uUseTransparentColor,
        0
    );

    gl.uniform3f(
        objectLocations.uTransparentColor,
        0,
        0,
        0
    );

    gl.uniform1i(
        objectLocations.uRepeatS,
        0
    );

    gl.uniform1i(
        objectLocations.uRepeatT,
        0
    );

    gl.uniform1i(
        objectLocations.uAlphaPass,
        0
    );

    gl.activeTexture(gl.TEXTURE0);

    gl.bindTexture(gl.TEXTURE_2D, null);

    var mesh = passengerPlaceholderMesh;

    gl.bindVertexArray(mesh.objectVao);

    // --------------------------------------------------------
    // TEMPORARY COLOUR PALETTE
    //
    // The jacket value selects the cube colour.
    // --------------------------------------------------------

    var jacketColours = [

        [0.8, 0.15, 0.12, 1],

        [0.12, 0.3, 0.85, 1],

        [0.12, 0.65, 0.25, 1],

        [0.8, 0.65, 0.1, 1]

    ];

    // --------------------------------------------------------
    // DRAW EACH PASSENGER
    // --------------------------------------------------------

    try {

        for (var passenger of passengers) {

            var worldX;
            var worldY;
            var worldZ;

            var passengerYaw =
            Number(passenger[4]);

            var passengerPitch = 0;

            // ------------------------------------------------
            // ONBOARD PASSENGER
            //
            // Z is local to the assigned coach door.
            // ------------------------------------------------

            if (passenger[0] === true) {

                var door =
                door_positions[Number(passenger[1])];

                if (!door) continue;

                var coachIndex = Number(door.coach);

                if (passenger._isPlayerPassenger === true) {

                    var playerCoachIndex =
                    Number(passenger._playerCoachIndex);

                    if (
                        Number.isInteger(playerCoachIndex) &&
                        playerCoachIndex >= 0 &&
                        playerCoachIndex < coach_positions.length
                    ) {
                        coachIndex = playerCoachIndex;
                    }
                }

                var coach = coach_positions[coachIndex];

                if (!coach) continue;

                var coachRoute =
                Number(coach[1]);

                if (
                    !Number.isFinite(coachRoute) ||
                    coachRoute < startDistance ||
                    coachRoute > endDistance
                ) {
                    continue;
                }

                var centreX = Number(coach[4]);

                var trackY = Number(coach[3]);

                var centreZ = Number(coach[5]);

                var coachYaw = Number(coach[7]);

                if (
                    !Number.isFinite(centreX) ||
                    !Number.isFinite(trackY) ||
                    !Number.isFinite(centreZ)
                ) {
                    continue;
                }

                if (!Number.isFinite(coachYaw)) {
                    coachYaw = 0;
                }

                var localX = Number(passenger[2]);

                var localZ = Number(passenger[3]);

                if (
                    !Number.isFinite(localX) ||
                    !Number.isFinite(localZ)
                ) {
                    continue;
                }

                // --------------------------------------------------------
                // KEEP PASSENGERS UPRIGHT
                //
                // Do not apply coach pitch to passenger position or rotation.
                // Their orientation only uses yaw.
                // --------------------------------------------------------

                var cosYaw = Math.cos(coachYaw);

                var sinYaw = Math.sin(coachYaw);

                worldX =
                centreX +
                cosYaw * localX +
                sinYaw * localZ;

                // Use the track height at the passenger's longitudinal
                // position, so the passenger remains at floor level while
                // staying vertically upright.
                var passengerTrackY = trackY;

                if (!boat_mode) {

                    var passengerSample = sampleAt(
                        coachRoute + localZ,
                        false
                    );

                    if (
                        passengerSample &&
                        Number.isFinite(Number(passengerSample.y))
                    ) {
                        passengerTrackY =
                        Number(passengerSample.y);
                    }
                }

                worldY =
                passengerTrackY +
                Number(RAIL_VERTICAL_OFFSET) +
                Number(RAIL_HEIGHT) +
                (
                    Number.isFinite(Number(passenger._height))
                    ? Number(passenger._height)
                    : Number(train_floor_height)
                );

                worldZ =
                centreZ -
                sinYaw * localX +
                cosYaw * localZ;

                // Passenger pitch must always be zero.
                passengerPitch = 0;

                if (!Number.isFinite(passengerYaw)) {
                    passengerYaw = coachYaw;
                }

                if (!Number.isFinite(passengerYaw)) {
                    passengerYaw = coachYaw;
                }
            }

            // ------------------------------------------------
            // PLATFORM PASSENGER
            //
            // Z is global route distance.
            // ------------------------------------------------

            else {

                var passengerRoute =
                Number(passenger[3]);

                if (
                    !Number.isFinite(passengerRoute) ||
                    passengerRoute < startDistance ||
                    passengerRoute > endDistance
                ) {
                    continue;
                }

                var sample =
                sampleAt(passengerRoute, false);

                if (!sample) continue;

                var trackOffset =
                Number(passenger._trackOffset);

                if (!Number.isFinite(trackOffset)) {
                    trackOffset = 0;
                }

                var passengerX =
                Number(passenger[2]);

                if (!Number.isFinite(passengerX)) {
                    continue;
                }

                var point = worldPoint(
                    sample,
                    trackOffset + passengerX,
                    0
                );

                if (!point) continue;

                worldX = Number(point.x);

                worldZ = Number(point.z);

                var platformPassengerHeight = Number(passenger._height);

                if (!Number.isFinite(platformPassengerHeight)) {
                    platformPassengerHeight = Number(freeroamY) || 0;
                }

                worldY =
                Number(sample.y) +
                Number(RAIL_VERTICAL_OFFSET) +
                Number(RAIL_HEIGHT) +
                platformPassengerHeight;

                if (!Number.isFinite(passengerYaw)) {

                    passengerYaw =
                    Number(sample.heading);
                }
            }

            if (
                !Number.isFinite(worldX) ||
                !Number.isFinite(worldY) ||
                !Number.isFinite(worldZ)
            ) {
                continue;
            }

            // ------------------------------------------------
            // COLOUR
            // ------------------------------------------------

            var jacketIndex =
            Math.floor(Number(passenger[8]));

            if (
                !Number.isFinite(jacketIndex) ||
                jacketIndex < 0 ||
                jacketIndex > 3
            ) {
                jacketIndex = 0;
            }

            gl.uniform4fv(
                objectLocations.uColour,
                jacketColours[jacketIndex]
            );

            // ------------------------------------------------
            // PLACE THE CUBE
            // ------------------------------------------------

            gl.uniform3f(
                objectLocations.uModelPosition,
                worldX,
                worldY,
                worldZ
            );

            gl.uniform1f(
                objectLocations.uYaw,
                passengerYaw
            );

            gl.uniform1f(
                objectLocations.uPitch,
                passengerPitch
            );

            gl.uniform1f(
                objectLocations.uRoll,
                0
            );

            gl.drawElements(
                gl.TRIANGLES,
                mesh.indexCount,
                mesh.indexType,
                0
            );
        }

    } finally {

        // ----------------------------------------------------
        // RESTORE WEBGL STATE
        // ----------------------------------------------------

        gl.bindVertexArray(null);

        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        gl.depthMask(oldDepthMask);

        gl.cullFace(oldCullFace);
        gl.frontFace(oldFrontFace);

        if (oldCull) {
            gl.enable(gl.CULL_FACE);
        } else {
            gl.disable(gl.CULL_FACE);
        }

        gl.blendFuncSeparate(
            oldBlendSrcRGB,
            oldBlendDstRGB,
            oldBlendSrcAlpha,
            oldBlendDstAlpha
        );

        if (oldBlend) {
            gl.enable(gl.BLEND);
        } else {
            gl.disable(gl.BLEND);
        }

        gl.uniform3f(
            objectLocations.uModelPosition,
            0,
            0,
            0
        );

        gl.uniform1f(objectLocations.uYaw, 0);
        gl.uniform1f(objectLocations.uPitch, 0);
        gl.uniform1f(objectLocations.uRoll, 0);

        gl.uniform1i(
            objectLocations.uAlphaPass,
            0
        );
    }
}




*/




































var profileFrame = 0;
var profileLast = null;
var profileTimes = {};

function profileMark(section) {
    if (profileFrame < 200) return;

    var now = performance.now();

    if (profileLast !== null) {
        profileTimes[section] = (profileTimes[section] || 0) + now - profileLast;
    }

    profileLast = now;
}

function profileMarkEnd() {
    if (profileFrame < 200) {
        profileFrame++;
        return;
    }

    console.table(profileTimes);

    profileFrame = 1;
    profileLast = null;
    profileTimes = {};
}














function render() {

    var last_time = the_time;

    the_time = Date.now();

    fps = fps = (1000 / (the_time - last_time));

    if (status_inuse) {
        if (status_time < (the_time - 1000)) {
            status_inuse = false;
            sstatusElement.style.display = 'none';
        }
    }

    if (!renderLoopRunning) {
        renderAnimationFrameId = null;
        return;
    }





    profileMark("start")





    if (cameraArrowKeys.b) pos += (400 / fps);
    if (cameraArrowKeys.n) pos -= (400 / fps);

    ////////////////// speed calculations go here

    if (crashed) {
        //todo
    }

    ////////////////////////////////////////////////////
    // NPC TRAIN CONTROL
    ////////////////////////////////////////////////////

    speed_npc += (accel_npc / fps);

    if (speed_npc > upper_speed_limit_npc) {
        speed_npc = upper_speed_limit_npc;
    }

    if (speed_npc < lower_speed_limit_npc) {
        speed_npc = upper_speed_limit_npc;
    }

    pos_npc += (speed_npc / 3.6 / fps);

    if (cameraArrowKeys.dot) pos_npc -= (100 / fps);
    if (cameraArrowKeys.commar) pos_npc += (100 / fps);

    if (
        (pos_npc - train_length) <
        current_route_items_routing_npc[0][0]
    ) {
        pos_npc =
        current_route_items_routing_npc[0][0] +
        train_length;

        speed_npc = 0;
        accel_npc = 0;
    }

    if (
        pos_npc >
        current_route_items_routing_npc[
            current_route_items_routing_npc.length - 1
        ][0]
    ) {
        pos_npc =
        current_route_items_routing_npc[
            current_route_items_routing_npc.length - 1
        ][0];

        speed_npc = 0;
        accel_npc = 0;
    }

    // --------------------------------------------------------
    // FIRST FRAME
    // --------------------------------------------------------

    if (first_run) {

        first_run = false;

        if (
            Number(pos) - train_length <
            Number(current_route_items_detailed[0][1])
        ) {
            pos =
            Number(current_route_items_detailed[0][1]) +
            train_length + 1;
        }

        if (
            Number(pos) >
            Number(
                current_route_items_detailed[
                    current_route_items_detailed.length - 1
                ][1]
            )
        ) {
            pos =
            Number(
                current_route_items_detailed[
                    current_route_items_detailed.length - 1
                ][1]
            ) - 1;
        }

        if (
            activeRoute &&
            activeRoute.scripts &&
            typeof activeRoute.scripts.onFirstFrame === "function"
        ) {
            activeRoute.scripts.onFirstFrame();

        }
    }

    // --------------------------------------------------------
    // EVERY FRAME ROUTE SCRIPT
    // --------------------------------------------------------

    if (
        activeRoute &&
        activeRoute.scripts &&
        typeof activeRoute.scripts.onEveryFrame === "function"
    ) {
        activeRoute.scripts.onEveryFrame();
    }

    // ========================================================
    // TRAIN DOOR ANIMATION
    // ========================================================

    var doorDeltaTime = Math.max(
        0,
        (the_time - last_time) / 1000
    );

    var doorSpeedSeconds = Number(door_speed);

    if (
        !Number.isFinite(doorSpeedSeconds) ||
        doorSpeedSeconds <= 0
    ) {
        doorSpeedSeconds = 0.001;
    }

    var doorAlarmSeconds = Number(door_alarm);

    if (
        !Number.isFinite(doorAlarmSeconds) ||
        doorAlarmSeconds < 0
    ) {
        doorAlarmSeconds = 0;
    }

    var doorMovement =
    doorDeltaTime / doorSpeedSeconds;

    // --------------------------------------------------------
    // LEFT DOORS
    // --------------------------------------------------------

    if (left_doors_mode === 1) {

        left_doors = Math.min(
            1,
            Math.max(0, Number(left_doors) || 0) +
            doorMovement
        );

        if (left_doors >= 1) {
            left_doors = 1;
            left_doors_mode = 2;
        }

    } else if (left_doors_mode === 2) {

        left_doors = 1;

    } else if (left_doors_mode < 0) {

        left_doors = 1;

        if (the_time >= (0 - left_doors_mode)) {
            left_doors_mode = 4;
        }

    } else if (left_doors_mode === 4) {

        left_doors = Math.max(
            0,
            (Number(left_doors) || 0) -
            doorMovement
        );

        if (left_doors <= 0) {
            left_doors = 0;
            left_doors_mode = 0;
        }

    } else if (left_doors_mode === 0) {

        left_doors = 0;
    }

    // --------------------------------------------------------
    // RIGHT DOORS
    // --------------------------------------------------------

    if (right_doors_mode === 1) {

        right_doors = Math.min(
            1,
            Math.max(0, Number(right_doors) || 0) +
            doorMovement
        );

        if (right_doors >= 1) {
            right_doors = 1;
            right_doors_mode = 2;
        }

    } else if (right_doors_mode === 2) {

        right_doors = 1;

    } else if (right_doors_mode < 0) {

        right_doors = 1;

        if (the_time >= (0 - right_doors_mode)) {
            right_doors_mode = 4;
        }

    } else if (right_doors_mode === 4) {

        right_doors = Math.max(
            0,
            (Number(right_doors) || 0) -
            doorMovement
        );

        if (right_doors <= 0) {
            right_doors = 0;
            right_doors_mode = 0;
        }

    } else if (right_doors_mode === 0) {

        right_doors = 0;
    }

    // ========================================================
    // TRAIN AND PASSENGER POSITIONING
    // ========================================================
    profileMark("start 2")
    set_bogie_positions();
    profileMark("set_bogie_positions")
    position_train_components();
    profileMark("position train components")
    update_passengers();
    profileMark("update passengers")
    // Camera 8 uses the arrow keys for the special passenger.
    // This function handles his movement only when camera 8
    // is selected.
    if (typeof update_player_passenger === "function") {
        update_player_passenger();
    }

    // Update the vertical position of all passengers.
    // This handles both ordinary passengers and passenger zero.
    if (typeof update_passenger_heights === "function") {
        update_passenger_heights();
    }

    // ========================================================
    // CLEAR SCREEN
    // ========================================================

    gl.clearColor(...BACKGROUND_RGB, 1.0);

    gl.clear(
        gl.COLOR_BUFFER_BIT |
        gl.DEPTH_BUFFER_BIT
    );

    ctx.clearRect(
        0,
        0,
        overlay.width,
        overlay.height
    );

    if (!route || !routeMesh) return;

    // ========================================================
    // CAMERA ARROW KEY MOVEMENT
    //
    // Cameras 0-7 retain their original look controls.
    // Camera 8 uses the arrow keys to control passenger zero.
    // ========================================================

    if (
        camera_view !== 8 &&
        !lock_mouse &&
        fps > 0 &&
        Number.isFinite(fps)
    ) {

        var cameraTurn = (Math.PI / 2) / fps;

        if (cameraArrowKeys.left) lookx -= cameraTurn;
        if (cameraArrowKeys.right) lookx += cameraTurn;
        if (cameraArrowKeys.up) looky += cameraTurn;
        if (cameraArrowKeys.down) looky -= cameraTurn;
    }

    // --------------------------------------------------------
    // CAMERA LOOK LIMITS
    // --------------------------------------------------------

    if (camera_view < 7) {

        if (camera_view < 2) {

            if (lookx > 0.5) lookx = 0.5;
            if (lookx < -0.5) lookx = -0.5;

            if (looky > 0.4) looky = 0.4;
            if (looky < -0.4) looky = -0.4;

        } else {

            if (lookx > 4) lookx -= (Math.PI * 2);
            if (lookx < -4) lookx += (Math.PI * 2);

            if (looky > 0.9) looky = 0.9;
            if (looky < -0.9) looky = -0.9;
        }
    }

    // ========================================================
    // CAMERA ATTACHMENT
    // ========================================================

    var coachIndex = 0;

    var forwardOffset = 0;
    var sideOffset = 0;
    var heightOffset = EYE_HEIGHT;

    var middleCoachIndex =
    Math.floor((coach_positions.length - 1) / 2);

    var cabOffset;

    if (cab_overhang < 0) {
        cabOffset = coachlength / 2;
    } else {
        cabOffset = coachlength / 2 + cab_overhang;
    }

    // --------------------------------------------------------
    // CAMERA 0 - REAR CAB, LOOKING BACKWARDS
    // --------------------------------------------------------

    if (camera_view === 0) {

        coachIndex = coach_positions.length - 1;

        forwardOffset = 0 - cabOffset;

        sideOffset = 0 - cameraXOffset;
    }

    // --------------------------------------------------------
    // CAMERA 1 - FRONT CAB
    // --------------------------------------------------------

    if (camera_view === 1) {

        coachIndex = 0;

        forwardOffset = cabOffset;

        if (boat_mode) {
            forwardOffset = 1;
        }

        sideOffset = cameraXOffset;
    }

    // --------------------------------------------------------
    // CAMERA 2 - HEADS OUT
    // --------------------------------------------------------

    if (camera_view === 2) {

        heightOffset = EYE_HEIGHT + 0.6;

        if (camera_subview === 0) {

            coachIndex = 0;
            forwardOffset = cabOffset - 1;
            sideOffset = 0 - (trainWidth / 2 + 0.25);

        } else if (camera_subview === 1) {

            coachIndex = 0;
            forwardOffset = cabOffset - 1;
            sideOffset = trainWidth / 2 + 0.25;

        } else if (camera_subview === 2) {

            coachIndex = coach_positions.length - 1;
            forwardOffset = 0 - cabOffset + 1;
            sideOffset = 0 - (trainWidth / 2 + 0.25);

        } else if (camera_subview === 3) {

            coachIndex = coach_positions.length - 1;
            forwardOffset = 0 - cabOffset + 1;
            sideOffset = trainWidth / 2 + 0.25;
        }
    }

    // --------------------------------------------------------
    // CAMERA 3 - LEFT SIDE
    // --------------------------------------------------------

    if (camera_view === 3) {

        if (camera_subview === 0) {
            coachIndex = 0;
        } else if (camera_subview === 1) {
            coachIndex = middleCoachIndex;
        } else if (camera_subview === 2) {
            coachIndex = coach_positions.length - 1;
        }

        sideOffset = 0 - (1.5 * trainWidth);
    }

    // --------------------------------------------------------
    // CAMERA 4 - RIGHT SIDE
    // --------------------------------------------------------

    if (camera_view === 4) {

        if (camera_subview === 0) {
            coachIndex = 0;
        } else if (camera_subview === 1) {
            coachIndex = middleCoachIndex;
        } else if (camera_subview === 2) {
            coachIndex = coach_positions.length - 1;
        }

        sideOffset = 1.5 * trainWidth;
    }

    // --------------------------------------------------------
    // CAMERA 5 - IN FRONT OF FRONT COACH
    // --------------------------------------------------------

    if (camera_view === 5) {

        coachIndex = 0;

        forwardOffset = cabOffset + 10;

        if (camera_subview === 1) {
            sideOffset = 0 - (1.5 * trainWidth);

        } else if (camera_subview === 2) {
            sideOffset = 1.5 * trainWidth;

        } else if (camera_subview === 3) {
            heightOffset = EYE_HEIGHT - 1;

        } else if (camera_subview === 4) {
            heightOffset = EYE_HEIGHT + 5;
        }
    }

    // --------------------------------------------------------
    // CAMERA 6 - ABOVE TRAIN
    // --------------------------------------------------------

    if (camera_view === 6) {

        heightOffset = EYE_HEIGHT + 6;

        if (camera_subview === 0) {
            coachIndex = 0;
        } else if (camera_subview === 1) {
            coachIndex = coach_positions.length - 1;
        }
    }

    // --------------------------------------------------------
    // CAMERA 7 - BEHIND REAR COACH
    // --------------------------------------------------------

    if (camera_view === 7) {

        coachIndex = coach_positions.length - 1;

        forwardOffset = 0 - cabOffset - 10;

        if (camera_subview === 1) {
            sideOffset = 0 - (1.5 * trainWidth);

        } else if (camera_subview === 2) {
            sideOffset = 1.5 * trainWidth;

        } else if (camera_subview === 3) {
            heightOffset = EYE_HEIGHT - 1;

        } else if (camera_subview === 4) {
            heightOffset = EYE_HEIGHT + 5;
        }
    }

    // ========================================================
    // GET CAMERA POSITION
    // ========================================================

    var cam;

    var cameraAttachedToCoach = false;

    var cameraCoachYaw = 0;
    var cameraCoachPitch = 0;

    var cameraRelativeYaw = 0;
    var cameraRelativePitch = 0;

    var coachCosPitch = 1;
    var coachSinPitch = 0;
    var coachCosYaw = 1;
    var coachSinYaw = 0;

    if (
        camera_view >= 0 &&
        camera_view <= 7 &&
        coach_positions.length > 0 &&
        coach_positions[coachIndex]
    ) {

        var coach = coach_positions[coachIndex];

        var coachSample = sampleAt(coach[1], false);

        var coachPoint;

        if (
            Number.isFinite(Number(coach[4])) &&
            Number.isFinite(Number(coach[5]))
        ) {

            coachPoint = {
                x: Number(coach[4]),
                z: Number(coach[5])
            };

        } else {

            coachPoint = worldPoint(
                coachSample,
                coach[0],
                0
            );
        }

        cameraCoachYaw =
        Number.isFinite(Number(coach[7]))
        ? Number(coach[7])
        : coachSample.heading + coach[2];

        cameraCoachPitch = Number(coach[6]);

        if (!Number.isFinite(cameraCoachPitch)) {
            cameraCoachPitch = 0;
        }

        cameraRelativeYaw =
        (cameraReverseView ? Math.PI : 0) +
        (lookx || 0);

        cameraRelativePitch = looky || 0;

        // ----------------------------------------------------
        // SPACE MOVEMENT
        // ----------------------------------------------------

        if (
            cameraArrowKeys.space &&
            fps > 0 &&
            Number.isFinite(fps)
        ) {

            var cameraMoveDistance = 5 / fps;

            var movePitchCos =
            Math.cos(cameraRelativePitch);

            cameraMoveOffset.x +=
            Math.sin(cameraRelativeYaw) *
            movePitchCos *
            cameraMoveDistance;

            cameraMoveOffset.y +=
            Math.sin(cameraRelativePitch) *
            cameraMoveDistance;

            cameraMoveOffset.z +=
            Math.cos(cameraRelativeYaw) *
            movePitchCos *
            cameraMoveDistance;
        }

        // ----------------------------------------------------
        // CAMERA POSITION RELATIVE TO COACH
        // ----------------------------------------------------

        var cameraFloorHeight =
        Number(train_floor_height);

        if (!Number.isFinite(cameraFloorHeight)) {
            cameraFloorHeight = 0;
        }

        var localX =
        sideOffset + cameraMoveOffset.x;

        var localY =
        heightOffset -
        cameraFloorHeight +
        cameraMoveOffset.y;

        var localZ =
        forwardOffset + cameraMoveOffset.z;

        // ----------------------------------------------------
        // APPLY COACH PITCH
        // ----------------------------------------------------

        coachCosPitch = Math.cos(cameraCoachPitch);
        coachSinPitch = Math.sin(cameraCoachPitch);

        var pitchedX = localX;

        var pitchedY =
        coachCosPitch * localY -
        coachSinPitch * localZ;

        var pitchedZ =
        coachSinPitch * localY +
        coachCosPitch * localZ;

        // ----------------------------------------------------
        // APPLY COACH YAW
        // ----------------------------------------------------

        coachCosYaw = Math.cos(cameraCoachYaw);
        coachSinYaw = Math.sin(cameraCoachYaw);

        var rotatedX =
        coachCosYaw * pitchedX +
        coachSinYaw * pitchedZ;

        var rotatedY = pitchedY;

        var rotatedZ =
        -coachSinYaw * pitchedX +
        coachCosYaw * pitchedZ;

        var coachOriginY =
        Number(coach[3]) +
        Number(RAIL_VERTICAL_OFFSET) +
        Number(RAIL_HEIGHT) +
        cameraFloorHeight;

        cam = {

            x: coachPoint.x + rotatedX,

            y: coachOriginY + rotatedY,

            z: coachPoint.z + rotatedZ,

            heading: cameraCoachYaw + cameraRelativeYaw
        };

        cameraAttachedToCoach = true;

    } else {

        // Default position for cameras not attached to a coach.
        var cam0 = sampleAt(pos, false);

        var camSide = basisForSample(cam0);

        cam = {

            x: cam0.x + camSide.rx * cameraXOffset,

            y: cam0.y + EYE_HEIGHT,

            z: cam0.z + camSide.rz * cameraXOffset,

            heading: cam0.heading + (lookx || 0)
        };
    }

    // ========================================================
    // CAMERA BASIS
    // ========================================================

    var basis = cameraBasis(cam);

    if (cameraAttachedToCoach) {

        var cameraPitchCos =
        Math.cos(cameraRelativePitch);

        var localForwardX =
        Math.sin(cameraRelativeYaw) *
        cameraPitchCos;

        var localForwardY =
        Math.sin(cameraRelativePitch);

        var localForwardZ =
        Math.cos(cameraRelativeYaw) *
        cameraPitchCos;

        // Apply coach pitch.
        var forwardPitchX = localForwardX;

        var forwardPitchY =
        coachCosPitch * localForwardY -
        coachSinPitch * localForwardZ;

        var forwardPitchZ =
        coachSinPitch * localForwardY +
        coachCosPitch * localForwardZ;

        // Apply coach yaw.
        basis.fx =
        coachCosYaw * forwardPitchX +
        coachSinYaw * forwardPitchZ;

        basis.fy = forwardPitchY;

        basis.fz =
        -coachSinYaw * forwardPitchX +
        coachCosYaw * forwardPitchZ;

        // Local right vector.
        var localRightX = Math.cos(cameraRelativeYaw);
        var localRightY = 0;
        var localRightZ = -Math.sin(cameraRelativeYaw);

        // Apply coach pitch.
        var rightPitchX = localRightX;

        var rightPitchY =
        coachCosPitch * localRightY -
        coachSinPitch * localRightZ;

        var rightPitchZ =
        coachSinPitch * localRightY +
        coachCosPitch * localRightZ;

        // Apply coach yaw.
        basis.rx =
        coachCosYaw * rightPitchX +
        coachSinYaw * rightPitchZ;

        basis.ry = rightPitchY;

        basis.rz =
        -coachSinYaw * rightPitchX +
        coachCosYaw * rightPitchZ;

    } else {

        var cameraPitch = looky || 0;

        var pitchCos = Math.cos(cameraPitch);

        basis.fx *= pitchCos;
        basis.fy = Math.sin(cameraPitch);
        basis.fz *= pitchCos;
    }

    // ========================================================
    // CAMERA 8 - SPECIAL PASSENGER CHASE CAMERA
    //
    // This replaces the ordinary camera position and basis.
    // get_passenger_camera() calculates the chase-camera
    // position and a viewing direction aimed at passenger 0.
    // ========================================================

    if (camera_view === 8) {

        if (
            typeof get_passenger_camera === "function" &&
            passengers[0] &&
            passengers[0]._isPlayerPassenger === true
        ) {

            var passengerCamera =
            get_passenger_camera();

            if (
                passengerCamera &&
                passengerCamera.cam &&
                passengerCamera.basis
            ) {

                cam = passengerCamera.cam;

                basis = passengerCamera.basis;
            }
        }

    } else {

        // Reset the follow state when leaving camera 8.
        if (
            passengers[0] &&
            passengers[0]._cameraFollow
        ) {
            passengers[0]._cameraFollow.active = false;
        }
    }

    // ========================================================
    // SET SHADER
    // ========================================================
    profileMark("camera");
    gl.useProgram(program);

    gl.uniform2f(
        uResolution,
        canvas.width,
        canvas.height
    );

    gl.uniform1f(
        uTanHalfFov,
        Math.tan(FOV_DEG * Math.PI / 360)
    );

    gl.uniform1f(uNear, NEAR);

    gl.uniform1f(
        uFar,
        DRAW_AHEAD + DRAW_BEHIND + 500
    );

    gl.uniform3f(
        uCameraPosition,
        cam.x,
        cam.y,
        cam.z
    );

    gl.uniform3f(
        uForward,
        basis.fx,
        basis.fy,
        basis.fz
    );

    gl.uniform3f(
        uRight,
        basis.rx,
        0,
        basis.rz
    );



    gl.activeTexture(gl.TEXTURE0);

    // ========================================================
    // ROUTE DRAW DISTANCES
    // ========================================================

    var startDistance =
    Math.max(0, pos - DRAW_BEHIND);

    var endDistance =
    Math.min(
        route.maxDistance,
        pos + DRAW_AHEAD
    );

    var startSegment = clamp(
        Math.floor(startDistance / TRACK_DRAW_STEP),
                             0,
                             routeMesh.segmentTotal - 1
    );

    var endSegment = clamp(
        Math.floor(endDistance / TRACK_DRAW_STEP),
                           0,
                           routeMesh.segmentTotal - 1
    );

    // ========================================================
    // DRAW ROUTE MESH
    // ========================================================

    if (endSegment >= startSegment) {

        for (var zone of routeMesh.zones) {

            if (
                zone.segmentEnd <= startSegment ||
                zone.segmentStart > endSegment
            ) {
                continue;
            }

            var firstSegment = Math.max(
                startSegment,
                zone.segmentStart
            );

            var lastSegment = Math.min(
                endSegment,
                zone.segmentEnd - 1
            );

            var firstLocal =
            firstSegment - zone.segmentStart;

            var lastLocal =
            lastSegment - zone.segmentStart;

            var firstVertex =
            zone.segmentFirst[firstLocal];

            var lastVertex =
            zone.segmentFirst[lastLocal] +
            zone.segmentCount[lastLocal];

            var vertexCount =
            lastVertex - firstVertex;

            if (vertexCount <= 0) continue;

            gl.bindVertexArray(zone.vao);

            for (
                var selectedTrackTextureIndex = 0;
            selectedTrackTextureIndex <= textureCount * 2;
            selectedTrackTextureIndex++
            ) {

                var textureToBind =
                selectedTrackTextureIndex === 0
                ? trackTextures[0]
                : trackTextures[
                    selectedTrackTextureIndex - 1
                ];

                gl.bindTexture(
                    gl.TEXTURE_2D,
                    textureToBind
                );

                gl.uniform1i(
                    uCurrentTextureIndex,
                    selectedTrackTextureIndex
                );

                gl.drawArrays(
                    gl.TRIANGLES,
                    firstVertex,
                    vertexCount
                );
            }

            // ------------------------------------------------
            // DRAW PRESELECTED POINT GEOMETRY
            // ------------------------------------------------

            if (
                zone.pointVao &&
                zone.activePointRanges &&
                zone.activePointRanges.length
            ) {

                gl.bindVertexArray(zone.pointVao);

                gl.activeTexture(gl.TEXTURE0);

                gl.bindTexture(
                    gl.TEXTURE_2D,
                    trackTextures[0]
                );

                gl.uniform1i(
                    uCurrentTextureIndex,
                    0
                );

                for (var pointRange of zone.activePointRanges) {

                    if (
                        pointRange.endDistance < startDistance ||
                        pointRange.startDistance > endDistance
                    ) {
                        continue;
                    }

                    gl.drawArrays(
                        gl.TRIANGLES,
                        pointRange.first,
                        pointRange.count
                    );
                }
            }
        }
    }

    // ========================================================
    // DRAW SCENE OBJECTS
    // ========================================================
    profileMark("route");
    drawRouteObjects(
        pos,
        startDistance,
        endDistance,
        cam,
        basis
    );
    profileMark("objects");
    draw_train_components(
        startDistance,
        endDistance,
        cam,
        basis
    );
    profileMark("train");
    draw_passenger_placeholders(
        startDistance,
        endDistance,
        cam,
        basis
    );
    profileMark("passengers");
    little_canvas();

    updateStatus();
    profileMark("overlay");
    // ========================================================
    // KEEP TRAIN WITHIN ROUTE LIMITS
    // ========================================================

    if (
        Number(pos) - train_length <
        Number(current_route_items_detailed[0][1])
    ) {
        pos =
        Number(current_route_items_detailed[0][1]) +
        train_length;
    }

    if (
        Number(pos) >
        Number(
            current_route_items_detailed[
                current_route_items_detailed.length - 1
            ][1]
        )
    ) {
        pos =
        Number(
            current_route_items_detailed[
                current_route_items_detailed.length - 1
            ][1]
        );
    }






    // --------------------------------------------------------
    // REPORT PERFORMANCE EVERY TWO SECONDS
    // --------------------------------------------------------

   profileMarkEnd()






    if (!renderLoopRunning) return;

    renderAnimationFrameId =
    requestAnimationFrame(render);
}





















