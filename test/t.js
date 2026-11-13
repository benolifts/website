




var traindoors = [];
var door_positions = [];
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






function build_train_end_faces() {

    ensureObjectRenderer();

    var coachCount = Math.floor(Number(coaches));
    var length = Number(coachlength);
    var width = Number(trainWidth);
    var gauge = Number(TRACK_GAUGE);

    var bodyHeight =
    Number(train_roof_height) - Number(train_floor_height);

    var thickness = Number(train_body_thickness);
    var bottomExtension = 0.1;
    var halfWidth = width * 0.5;
    var halfGauge = gauge * 0.5;

    var cabOverhang = Number(cab_overhang);
    var nonCabOverhang = Number(non_cab_overhang);
    var useCab3d = Array.isArray(cab3d) && cab3d.length > 0;
    if (!Number.isFinite(cabOverhang)) cabOverhang = 0;
    if (!Number.isFinite(nonCabOverhang)) nonCabOverhang = 0;

    // Allow negative cab overhang, but don't let the cab end
    // extend past the centre of the coach.
    if (length * 0.5 + cabOverhang <= 0) {
        throw new Error("Cab overhang makes the cab end length invalid.");
    }

    nonCabOverhang = Math.min(0, nonCabOverhang);

    var gangwaysEnabled = gangways === true;
    var gangwayLengthFactor = Jacobs_bogies ? 0.5 : 1;

    var openingTop =
    bodyHeight * Number(train_doortop_percentage);

    if (
        coachCount < 1 ||
        !Number.isFinite(length) || length <= 0 ||
        !Number.isFinite(width) || width <= 0 ||
        !Number.isFinite(gauge) || gauge <= 0 ||
        gauge >= width ||
        !Number.isFinite(bodyHeight) || bodyHeight <= 0 ||
        !Number.isFinite(thickness) || thickness <= 0 ||
        !Number.isFinite(openingTop) ||
        openingTop <= 0 ||
        openingTop >= bodyHeight
    ) {
        throw new Error("Invalid train end dimensions.");
    }

    if (
        !trainBetweenTextureOuter ||
        !trainBetweenTextureInner ||
        !trainCabTextureOuter ||
        !trainCabTextureInner
    ) {
        throw new Error("Train cab and between-coach textures have not been loaded.");
    }

    if (gangwaysEnabled && (!misc_2 || !misc_3)) {
        throw new Error("Gangway textures misc_2 and misc_3 are required.");
    }

    if (
        !Array.isArray(train_body_dimentions) ||
        train_body_dimentions.length < 3
    ) {
        throw new Error("Invalid train_body_dimentions.");
    }

    // ------------------------------------------------------------
    // RESET END MESH ARRAYS
    // ------------------------------------------------------------

    trainEndMeshes.length = 0;

    for (var bodySet of trainBodyMeshes) {

        if (!bodySet) continue;

        bodySet.endOuter = [];
        bodySet.endInner = [];
        bodySet.endGangwayMeshes = [];
    }

    // ------------------------------------------------------------
    // BODY CROSS-SECTION
    // ------------------------------------------------------------

    function bodyY(y) {

        var result = Number(y) * bodyHeight;

        if (Math.abs(Number(y)) < 1e-7) {
            result -= bottomExtension;
        }

        return result;
    }

    var outline = [];

    // Right side.
    for (var i = 0; i < train_body_dimentions.length; i++) {

        outline.push({
            x: Number(train_body_dimentions[i][0]) * halfWidth,
                     y: bodyY(train_body_dimentions[i][1])
        });
    }

    // Left side, in reverse order.
    for (var i = train_body_dimentions.length - 2; i >= 0; i--) {

        outline.push({
            x: -Number(train_body_dimentions[i][0]) * halfWidth,
                     y: bodyY(train_body_dimentions[i][1])
        });
    }

    // ------------------------------------------------------------
    // POLYGON AREA
    // ------------------------------------------------------------

    function polygonArea(points) {

        var area = 0;

        for (var i = 0; i < points.length; i++) {

            var a = points[i];
            var b = points[(i + 1) % points.length];

            area += a.x * b.y - b.x * a.y;
        }

        return area * 0.5;
    }

    if (Math.abs(polygonArea(outline)) < 1e-8) {
        throw new Error("Train end outline has zero area.");
    }

    // ------------------------------------------------------------
    // SQUARE TEXTURE PROJECTION BOUNDS
    //
    // X and Y use the same world-space scale.
    // The complete outline determines the square.
    // Clipped mesh sections all reuse these same bounds.
    // ------------------------------------------------------------

    function getSquareTextureBounds(points) {

        var minX = Infinity;
        var maxX = -Infinity;
        var minY = Infinity;
        var maxY = -Infinity;

        for (var point of points) {

            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);

            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }

        var centreX = (minX + maxX) * 0.5;
        var centreY = (minY + maxY) * 0.5;

        var projectionSize = Math.max(
            maxX - minX,
            maxY - minY
        );

        projectionSize = Math.max(projectionSize, 1e-8);

        return {
            minX: centreX - projectionSize * 0.5,
            minY: centreY - projectionSize * 0.5,
            size: projectionSize
        };
    }

    // ------------------------------------------------------------
    // INTERIOR CROSS-SECTION
    // ------------------------------------------------------------

    function createInteriorOutline(points) {

        var orientation = polygonArea(points) > 0 ? 1 : -1;
        var result = [];

        for (var i = 0; i < points.length; i++) {

            var previous = points[(i + points.length - 1) % points.length];
            var current = points[i];
            var next = points[(i + 1) % points.length];

            var dx1 = current.x - previous.x;
            var dy1 = current.y - previous.y;
            var dx2 = next.x - current.x;
            var dy2 = next.y - current.y;

            var length1 = Math.hypot(dx1, dy1);
            var length2 = Math.hypot(dx2, dy2);

            if (length1 < 1e-8 || length2 < 1e-8) {
                throw new Error("Invalid train interior outline.");
            }

            var n1x = orientation * dy1 / length1;
            var n1y = -orientation * dx1 / length1;
            var n2x = orientation * dy2 / length2;
            var n2y = -orientation * dx2 / length2;

            var mx = n1x + n2x;
            var my = n1y + n2y;

            var miterLength = Math.hypot(mx, my);

            if (miterLength < 1e-8) {
                mx = n2x;
                my = n2y;
            } else {
                mx /= miterLength;
                my /= miterLength;
            }

            var denominator = mx * n2x + my * n2y;

            if (Math.abs(denominator) < 0.1) {
                mx = n2x;
                my = n2y;
                denominator = 1;
            }

            var offset = thickness / denominator;

            offset = Math.max(
                -thickness * 8,
                Math.min(thickness * 8, offset)
            );

            result.push({
                x: current.x - mx * offset,
                y: current.y - my * offset
            });
        }

        return result;
    }

    var interiorOutline = createInteriorOutline(outline);

    // ------------------------------------------------------------
    // EXTEND THE BOTTOM OF EXTERIOR CAB FACES
    // ------------------------------------------------------------

    // ------------------------------------------------------------
    // EXTEND THE BOTTOM OF THE FRONT EXTERIOR CAB FACE
    //
    // Keep the original outline vertices unchanged.
    // Add two new vertices below the existing bottom corners.
    //
    // Ground is at local Y = -train_floor_height.
    // The new bottom is one third of the way up from ground
    // towards the floor.
    // ------------------------------------------------------------

    var cabExteriorOutline = outline.map(function(point) {
        return {
            x: point.x,
            y: point.y
        };
    });

    var lowestY = Infinity;

    for (var point of cabExteriorOutline) {
        lowestY = Math.min(lowestY, point.y);
    }

    var groundY = -Number(train_floor_height);

    var extensionY = groundY + (0 - groundY) / 3;

    // The first and last outline points are the right and left
    // bottom corners respectively.
    var rightBottom = cabExteriorOutline[0];
    var leftBottom = cabExteriorOutline[cabExteriorOutline.length - 1];

    // Only extend if both original bottom corners are at the
    // lowest point and the requested extension is below them.
    if (
        Math.abs(rightBottom.y - lowestY) < 1e-7 &&
        Math.abs(leftBottom.y - lowestY) < 1e-7 &&
        extensionY < lowestY - 1e-7
    ) {
        // Add new points; do not move the existing ones.
        cabExteriorOutline.push(
            {
                // Move the lower left point towards the centre.
                x: leftBottom.x + width * 0.15,
                y: extensionY
            },
            {
                // Move the lower right point towards the centre.
                x: rightBottom.x - width * 0.15,
                y: extensionY
            }
        );
    }

    // ------------------------------------------------------------
    // TRIANGULATE END FACES
    // ------------------------------------------------------------

    function cross2(a, b, c) {

        return (
            (b.x - a.x) * (c.y - a.y) -
            (b.y - a.y) * (c.x - a.x)
        );
    }

    function triangulate(points, normalZ) {

        var area = polygonArea(points);

        if (Math.abs(area) < 1e-8) {
            throw new Error("Cannot triangulate train end face.");
        }

        var orientation = area > 0 ? 1 : -1;
        var remaining = [];

        for (var i = 0; i < points.length; i++) {
            remaining.push(i);
        }

        var triangles = [];

        while (remaining.length > 3) {

            var foundEar = false;

            for (var i = 0; i < remaining.length; i++) {

                var ia = remaining[(i + remaining.length - 1) % remaining.length];
                var ib = remaining[i];
                var ic = remaining[(i + 1) % remaining.length];

                var a = points[ia];
                var b = points[ib];
                var c = points[ic];

                if (cross2(a, b, c) * orientation <= 1e-10) {
                    continue;
                }

                var containsPoint = false;

                for (var j = 0; j < remaining.length; j++) {

                    var ip = remaining[j];

                    if (ip === ia || ip === ib || ip === ic) {
                        continue;
                    }

                    var p = points[ip];

                    var c1 = cross2(a, b, p) * orientation;
                    var c2 = cross2(b, c, p) * orientation;
                    var c3 = cross2(c, a, p) * orientation;

                    if (
                        c1 > 1e-10 &&
                        c2 > 1e-10 &&
                        c3 > 1e-10
                    ) {
                        containsPoint = true;
                        break;
                    }
                }

                if (containsPoint) continue;

                triangles.push(ia, ib, ic);
                remaining.splice(i, 1);
                foundEar = true;
                break;
            }

            if (!foundEar) {
                throw new Error(
                    "Could not triangulate train end. Check train_body_dimentions."
                );
            }
        }

        triangles.push(
            remaining[0],
            remaining[1],
            remaining[2]
        );

        // Front exterior: -Z
        // Rear exterior: +Z
        // Front interior: +Z
        // Rear interior: -Z

        var requiredOrientation = normalZ > 0 ? 1 : -1;

        if (orientation !== requiredOrientation) {

            for (var i = 0; i < triangles.length; i += 3) {

                var temp = triangles[i + 1];
                triangles[i + 1] = triangles[i + 2];
                triangles[i + 2] = temp;
            }
        }

        var IndexArray = points.length > 65535
        ? Uint32Array
        : Uint16Array;

        return new IndexArray(triangles);
    }

    // ------------------------------------------------------------
    // CREATE END MESH
    //
    // leaveOpening splits the face around the gauge-width opening.
    // All resulting sections retain the original square projection.
    // ------------------------------------------------------------

    function createEndMesh(
        points,
        z,
        normalZ,
        texture,
        leaveOpening,
        textureBounds
    ) {

        if (!textureBounds) {
            textureBounds = getSquareTextureBounds(points);
        }

        if (leaveOpening) {

            var regions = [
                // Below floor.
                [null, null, null, 0],

                // Left of opening.
                [null, -halfGauge, 0, openingTop],

                // Right of opening.
                [halfGauge, null, 0, openingTop],

                // Above opening.
                [null, null, openingTop, null]
            ];

            var resultMeshes = [];

            for (var region of regions) {

                var clipped = points.map(function(point) {
                    return { x: point.x, y: point.y };
                });

                var boundaries = [
                    [0, region[0], true],
                    [0, region[1], false],
                    [1, region[2], true],
                    [1, region[3], false]
                ];

                for (var boundary of boundaries) {

                    if (boundary[1] === null) continue;

                    var next = [];

                    for (var i = 0; i < clipped.length; i++) {

                        var a = clipped[i];
                        var b = clipped[(i + 1) % clipped.length];

                        var av = boundary[0] === 0 ? a.x : a.y;
                        var bv = boundary[0] === 0 ? b.x : b.y;

                        var aInside = boundary[2]
                        ? av >= boundary[1] - 1e-8
                        : av <= boundary[1] + 1e-8;

                        var bInside = boundary[2]
                        ? bv >= boundary[1] - 1e-8
                        : bv <= boundary[1] + 1e-8;

                        if (aInside !== bInside) {

                            var t = (boundary[1] - av) / (bv - av);

                            next.push({
                                x: a.x + (b.x - a.x) * t,
                                      y: a.y + (b.y - a.y) * t
                            });
                        }

                        if (bInside) {
                            next.push(b);
                        }
                    }

                    clipped = next;

                    if (clipped.length < 3) break;
                }

                // Remove duplicate vertices.
                var clean = [];

                for (var point of clipped) {

                    var previous = clean[clean.length - 1];

                    if (
                        !previous ||
                        Math.hypot(
                            point.x - previous.x,
                            point.y - previous.y
                        ) > 1e-8
                    ) {
                        clean.push(point);
                    }
                }

                if (clean.length > 2) {

                    var first = clean[0];
                    var last = clean[clean.length - 1];

                    if (
                        Math.hypot(
                            first.x - last.x,
                            first.y - last.y
                        ) < 1e-8
                    ) {
                        clean.pop();
                    }
                }

                // Remove collinear vertices.
                var changed = true;

                while (changed && clean.length > 3) {

                    changed = false;

                    for (var i = 0; i < clean.length; i++) {

                        var a = clean[(i + clean.length - 1) % clean.length];
                        var b = clean[i];
                        var c = clean[(i + 1) % clean.length];

                        var abx = b.x - a.x;
                        var aby = b.y - a.y;
                        var bcx = c.x - b.x;
                        var bcy = c.y - b.y;

                        if (
                            Math.abs(abx * bcy - aby * bcx) < 1e-9 &&
                            abx * bcx + aby * bcy >= -1e-9
                        ) {
                            clean.splice(i, 1);
                            changed = true;
                            break;
                        }
                    }
                }

                if (
                    clean.length >= 3 &&
                    Math.abs(polygonArea(clean)) > 1e-8
                ) {
                    var meshes = createEndMesh(
                        clean,
                        z,
                        normalZ,
                        texture,
                        false,
                        textureBounds
                    );

                    for (var mesh of meshes) {
                        resultMeshes.push(mesh);
                    }
                }
            }

            return resultMeshes;
        }

        var positions = new Float32Array(points.length * 3);
        var normals = new Float32Array(points.length * 3);
        var uvs = new Float32Array(points.length * 2);

        for (var i = 0; i < points.length; i++) {

            var point = points[i];

            positions[i * 3] = point.x;
            positions[i * 3 + 1] = point.y;
            positions[i * 3 + 2] = z;

            normals[i * 3] = 0;
            normals[i * 3 + 1] = 0;
            normals[i * 3 + 2] = normalZ;

            // Square XY projection. X and Y use the same scale.
            // The polygon clips the texture without stretching it.
            uvs[i * 2] = Math.max(
                0,
                Math.min(
                    1,
                    (point.x - textureBounds.minX) / textureBounds.size
                )
            );

            // Invert V so the source image remains upright.
            uvs[i * 2 + 1] = Math.max(
                0,
                Math.min(
                    1,
                    1 - (
                        (point.y - textureBounds.minY) /
                        textureBounds.size
                    )
                )
            );
        }

        var indices = triangulate(points, normalZ);

        var mesh = {
            positionBuffer: gl.createBuffer(),
            normalBuffer: gl.createBuffer(),
            uvBuffer: gl.createBuffer(),
            indexBuffer: gl.createBuffer(),
            objectVao: gl.createVertexArray(),

            indexCount: indices.length,
            indexType: indices instanceof Uint32Array
            ? gl.UNSIGNED_INT
            : gl.UNSIGNED_SHORT,

            texture: texture,
            colour: [1, 1, 1, 1],
            transparentColor: null,
            repeatS: false,
            repeatT: false
        };

        if (
            !mesh.positionBuffer ||
            !mesh.normalBuffer ||
            !mesh.uvBuffer ||
            !mesh.indexBuffer ||
            !mesh.objectVao
        ) {
            throw new Error("Could not create train end GPU mesh.");
        }

        gl.bindVertexArray(mesh.objectVao);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(objectLocations.aPosition);
        gl.vertexAttribPointer(
            objectLocations.aPosition, 3, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(objectLocations.aNormal);
        gl.vertexAttribPointer(
            objectLocations.aNormal, 3, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(objectLocations.aTexCoord);
        gl.vertexAttribPointer(
            objectLocations.aTexCoord, 2, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        return [mesh];
    }

    // ------------------------------------------------------------
    // CREATE 3D CAB EXTERIOR FROM cab3d DEPTH ARRAY
    //
    // cab3d rows:    top to bottom
    // cab3d columns: left to right
    //
    // Each value is a displacement in metres.
    // Positive values extend outwards from the cab.
    //
    // The existing X/Y texture projection is preserved.
    // Points outside the original cab outline are skipped.
    // ------------------------------------------------------------




    // ------------------------------------------------------------
    // CREATE 3D CAB EXTERIOR FROM cab3d
    //
    // Rows: top to bottom.
    // Columns: left to right.
    //
    // Array values are Z displacements in metres.
    //
    // The array is mapped across the original cab outline.
    // Grid cells are clipped against the cab outline.
    //
    // Original outline vertices have zero displacement, so the
    // generated surface joins the train body exactly.
    //
    // Texture coordinates remain based on the original X/Y
    // projection and are unaffected by Z displacement.
    // ------------------------------------------------------------

    function createCab3dEndMesh(
        points,
        z,
        normalZ,
        texture,
        textureBounds
    ) {

        var rows = cab3d.length;
        var columns = 0;

        for (var r = 0; r < rows; r++) {
            if (Array.isArray(cab3d[r])) {
                columns = Math.max(columns, cab3d[r].length);
            }
        }

        if (rows < 2 || columns < 2) {
            throw new Error("Invalid cab3d array.");
        }

        var minX = Infinity;
        var maxX = -Infinity;
        var minY = Infinity;
        var maxY = -Infinity;

        for (var point of points) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }

        var width = maxX - minX;
        var height = maxY - minY;

        if (width <= 1e-8 || height <= 1e-8) {
            throw new Error("Invalid cab outline.");
        }

        // --------------------------------------------------------
        // ORIGINAL OUTLINE TRIANGULATION
        //
        // These triangles are used only as clipping boundaries.
        // They are not drawn as a separate flat face.
        // --------------------------------------------------------

        var outlineIndices = triangulate(points, normalZ);

        var outlineTriangles = [];

        for (var i = 0; i < outlineIndices.length; i += 3) {
            outlineTriangles.push([
                points[outlineIndices[i]],
                points[outlineIndices[i + 1]],
                points[outlineIndices[i + 2]]
            ]);
        }

        // --------------------------------------------------------
        // GEOMETRY STORAGE
        // --------------------------------------------------------

        var positions = [];
        var uvs = [];
        var indices = [];

        var vertexLookup = new Map();

        // --------------------------------------------------------
        // POINT ON ORIGINAL CAB OUTLINE
        //
        // These vertices must have zero depth so the new surface
        // joins the original train body.
        // --------------------------------------------------------

        function isOnOutline(x, y) {

            for (var i = 0; i < points.length; i++) {

                var a = points[i];
                var b = points[(i + 1) % points.length];

                var cross =
                (x - a.x) * (b.y - a.y) -
                (y - a.y) * (b.x - a.x);

                var dot =
                (x - a.x) * (x - b.x) +
                (y - a.y) * (y - b.y);

                if (
                    Math.abs(cross) < 1e-7 &&
                    dot <= 1e-7
                ) {
                    return true;
                }
            }

            return false;
        }

        // --------------------------------------------------------
        // CLIP A GRID CELL AGAINST ONE OUTLINE TRIANGLE
        //
        // Both shapes are convex, so this clipping is reliable.
        // --------------------------------------------------------

        function clipAgainstTriangle(subject, triangle) {

            var clipped = subject;

            var ta = triangle[0];
            var tb = triangle[1];
            var tc = triangle[2];

            var orientation =
            cross2(ta, tb, tc) >= 0 ? 1 : -1;

            var edges = [
                [ta, tb],
                [tb, tc],
                [tc, ta]
            ];

            for (var edge of edges) {

                if (clipped.length < 3) return [];

                var a = edge[0];
                var b = edge[1];

                var output = [];

                for (var i = 0; i < clipped.length; i++) {

                    var current = clipped[i];
                    var previous =
                    clipped[
                        (i + clipped.length - 1) %
                        clipped.length
                    ];

                    var currentValue =
                    cross2(a, b, current) * orientation;

                    var previousValue =
                    cross2(a, b, previous) * orientation;

                    var currentInside = currentValue >= -1e-9;
                    var previousInside = previousValue >= -1e-9;

                    if (currentInside !== previousInside) {

                        var t =
                        previousValue /
                        (previousValue - currentValue);

                        output.push({
                            x: previous.x +
                            (current.x - previous.x) * t,

                                    y: previous.y +
                                    (current.y - previous.y) * t
                        });
                    }

                    if (currentInside) {
                        output.push(current);
                    }
                }

                clipped = output;
            }

            return clipped;
        }

        // --------------------------------------------------------
        // CLEAN CLIPPED POLYGON
        // --------------------------------------------------------

        function cleanPolygon(polygon) {

            var result = [];

            for (var point of polygon) {

                var previous = result[result.length - 1];

                if (
                    !previous ||
                    Math.hypot(
                        point.x - previous.x,
                        point.y - previous.y
                    ) > 1e-8
                ) {
                    result.push(point);
                }
            }

            if (result.length > 2) {

                var first = result[0];
                var last = result[result.length - 1];

                if (
                    Math.hypot(
                        first.x - last.x,
                        first.y - last.y
                    ) < 1e-8
                ) {
                    result.pop();
                }
            }

            return result;
        }

        // --------------------------------------------------------
        // GET OR CREATE A SURFACE VERTEX
        // --------------------------------------------------------

        function getVertex(x, y, depth) {

            // Every point on the original body outline is fixed
            // at the original face position.
            if (isOnOutline(x, y)) {
                depth = 0;
            }

            // Reverse the previous displacement direction.
            var vertexZ = z - depth * normalZ;

            // Share coincident vertices between adjacent cells.
            var key =
            Math.round(x * 1e8) + "," +
            Math.round(y * 1e8);

            if (vertexLookup.has(key)) {
                return vertexLookup.get(key);
            }

            var index = positions.length / 3;

            positions.push(
                x,
                y,
                vertexZ
            );

            // Preserve the original X/Y texture projection.
            uvs.push(
                Math.max(
                    0,
                    Math.min(
                        1,
                        (x - textureBounds.minX) /
                        textureBounds.size
                    )
                ),

                Math.max(
                    0,
                    Math.min(
                        1,
                        1 - (
                            (y - textureBounds.minY) /
                            textureBounds.size
                        )
                    )
                )
            );

            vertexLookup.set(key, index);

            return index;
        }

        // --------------------------------------------------------
        // READ ARRAY VALUES
        //
        // Missing or invalid values cause the corresponding
        // grid cell to be skipped.
        // --------------------------------------------------------

        function getDepth(r, c) {

            if (
                !Array.isArray(cab3d[r]) ||
                c >= cab3d[r].length
            ) {
                return null;
            }

            var value = cab3d[r][c];

            if (
                value === null ||
                value === undefined ||
                value === ""
            ) {
                return null;
            }

            value = Number(value);

            return Number.isFinite(value) ? value : null;
        }

        // --------------------------------------------------------
        // BUILD REGULAR GRID CELLS
        // --------------------------------------------------------

        for (var r = 0; r < rows - 1; r++) {

            for (var c = 0; c < columns - 1; c++) {

                var d00 = getDepth(r, c);
                var d01 = getDepth(r, c + 1);
                var d10 = getDepth(r + 1, c);
                var d11 = getDepth(r + 1, c + 1);

                // Skip incomplete cells.
                if (
                    d00 === null ||
                    d01 === null ||
                    d10 === null ||
                    d11 === null
                ) {
                    continue;
                }

                var x0 = minX + (c / (columns - 1)) * width;
                var x1 = minX + ((c + 1) / (columns - 1)) * width;

                var y0 = maxY - (r / (rows - 1)) * height;
                var y1 = maxY - ((r + 1) / (rows - 1)) * height;

                // Regular grid cell.
                var cell = [
                    { x: x0, y: y0 },
                    { x: x1, y: y0 },
                    { x: x1, y: y1 },
                    { x: x0, y: y1 }
                ];

                // ------------------------------------------------
                // CLIP CELL AGAINST THE ORIGINAL CAB OUTLINE
                // ------------------------------------------------

                for (var triangle of outlineTriangles) {

                    var clipped = clipAgainstTriangle(
                        cell,
                        triangle
                    );

                    clipped = cleanPolygon(clipped);

                    if (clipped.length < 3) continue;

                    // ------------------------------------------------
                    // CONVERT CLIPPED POLYGON TO A TRIANGLE FAN
                    // ------------------------------------------------

                    var polygonIndices = [];

                    for (var point of clipped) {

                        // Bilinear interpolation within this array cell.
                        var u = (point.x - x0) / (x1 - x0);
                        var v = (y0 - point.y) / (y0 - y1);

                        u = Math.max(0, Math.min(1, u));
                        v = Math.max(0, Math.min(1, v));

                        var depth =
                        d00 * (1 - u) * (1 - v) +
                        d01 * u * (1 - v) +
                        d10 * (1 - u) * v +
                        d11 * u * v;

                        polygonIndices.push(
                            getVertex(
                                point.x,
                                point.y,
                                depth
                            )
                        );
                    }

                    var first = polygonIndices[0];

                    for (
                        var i = 1;
                    i < polygonIndices.length - 1;
                    i++
                    ) {

                        var a = first;
                        var b = polygonIndices[i];
                        var c = polygonIndices[i + 1];

                        var area = cross2(
                            {
                                x: positions[a * 3],
                                y: positions[a * 3 + 1]
                            },
                            {
                                x: positions[b * 3],
                                y: positions[b * 3 + 1]
                            },
                            {
                                x: positions[c * 3],
                                y: positions[c * 3 + 1]
                            }
                        );

                        if (Math.abs(area) < 1e-10) {
                            continue;
                        }

                        // Ensure the correct face winding.
                        if (
                            (area > 0 && normalZ < 0) ||
                            (area < 0 && normalZ > 0)
                        ) {
                            indices.push(a, c, b);
                        } else {
                            indices.push(a, b, c);
                        }
                    }
                }
            }
        }

        if (indices.length === 0) {
            throw new Error(
                "cab3d did not create any valid cab geometry."
            );
        }

        // --------------------------------------------------------
        // CALCULATE SMOOTH NORMALS
        // --------------------------------------------------------

        var normals = new Float32Array(positions.length);

        for (var i = 0; i < indices.length; i += 3) {

            var a = indices[i];
            var b = indices[i + 1];
            var c = indices[i + 2];

            var ax = positions[a * 3];
            var ay = positions[a * 3 + 1];
            var az = positions[a * 3 + 2];

            var bx = positions[b * 3];
            var by = positions[b * 3 + 1];
            var bz = positions[b * 3 + 2];

            var cx = positions[c * 3];
            var cy = positions[c * 3 + 1];
            var cz = positions[c * 3 + 2];

            var abx = bx - ax;
            var aby = by - ay;
            var abz = bz - az;

            var acx = cx - ax;
            var acy = cy - ay;
            var acz = cz - az;

            var nx = aby * acz - abz * acy;
            var ny = abz * acx - abx * acz;
            var nz = abx * acy - aby * acx;

            normals[a * 3] += nx;
            normals[a * 3 + 1] += ny;
            normals[a * 3 + 2] += nz;

            normals[b * 3] += nx;
            normals[b * 3 + 1] += ny;
            normals[b * 3 + 2] += nz;

            normals[c * 3] += nx;
            normals[c * 3 + 1] += ny;
            normals[c * 3 + 2] += nz;
        }

        for (var i = 0; i < normals.length; i += 3) {

            var normalLength = Math.hypot(
                normals[i],
                normals[i + 1],
                normals[i + 2]
            );

            if (normalLength > 1e-8) {

                normals[i] /= normalLength;
                normals[i + 1] /= normalLength;
                normals[i + 2] /= normalLength;

            } else {

                normals[i] = 0;
                normals[i + 1] = 0;
                normals[i + 2] = normalZ;
            }
        }

        // --------------------------------------------------------
        // UPLOAD GPU MESH
        // --------------------------------------------------------

        var IndexArray = positions.length / 3 > 65535
        ? Uint32Array
        : Uint16Array;

        var positionData = new Float32Array(positions);
        var uvData = new Float32Array(uvs);
        var indexData = new IndexArray(indices);

        var mesh = {
            positionBuffer: gl.createBuffer(),
            normalBuffer: gl.createBuffer(),
            uvBuffer: gl.createBuffer(),
            indexBuffer: gl.createBuffer(),
            objectVao: gl.createVertexArray(),

            indexCount: indexData.length,
            indexType: indexData instanceof Uint32Array
            ? gl.UNSIGNED_INT
            : gl.UNSIGNED_SHORT,

            texture: texture,
            colour: [1, 1, 1, 1],
            transparentColor: null,
            repeatS: false,
            repeatT: false
        };

        if (
            !mesh.positionBuffer ||
            !mesh.normalBuffer ||
            !mesh.uvBuffer ||
            !mesh.indexBuffer ||
            !mesh.objectVao
        ) {
            throw new Error("Could not create 3D cab GPU mesh.");
        }

        gl.bindVertexArray(mesh.objectVao);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(objectLocations.aPosition);
        gl.vertexAttribPointer(
            objectLocations.aPosition, 3, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(objectLocations.aNormal);
        gl.vertexAttribPointer(
            objectLocations.aNormal, 3, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, uvData, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(objectLocations.aTexCoord);
        gl.vertexAttribPointer(
            objectLocations.aTexCoord, 2, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        return [mesh];
    }
















































    // ------------------------------------------------------------
    // CREATE 3D CAB EXTERIOR FROM cab3d
    //
    // The original outline is subdivided into a regular mesh.
    // The cab3d array supplies the Z displacement.
    //
    // Rows:    top to bottom.
    // Columns: left to right.
    //
    // Values are in metres.
    //
    // Points outside or exactly on the original body outline
    // are excluded from the depth map.
    //
    // The original outline remains at zero displacement.
    // This creates an exact join to the train body.
    //
    // Texture projection remains based on X and Y.
    // ------------------------------------------------------------

    function createCab3dEndMesh(
        points,
        z,
        normalZ,
        texture,
        textureBounds
    ) {

        var rows = cab3d.length;
        var columns = 0;

        for (var r = 0; r < rows; r++) {
            if (Array.isArray(cab3d[r])) {
                columns = Math.max(columns, cab3d[r].length);
            }
        }

        if (rows < 2 || columns < 2) {
            throw new Error("Invalid cab3d array.");
        }

        // --------------------------------------------------------
        // ORIGINAL CAB OUTLINE BOUNDS
        // --------------------------------------------------------

        var minX = Infinity;
        var maxX = -Infinity;
        var minY = Infinity;
        var maxY = -Infinity;

        for (var point of points) {

            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);

            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }

        var width = maxX - minX;
        var height = maxY - minY;

        if (width <= 1e-8 || height <= 1e-8) {
            throw new Error("Invalid cab outline.");
        }

        // --------------------------------------------------------
        // CHECK BODY OUTLINE
        // --------------------------------------------------------

        function isOnOutline(x, y) {

            for (var i = 0; i < points.length; i++) {

                var a = points[i];
                var b = points[(i + 1) % points.length];

                var dx = b.x - a.x;
                var dy = b.y - a.y;

                var cross =
                (x - a.x) * dy -
                (y - a.y) * dx;

                var dot =
                (x - a.x) * (x - b.x) +
                (y - a.y) * (y - b.y);

                if (
                    Math.abs(cross) < 1e-7 &&
                    dot <= 1e-7
                ) {
                    return true;
                }
            }

            return false;
        }

        function isInsideCab(x, y) {

            if (isOnOutline(x, y)) {
                return false;
            }

            var inside = false;

            for (var i = 0; i < points.length; i++) {

                var a = points[i];
                var b = points[(i + 1) % points.length];

                if (
                    (a.y > y) !== (b.y > y) &&
                    x < a.x +
                    (b.x - a.x) *
                    (y - a.y) /
                    (b.y - a.y)
                ) {
                    inside = !inside;
                }
            }

            return inside;
        }

        // --------------------------------------------------------
        // PREPARE DEPTH MAP
        //
        // Only array coordinates strictly inside the body are
        // allowed to contribute to the depth.
        //
        // Missing, invalid and outside coordinates become zero.
        // --------------------------------------------------------

        var depthGrid = [];

        for (var r = 0; r < rows; r++) {

            depthGrid[r] = [];

            for (var c = 0; c < columns; c++) {

                var depth = 0;

                if (
                    Array.isArray(cab3d[r]) &&
                    c < cab3d[r].length
                ) {

                    var value = cab3d[r][c];

                    if (
                        value !== null &&
                        value !== undefined &&
                        value !== ""
                    ) {

                        value = Number(value);

                        if (Number.isFinite(value)) {

                            var x = minX +
                            (c / (columns - 1)) * width;

                            var y = maxY -
                            (r / (rows - 1)) * height;

                            if (isInsideCab(x, y)) {
                                depth = value;
                            }
                        }
                    }
                }

                depthGrid[r][c] = depth;
            }
        }

        // --------------------------------------------------------
        // INTERPOLATE DEPTH AT ANY X/Y POSITION
        //
        // Bilinear interpolation between the four nearest
        // depth-map coordinates.
        // --------------------------------------------------------

        function getDepthAt(x, y) {

            if (isOnOutline(x, y)) {
                return 0;
            }

            var gx =
            ((x - minX) / width) * (columns - 1);

            var gy =
            ((maxY - y) / height) * (rows - 1);

            gx = Math.max(0, Math.min(columns - 1, gx));
            gy = Math.max(0, Math.min(rows - 1, gy));

            var c0 = Math.min(
                columns - 2,
                Math.floor(gx)
            );

            var r0 = Math.min(
                rows - 2,
                Math.floor(gy)
            );

            var u = gx - c0;
            var v = gy - r0;

            var d00 = depthGrid[r0][c0];
            var d01 = depthGrid[r0][c0 + 1];
            var d10 = depthGrid[r0 + 1][c0];
            var d11 = depthGrid[r0 + 1][c0 + 1];

            return (
                d00 * (1 - u) * (1 - v) +
                d01 * u * (1 - v) +
                d10 * (1 - u) * v +
                d11 * u * v
            );
        }

        // --------------------------------------------------------
        // TRIANGULATE ORIGINAL OUTLINE
        //
        // This gives a complete, valid starting surface.
        // The triangles are subsequently subdivided.
        // --------------------------------------------------------

        var outlineIndices = triangulate(points, normalZ);

        // Number of subdivisions along each original triangle.
        // This matches the resolution of the depth map.
        var subdivisions = Math.max(
            4,
            rows - 1,
            columns - 1
        );

        // --------------------------------------------------------
        // CREATE SHARED VERTICES
        // --------------------------------------------------------

        var positions = [];
        var uvs = [];
        var indices = [];

        var vertexLookup = new Map();

        function getVertex(x, y) {

            // The original body outline must remain at its
            // original Z position, regardless of the array.
            var depth = getDepthAt(x, y);

            if (isOnOutline(x, y)) {
                depth = 0;
            }

            // Keep the reversed displacement direction.
            var vertexZ = z - depth * normalZ;

            // Share vertices between adjacent subdivided triangles.
            var key =
            Math.round(x * 1e8) + "," +
            Math.round(y * 1e8);

            if (vertexLookup.has(key)) {
                return vertexLookup.get(key);
            }

            var index = positions.length / 3;

            positions.push(
                x,
                y,
                vertexZ
            );

            // Keep the original X/Y texture projection.
            uvs.push(
                Math.max(
                    0,
                    Math.min(
                        1,
                        (x - textureBounds.minX) /
                        textureBounds.size
                    )
                ),

                Math.max(
                    0,
                    Math.min(
                        1,
                        1 - (
                            (y - textureBounds.minY) /
                            textureBounds.size
                        )
                    )
                )
            );

            vertexLookup.set(key, index);

            return index;
        }

        // --------------------------------------------------------
        // SUBDIVIDE EVERY ORIGINAL OUTLINE TRIANGLE
        //
        // Barycentric subdivision creates a regular triangular
        // mesh over the complete original face.
        //
        // Every original boundary edge is retained, and all
        // subdivision points along it have zero displacement.
        // --------------------------------------------------------

        for (
            var t = 0;
        t < outlineIndices.length;
        t += 3
        ) {

            var a = points[outlineIndices[t]];
            var b = points[outlineIndices[t + 1]];
            var c = points[outlineIndices[t + 2]];

            var local = [];

            // Create this triangle's subdivided vertices.
            for (
                var i = 0;
            i <= subdivisions;
            i++
            ) {

                local[i] = [];

                for (
                    var j = 0;
                j <= subdivisions - i;
                j++
                ) {

                    var u = i / subdivisions;
                    var v = j / subdivisions;

                    var x =
                    a.x +
                    (b.x - a.x) * u +
                    (c.x - a.x) * v;

                    var y =
                    a.y +
                    (b.y - a.y) * u +
                    (c.y - a.y) * v;

                    local[i][j] = getVertex(x, y);
                }
            }

            // Create the small triangles.
            for (
                var i = 0;
            i < subdivisions;
            i++
            ) {

                for (
                    var j = 0;
                j < subdivisions - i;
                j++
                ) {

                    var p0 = local[i][j];
                    var p1 = local[i + 1][j];
                    var p2 = local[i][j + 1];

                    // First triangle.
                    indices.push(
                        p0,
                        p1,
                        p2
                    );

                    // Second triangle where the cell is complete.
                    if (i + j < subdivisions - 1) {

                        var p3 = local[i + 1][j + 1];

                        indices.push(
                            p1,
                            p3,
                            p2
                        );
                    }
                }
            }
        }

        if (indices.length === 0) {
            throw new Error("Could not generate 3D cab geometry.");
        }

        // --------------------------------------------------------
        // CALCULATE SMOOTH NORMALS
        // --------------------------------------------------------

        var normals = new Float32Array(positions.length);

        for (var i = 0; i < indices.length; i += 3) {

            var ia = indices[i];
            var ib = indices[i + 1];
            var ic = indices[i + 2];

            var ax = positions[ia * 3];
            var ay = positions[ia * 3 + 1];
            var az = positions[ia * 3 + 2];

            var bx = positions[ib * 3];
            var by = positions[ib * 3 + 1];
            var bz = positions[ib * 3 + 2];

            var cx = positions[ic * 3];
            var cy = positions[ic * 3 + 1];
            var cz = positions[ic * 3 + 2];

            var abx = bx - ax;
            var aby = by - ay;
            var abz = bz - az;

            var acx = cx - ax;
            var acy = cy - ay;
            var acz = cz - az;

            var nx = aby * acz - abz * acy;
            var ny = abz * acx - abx * acz;
            var nz = abx * acy - aby * acx;

            normals[ia * 3] += nx;
            normals[ia * 3 + 1] += ny;
            normals[ia * 3 + 2] += nz;

            normals[ib * 3] += nx;
            normals[ib * 3 + 1] += ny;
            normals[ib * 3 + 2] += nz;

            normals[ic * 3] += nx;
            normals[ic * 3 + 1] += ny;
            normals[ic * 3 + 2] += nz;
        }

        for (var i = 0; i < normals.length; i += 3) {

            var normalLength = Math.hypot(
                normals[i],
                normals[i + 1],
                normals[i + 2]
            );

            if (normalLength > 1e-8) {

                normals[i] /= normalLength;
                normals[i + 1] /= normalLength;
                normals[i + 2] /= normalLength;

            } else {

                normals[i] = 0;
                normals[i + 1] = 0;
                normals[i + 2] = normalZ;
            }
        }

        // --------------------------------------------------------
        // UPLOAD STATIC GPU MESH
        // --------------------------------------------------------

        var IndexArray = positions.length / 3 > 65535
        ? Uint32Array
        : Uint16Array;

        var positionData = new Float32Array(positions);
        var uvData = new Float32Array(uvs);
        var indexData = new IndexArray(indices);

        var mesh = {
            positionBuffer: gl.createBuffer(),
            normalBuffer: gl.createBuffer(),
            uvBuffer: gl.createBuffer(),
            indexBuffer: gl.createBuffer(),
            objectVao: gl.createVertexArray(),

            indexCount: indexData.length,

            indexType: indexData instanceof Uint32Array
            ? gl.UNSIGNED_INT
            : gl.UNSIGNED_SHORT,

            texture: texture,
            colour: [1, 1, 1, 1],
            transparentColor: null,
            repeatS: false,
            repeatT: false
        };

        if (
            !mesh.positionBuffer ||
            !mesh.normalBuffer ||
            !mesh.uvBuffer ||
            !mesh.indexBuffer ||
            !mesh.objectVao
        ) {
            throw new Error("Could not create 3D cab GPU mesh.");
        }

        gl.bindVertexArray(mesh.objectVao);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            positionData,
            gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(objectLocations.aPosition);
        gl.vertexAttribPointer(
            objectLocations.aPosition,
            3,
            gl.FLOAT,
            false,
            0,
            0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            normals,
            gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(objectLocations.aNormal);
        gl.vertexAttribPointer(
            objectLocations.aNormal,
            3,
            gl.FLOAT,
            false,
            0,
            0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            uvData,
            gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(objectLocations.aTexCoord);
        gl.vertexAttribPointer(
            objectLocations.aTexCoord,
            2,
            gl.FLOAT,
            false,
            0,
            0
        );

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
        gl.bufferData(
            gl.ELEMENT_ARRAY_BUFFER,
            indexData,
            gl.STATIC_DRAW
        );

        gl.bindVertexArray(null);

        console.log(
            "3D cab generated:",
            rows + "x" + columns,
            "depth map;",
            positions.length / 3,
            "vertices;",
            indices.length / 3,
            "triangles."
        );

        return [mesh];
    }















    // ------------------------------------------------------------
    // CREATE ROUNDED CAB EXTERIOR
    //
    // Used when cab3d is empty.
    //
    // The centre of the face moves 0.2m outwards.
    // The displacement smoothly reduces to zero at the edges.
    //
    // The original outline and texture mapping are preserved.
    // ------------------------------------------------------------

    function createRoundedCabEndMesh(
        points,
        z,
        normalZ,
        texture,
        textureBounds
    ) {



        // --------------------------------------------------------
        // FIND FACE DIMENSIONS
        // --------------------------------------------------------

        var minX = Infinity;
        var maxX = -Infinity;
        var minY = Infinity;
        var maxY = -Infinity;

        for (var point of points) {

            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);

            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }

        var subdivisions = Math.min(
            48,
            Math.max(
                24,
                Math.ceil(
                    Math.max(maxX - minX, maxY - minY) / 0.08
                )
            )
        );

        // --------------------------------------------------------
        // DISTANCE TO THE ORIGINAL OUTLINE
        // --------------------------------------------------------

        function distanceToOutline(x, y) {

            var minimumDistance = Infinity;

            for (var i = 0; i < points.length; i++) {

                var a = points[i];
                var b = points[(i + 1) % points.length];

                var dx = b.x - a.x;
                var dy = b.y - a.y;

                var lengthSquared = dx * dx + dy * dy;

                if (lengthSquared < 1e-12) continue;

                var t = (
                    (x - a.x) * dx +
                    (y - a.y) * dy
                ) / lengthSquared;

                t = Math.max(0, Math.min(1, t));

                var closestX = a.x + dx * t;
                var closestY = a.y + dy * t;

                var distance = Math.hypot(
                    x - closestX,
                    y - closestY
                );

                minimumDistance = Math.min(
                    minimumDistance,
                    distance
                );
            }

            return minimumDistance;
        }

        // --------------------------------------------------------
        // CREATE SHARED VERTICES
        // --------------------------------------------------------

        var positions = [];
        var uvs = [];
        var indices = [];

        var vertexLookup = new Map();

        function getVertex(x, y) {

            var key =
            Math.round(x * 1e8) + "," +
            Math.round(y * 1e8);

            if (vertexLookup.has(key)) {
                return vertexLookup.get(key);
            }

            var distance = distanceToOutline(x, y);

            // Smooth transition from the original body outline
            // to the forwards-displaced centre of the cab.
            var t = Math.max(
                0,
                Math.min(1, distance / roundWidth)
            );

            // Smoothstep.
            t = t * t * (3 - 2 * t);

            var displacement = roundDepth * t;

            // Move outwards according to the existing face normal.
            // Front exterior: normalZ = -1.
            // Rear exterior: normalZ = +1.
            var vertexZ = z - normalZ * displacement;

            var index = positions.length / 3;

            positions.push(
                x,
                y,
                vertexZ
            );

            // Preserve the original cab texture projection.
            uvs.push(
                Math.max(
                    0,
                    Math.min(
                        1,
                        (x - textureBounds.minX) /
                        textureBounds.size
                    )
                ),

                Math.max(
                    0,
                    Math.min(
                        1,
                        1 - (
                            (y - textureBounds.minY) /
                            textureBounds.size
                        )
                    )
                )
            );

            vertexLookup.set(key, index);

            return index;
        }

        // --------------------------------------------------------
        // SUBDIVIDE THE COMPLETE ORIGINAL CAB OUTLINE
        // --------------------------------------------------------

        var outlineIndices = triangulate(points, normalZ);

        for (
            var triangleIndex = 0;
        triangleIndex < outlineIndices.length;
        triangleIndex += 3
        ) {

            var a = points[outlineIndices[triangleIndex]];
            var b = points[outlineIndices[triangleIndex + 1]];
            var c = points[outlineIndices[triangleIndex + 2]];

            var local = [];

            // Generate evenly spaced vertices within this triangle.
            for (var i = 0; i <= subdivisions; i++) {

                local[i] = [];

                for (var j = 0; j <= subdivisions - i; j++) {

                    var u = i / subdivisions;
                    var v = j / subdivisions;

                    var x =
                    a.x +
                    (b.x - a.x) * u +
                    (c.x - a.x) * v;

                    var y =
                    a.y +
                    (b.y - a.y) * u +
                    (c.y - a.y) * v;

                    local[i][j] = getVertex(x, y);
                }
            }

            // Join the subdivided vertices into triangles.
            for (var i = 0; i < subdivisions; i++) {

                for (var j = 0; j < subdivisions - i; j++) {

                    var p0 = local[i][j];
                    var p1 = local[i + 1][j];
                    var p2 = local[i][j + 1];

                    indices.push(
                        p0, p1, p2
                    );

                    if (i + j < subdivisions - 1) {

                        var p3 = local[i + 1][j + 1];

                        indices.push(
                            p1, p3, p2
                        );
                    }
                }
            }
        }

        // --------------------------------------------------------
        // CALCULATE SMOOTH NORMALS
        // --------------------------------------------------------

        var normals = new Float32Array(positions.length);

        for (var i = 0; i < indices.length; i += 3) {

            var ia = indices[i];
            var ib = indices[i + 1];
            var ic = indices[i + 2];

            var ax = positions[ia * 3];
            var ay = positions[ia * 3 + 1];
            var az = positions[ia * 3 + 2];

            var bx = positions[ib * 3];
            var by = positions[ib * 3 + 1];
            var bz = positions[ib * 3 + 2];

            var cx = positions[ic * 3];
            var cy = positions[ic * 3 + 1];
            var cz = positions[ic * 3 + 2];

            var abx = bx - ax;
            var aby = by - ay;
            var abz = bz - az;

            var acx = cx - ax;
            var acy = cy - ay;
            var acz = cz - az;

            var nx = aby * acz - abz * acy;
            var ny = abz * acx - abx * acz;
            var nz = abx * acy - aby * acx;

            normals[ia * 3] += nx;
            normals[ia * 3 + 1] += ny;
            normals[ia * 3 + 2] += nz;

            normals[ib * 3] += nx;
            normals[ib * 3 + 1] += ny;
            normals[ib * 3 + 2] += nz;

            normals[ic * 3] += nx;
            normals[ic * 3 + 1] += ny;
            normals[ic * 3 + 2] += nz;
        }

        for (var i = 0; i < normals.length; i += 3) {

            var normalLength = Math.hypot(
                normals[i],
                normals[i + 1],
                normals[i + 2]
            );

            if (normalLength > 1e-8) {

                normals[i] /= normalLength;
                normals[i + 1] /= normalLength;
                normals[i + 2] /= normalLength;

            } else {

                normals[i] = 0;
                normals[i + 1] = 0;
                normals[i + 2] = normalZ;
            }
        }

        // --------------------------------------------------------
        // CREATE GPU MESH
        // --------------------------------------------------------

        var IndexArray = positions.length / 3 > 65535
        ? Uint32Array
        : Uint16Array;

        var positionData = new Float32Array(positions);
        var uvData = new Float32Array(uvs);
        var indexData = new IndexArray(indices);

        var mesh = {
            positionBuffer: gl.createBuffer(),
            normalBuffer: gl.createBuffer(),
            uvBuffer: gl.createBuffer(),
            indexBuffer: gl.createBuffer(),
            objectVao: gl.createVertexArray(),

            indexCount: indexData.length,
            indexType: indexData instanceof Uint32Array
            ? gl.UNSIGNED_INT
            : gl.UNSIGNED_SHORT,

            texture: texture,
            colour: [1, 1, 1, 1],
            transparentColor: null,
            repeatS: false,
            repeatT: false
        };

        if (
            !mesh.positionBuffer ||
            !mesh.normalBuffer ||
            !mesh.uvBuffer ||
            !mesh.indexBuffer ||
            !mesh.objectVao
        ) {
            throw new Error("Could not create rounded cab GPU mesh.");
        }

        gl.bindVertexArray(mesh.objectVao);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            positionData,
            gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(objectLocations.aPosition);
        gl.vertexAttribPointer(
            objectLocations.aPosition, 3, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            normals,
            gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(objectLocations.aNormal);
        gl.vertexAttribPointer(
            objectLocations.aNormal, 3, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            uvData,
            gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(objectLocations.aTexCoord);
        gl.vertexAttribPointer(
            objectLocations.aTexCoord, 2, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
        gl.bufferData(
            gl.ELEMENT_ARRAY_BUFFER,
            indexData,
            gl.STATIC_DRAW
        );

        gl.bindVertexArray(null);

        return [mesh];
    }

























    // ------------------------------------------------------------
    // BUILD EACH COACH'S TWO ENDS
    // ------------------------------------------------------------

    for (var coachIndex = 0; coachIndex < coachCount; coachIndex++) {

        var bodySet = trainBodyMeshes[coachIndex];

        if (!bodySet) continue;

        var frontIsCab = coachIndex === 0;
        var rearIsCab = coachIndex === coachCount - 1;

        var frontAdjustment = frontIsCab
        ? cabOverhang
        : nonCabOverhang;

        var rearAdjustment = rearIsCab
        ? cabOverhang
        : nonCabOverhang;

        var zFront = length * 0.5 + frontAdjustment;
        var zRear = -(length * 0.5 + rearAdjustment);

        var frontNeedsGangway = gangwaysEnabled && !frontIsCab;
        var rearNeedsGangway = gangwaysEnabled && !rearIsCab;

        bodySet.endOuter = [];
        bodySet.endInner = [];
        bodySet.endGangwayMeshes = [];

        // Calculate texture bounds from the complete exterior outline.
        // The same bounds are used by the matching interior face.
        var frontEndOutline = frontIsCab
        ? cabExteriorOutline
        : outline;

        var rearEndOutline = rearIsCab
        ? cabExteriorOutline
        : outline;

        var frontTextureBounds =
        getSquareTextureBounds(frontEndOutline);

        var rearTextureBounds =
        getSquareTextureBounds(rearEndOutline);

        // --------------------------------------------------------
        // EXTERIOR END FACES
        // --------------------------------------------------------







        var frontOuter;

        if (frontIsCab) {

            frontOuter = useCab3d
            ? createCab3dEndMesh(
                frontEndOutline,
                zFront,
                -1,
                trainCabTextureOuter,
                frontTextureBounds
            )
            : createRoundedCabEndMesh(
                frontEndOutline,
                zFront,
                -1,
                trainCabTextureOuter,
                frontTextureBounds
            );

        } else {

            frontOuter = createEndMesh(
                frontEndOutline,
                zFront,
                -1,
                trainBetweenTextureOuter,
                frontNeedsGangway,
                frontTextureBounds
            );
        }




        var rearOuter;

        if (rearIsCab) {

            rearOuter = useCab3d
            ? createCab3dEndMesh(
                rearEndOutline,
                zRear,
                1,
                trainCabTextureOuter,
                rearTextureBounds
            )
            : createRoundedCabEndMesh(
                rearEndOutline,
                zRear,
                1,
                trainCabTextureOuter,
                rearTextureBounds
            );

        } else {

            rearOuter = createEndMesh(
                rearEndOutline,
                zRear,
                1,
                trainBetweenTextureOuter,
                rearNeedsGangway,
                rearTextureBounds
            );
        }














































        // --------------------------------------------------------
        // INTERIOR END FACES
        // --------------------------------------------------------

        // Front interior faces +Z.
        var frontInnerOffset = frontIsCab ? 1.5 : thickness;

        var frontInner = createEndMesh(
            interiorOutline,
            zFront - frontInnerOffset,
            1,
            frontIsCab
            ? trainCabTextureInner
            : trainBetweenTextureInner,
            frontNeedsGangway,
            frontTextureBounds
        );

        // Rear interior faces -Z.
        var rearInnerOffset = rearIsCab ? 1.5 : thickness;

        var rearInner = createEndMesh(
            interiorOutline,
            zRear + rearInnerOffset,
            -1,
            rearIsCab
            ? trainCabTextureInner
            : trainBetweenTextureInner,
            rearNeedsGangway,
            rearTextureBounds
        );

        for (var mesh of frontOuter) bodySet.endOuter.push(mesh);
        for (var mesh of rearOuter) bodySet.endOuter.push(mesh);

        for (var mesh of frontInner) bodySet.endInner.push(mesh);
        for (var mesh of rearInner) bodySet.endInner.push(mesh);

        for (var mesh of bodySet.endOuter) trainEndMeshes.push(mesh);
        for (var mesh of bodySet.endInner) trainEndMeshes.push(mesh);

        // --------------------------------------------------------
        // NEW GANGWAY FACES
        //
        // Four meshes per non-cab end:
        // left, right, roof and floor.
        // --------------------------------------------------------

        var gangwayEnds = [];

        if (frontNeedsGangway) {
            gangwayEnds.push([
                zFront,
                length * 0.5
            ]);
        }

        if (rearNeedsGangway) {
            gangwayEnds.push([
                zRear,
                -length * 0.5
            ]);
        }

        for (var gangwayEnd of gangwayEnds) {

            // Keep the old outer endpoint and its Jacobs shortening.
            var zOuterStart = gangwayEnd[0];

            var zEnd = zOuterStart +
            (gangwayEnd[1] - zOuterStart) * gangwayLengthFactor;

            // Move the coach-side end 0.1 into the interior.
            // Front ends extend in +Z, rear ends extend in -Z.
            var zStart = zOuterStart -
            Math.sign(gangwayEnd[1] - zOuterStart) * thickness;

            if (Math.abs(zEnd - zStart) < 1e-7) continue;

            var x = halfGauge;
            var y = openingTop;

            var faces;






            if (zEnd > zStart) {

                // Gangway extends in +Z.
                faces = [
                    // Left side — texture 2.
                    [
                        [
                            -x, 0, zStart,
                            -x, 0, zEnd,
                            -x, y, zEnd,
                            -x, y, zStart
                        ],
                        [-1, 0, 0],
                        misc_2
                    ],

                    // Right side — texture 2.
                    [
                        [
                            x, 0, zEnd,
                            x, 0, zStart,
                            x, y, zStart,
                            x, y, zEnd
                        ],
                        [1, 0, 0],
                        misc_2
                    ],

                    // Roof — texture 2.
                    [
                        [
                            -x, y, zStart,
                            -x, y, zEnd,
                            x, y, zEnd,
                            x, y, zStart
                        ],
                        [0, 1, 0],
                        misc_2
                    ],

                    // Floor — texture 2.
                    [
                        [
                            -x, 0, zEnd,
                            -x, 0, zStart,
                            x, 0, zStart,
                            x, 0, zEnd
                        ],
                        [0, -1, 0],
                        misc_2
                    ]
                ];

            } else {

                // Gangway extends in -Z.
                faces = [
                    // Left side — texture 2.
                    [
                        [
                            -x, 0, zEnd,
                            -x, 0, zStart,
                            -x, y, zStart,
                            -x, y, zEnd
                        ],
                        [-1, 0, 0],
                        misc_2
                    ],

                    // Right side — texture 2.
                    [
                        [
                            x, 0, zStart,
                            x, 0, zEnd,
                            x, y, zEnd,
                            x, y, zStart
                        ],
                        [1, 0, 0],
                        misc_2
                    ],

                    // Roof — texture 2.
                    [
                        [
                            -x, y, zEnd,
                            -x, y, zStart,
                            x, y, zStart,
                            x, y, zEnd
                        ],
                        [0, 1, 0],
                        misc_2
                    ],

                    // Floor — texture 2.
                    [
                        [
                            -x, 0, zStart,
                            -x, 0, zEnd,
                            x, 0, zEnd,
                            x, 0, zStart
                        ],
                        [0, -1, 0],
                        misc_2
                    ]
                ];
            }














            // Upload the four gangway meshes.
            for (var face of faces) {

                var faceVertices = face[0];
                var faceNormal = face[1];
                var faceTexture = face[2];

                var positions = new Float32Array(faceVertices);

                var normals = new Float32Array([
                    faceNormal[0], faceNormal[1], faceNormal[2],
                    faceNormal[0], faceNormal[1], faceNormal[2],
                    faceNormal[0], faceNormal[1], faceNormal[2],
                    faceNormal[0], faceNormal[1], faceNormal[2]
                ]);

                var uvs = new Float32Array([
                    0, 0,
                    1, 0,
                    1, 1,
                    0, 1
                ]);

                var indices = new Uint16Array([
                    0, 1, 2,
                    0, 2, 3
                ]);

                var mesh = {
                    positionBuffer: gl.createBuffer(),
                    normalBuffer: gl.createBuffer(),
                    uvBuffer: gl.createBuffer(),
                    indexBuffer: gl.createBuffer(),
                    objectVao: gl.createVertexArray(),

                    indexCount: 6,
                    indexType: gl.UNSIGNED_SHORT,

                    texture: faceTexture,
                    colour: [1, 1, 1, 1],
                    transparentColor: null,
                    repeatS: false,
                    repeatT: false
                };

                if (
                    !mesh.positionBuffer ||
                    !mesh.normalBuffer ||
                    !mesh.uvBuffer ||
                    !mesh.indexBuffer ||
                    !mesh.objectVao
                ) {
                    throw new Error("Could not create coach-end gangway mesh.");
                }

                gl.bindVertexArray(mesh.objectVao);

                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
                gl.enableVertexAttribArray(objectLocations.aPosition);
                gl.vertexAttribPointer(
                    objectLocations.aPosition, 3, gl.FLOAT, false, 0, 0
                );

                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
                gl.enableVertexAttribArray(objectLocations.aNormal);
                gl.vertexAttribPointer(
                    objectLocations.aNormal, 3, gl.FLOAT, false, 0, 0
                );

                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
                gl.enableVertexAttribArray(objectLocations.aTexCoord);
                gl.vertexAttribPointer(
                    objectLocations.aTexCoord, 2, gl.FLOAT, false, 0, 0
                );

                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

                gl.bindVertexArray(null);

                bodySet.endGangwayMeshes.push(mesh);
                trainEndMeshes.push(mesh);
            }
        }
    }

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}




///////////////// todo

function Load_train_components() {

    ensureObjectRenderer();

    var gauge = Number(TRACK_GAUGE);
    var railWidth = Number(RAIL_WIDTH);
    var bogieProportions = Number(bogie_proportions);
    var bogieHeight = Number(bogie_height);

    var lowerRoofHeight =
    Number(train_roof_height) * Number(train_doortop_percentage);

    var floorCoachCount = Math.floor(Number(coaches));

    if (!Number.isFinite(floorCoachCount) || floorCoachCount < 0) {
        floorCoachCount = 0;
    }

    var floorCoachLength = Number(coachlength);
    var floorCabOverhang = Number(cab_overhang);
    var floorNonCabOverhang = Number(non_cab_overhang);
    var floorWidth = Number(trainWidth);

    if (
        !Number.isFinite(floorCoachLength) ||
        floorCoachLength <= 0 ||
        !Number.isFinite(floorWidth) ||
        floorWidth <= 0
    ) {
        throw new Error("Invalid coach floor dimensions.");
    }

    floorCabOverhang = Number.isFinite(floorCabOverhang)
    ? floorCabOverhang
    : 0;

    floorNonCabOverhang = Number.isFinite(floorNonCabOverhang)
    ? Math.min(0, floorNonCabOverhang)
    : 0;

    var bogieWidth = gauge + railWidth;
    var bogieLength = gauge * bogieProportions;

    var halfWidth = bogieWidth * 0.5;
    var halfLength = bogieLength * 0.5;

    var gangwayEnabled = Jacobs_bogies === true;

    if (
        !Number.isFinite(bogieWidth) ||
        bogieWidth <= 0 ||
        !Number.isFinite(bogieLength) ||
        bogieLength <= 0 ||
        !Number.isFinite(bogieHeight) ||
        bogieHeight <= 0
    ) {
        throw new Error("Invalid bogie dimensions.");
    }

    if (
        gangwayEnabled &&
        (
            !Number.isFinite(lowerRoofHeight) ||
            lowerRoofHeight <= bogieHeight
        )
    ) {
        throw new Error("Invalid Jacobs gangway height.");
    }

    // ------------------------------------------------------------
    // CALCULATE FLOOR WIDTH FROM THE INSIDE OF THE BODY PROFILE
    //
    // The floor should meet the inside surface of the body,
    // including the inward curve at the bottom.
    //
    // bodyLocalY() extends the original bottom points down by
    // 0.1, so the calculation reproduces that same geometry.
    // ------------------------------------------------------------

    var floorHalfWidth = floorWidth * 0.5;

    var floorBodyHeight =
    Number(train_roof_height) - Number(train_floor_height);

    var floorBodyThickness = Number(train_body_thickness);
    var floorBodyBottomExtension = 0.1;

    var floorWidthFound = false;

    if (
        Array.isArray(train_body_dimentions) &&
        train_body_dimentions.length >= 2 &&
        Number.isFinite(floorBodyHeight) &&
        floorBodyHeight > 0 &&
        Number.isFinite(floorBodyThickness) &&
        floorBodyThickness > 0
    ) {

        for (
            var i = 0;
        i < train_body_dimentions.length - 1;
        i++
        ) {

            var pointA = train_body_dimentions[i];
            var pointB = train_body_dimentions[i + 1];

            if (
                !Array.isArray(pointA) ||
                !Array.isArray(pointB) ||
                !Number.isFinite(Number(pointA[0])) ||
                !Number.isFinite(Number(pointA[1])) ||
                !Number.isFinite(Number(pointB[0])) ||
                !Number.isFinite(Number(pointB[1]))
            ) {
                continue;
            }

            var x0 = Number(pointA[0]) * floorWidth * 0.5;
            var x1 = Number(pointB[0]) * floorWidth * 0.5;

            var y0 = Number(pointA[1]) * floorBodyHeight;
            var y1 = Number(pointB[1]) * floorBodyHeight;

            if (Math.abs(Number(pointA[1])) < 1e-7) {
                y0 -= floorBodyBottomExtension;
            }

            if (Math.abs(Number(pointB[1])) < 1e-7) {
                y1 -= floorBodyBottomExtension;
            }

            var dx = x1 - x0;
            var dy = y1 - y0;

            var panelLength = Math.hypot(dx, dy);

            if (panelLength < 1e-7) continue;

            // Same inward-facing normal used by getPanelGeometry().
            var normalX = dy / panelLength;
            var normalY = -dx / panelLength;

            // Inside surface of the body panel.
            var innerX0 = x0 - normalX * floorBodyThickness;
            var innerY0 = y0 - normalY * floorBodyThickness;

            var innerX1 = x1 - normalX * floorBodyThickness;
            var innerY1 = y1 - normalY * floorBodyThickness;

            // Find where the inside surface crosses the floor plane.
            if (
                !(
                    (
                        innerY0 <= 1e-7 &&
                        innerY1 >= -1e-7
                    ) ||
                    (
                        innerY1 <= 1e-7 &&
                        innerY0 >= -1e-7
                    )
                )
            ) {
                continue;
            }

            var innerYDifference = innerY1 - innerY0;
            var floorIntersectionX;

            if (Math.abs(innerYDifference) < 1e-8) {

                floorIntersectionX = Math.max(
                    Math.abs(innerX0),
                                              Math.abs(innerX1)
                );

            } else {

                var t = -innerY0 / innerYDifference;

                if (t < -1e-7 || t > 1 + 1e-7) {
                    continue;
                }

                t = Math.max(0, Math.min(1, t));

                floorIntersectionX =
                innerX0 + (innerX1 - innerX0) * t;
            }

            if (
                Number.isFinite(floorIntersectionX) &&
                Math.abs(floorIntersectionX) > 0.01
            ) {

                floorHalfWidth = Math.min(
                    floorWidth * 0.5,
                    Math.abs(floorIntersectionX)
                );

                floorWidthFound = true;
                break;
            }
        }
    }

    // Fallback for an unusual body profile which does not cross
    // the floor plane on any valid segment.
    if (
        !floorWidthFound &&
        Array.isArray(train_body_dimentions) &&
        train_body_dimentions.length > 0
    ) {

        var lowestProfileY = Infinity;
        var lowestProfileX = 0;

        for (var point of train_body_dimentions) {

            if (
                !Array.isArray(point) ||
                !Number.isFinite(Number(point[0])) ||
                !Number.isFinite(Number(point[1]))
            ) {
                continue;
            }

            if (Number(point[1]) < lowestProfileY) {
                lowestProfileY = Number(point[1]);
                lowestProfileX = Number(point[0]);
            } else if (
                Math.abs(Number(point[1]) - lowestProfileY) < 1e-7
            ) {
                lowestProfileX = Math.max(
                    lowestProfileX,
                    Number(point[0])
                );
            }
        }

        var fallbackFloorHalfWidth =
        Math.abs(lowestProfileX) * floorWidth * 0.5 -
        Math.max(0, floorBodyThickness);

        if (
            Number.isFinite(fallbackFloorHalfWidth) &&
            fallbackFloorHalfWidth > 0.01
        ) {
            floorHalfWidth = Math.min(
                floorHalfWidth,
                fallbackFloorHalfWidth
            );
        }
    }

    // ------------------------------------------------------------
    // DELETE PREVIOUS GPU MESHES
    // ------------------------------------------------------------

    var oldMeshes = new Set();

    function addOldMesh(mesh) {
        if (mesh) oldMeshes.add(mesh);
    }

    for (var mesh of trainComponentMeshes) {
        addOldMesh(mesh);
    }

    for (var mesh of trainGangwayMeshes) {
        addOldMesh(mesh);
    }

    for (var floorSet of trainFloorMeshes) {

        if (!floorSet) continue;

        addOldMesh(floorSet.top);
        addOldMesh(floorSet.bottom);
    }

    for (var bodySet of trainBodyMeshes) {

        if (!bodySet) continue;

        for (var mesh of bodySet.outer || []) addOldMesh(mesh);
        for (var mesh of bodySet.inner || []) addOldMesh(mesh);
        for (var mesh of bodySet.doorReveals || []) addOldMesh(mesh);

        for (var mesh of bodySet.endOuter || []) addOldMesh(mesh);
        for (var mesh of bodySet.endInner || []) addOldMesh(mesh);
        for (var mesh of bodySet.endGangwayMeshes || []) addOldMesh(mesh);

        for (var mesh of bodySet.npcDoorFillOuter || []) addOldMesh(mesh);
        for (var mesh of bodySet.npcDoorFillInner || []) addOldMesh(mesh);

        // Moving door batches.
        for (var mesh of bodySet.movingDoorOuter || []) addOldMesh(mesh);
        for (var mesh of bodySet.movingDoorInner || []) addOldMesh(mesh);
        for (var mesh of bodySet.movingDoorReveals || []) addOldMesh(mesh);

        // Compatibility with meshes created by the previous version.
        for (var leaf of bodySet.doorLeaves || []) {
            for (var oldMesh of leaf.meshes || []) {
                addOldMesh(oldMesh);
            }
        }
    }

    for (var oldMesh of oldMeshes) {

        if (oldMesh.objectVao) gl.deleteVertexArray(oldMesh.objectVao);
        if (oldMesh.positionBuffer) gl.deleteBuffer(oldMesh.positionBuffer);
        if (oldMesh.normalBuffer) gl.deleteBuffer(oldMesh.normalBuffer);
        if (oldMesh.uvBuffer) gl.deleteBuffer(oldMesh.uvBuffer);
        if (oldMesh.indexBuffer) gl.deleteBuffer(oldMesh.indexBuffer);
    }

    trainBodyMeshes = [];
    trainComponentMeshes = [];
    trainGangwayMeshes = [];
    trainFloorMeshes = [];

    // ------------------------------------------------------------
    // CREATE ONE GPU FACE
    // ------------------------------------------------------------

    function createFace(vertices, normal, texture, customUvs) {

        var positions = new Float32Array(vertices);

        var normals = new Float32Array([
            normal[0], normal[1], normal[2],
            normal[0], normal[1], normal[2],
            normal[0], normal[1], normal[2],
            normal[0], normal[1], normal[2]
        ]);

        var uvs = new Float32Array(customUvs || [
            0, 0,
            1, 0,
            1, 1,
            0, 1
        ]);

        if (
            texture &&
            (
                texture === trainBodyTextureOuter ||
                texture === trainBodyTextureInner ||
                texture === trainDoorTextureOuter ||
                texture === trainDoorTextureInner
            )
        ) {
            for (var i = 0; i < uvs.length; i += 2) {
                uvs[i] = 1 - uvs[i];
                uvs[i + 1] = 1 - uvs[i + 1];
            }
        }

        var indices = new Uint16Array([
            0, 1, 2,
            0, 2, 3
        ]);

        var mesh = {
            positionBuffer: gl.createBuffer(),
            normalBuffer: gl.createBuffer(),
            uvBuffer: gl.createBuffer(),
            indexBuffer: gl.createBuffer(),
            objectVao: gl.createVertexArray(),

            indexCount: 6,
            indexType: gl.UNSIGNED_SHORT,

            texture: texture,
            colour: [1, 1, 1, 1],
            transparentColor: null,
            repeatS: false,
            repeatT: false,

            positions: positions,
            normals: normals,
            uvs: uvs,
            indices: indices
        };

        if (
            !mesh.positionBuffer ||
            !mesh.normalBuffer ||
            !mesh.uvBuffer ||
            !mesh.indexBuffer ||
            !mesh.objectVao
        ) {
            throw new Error("Could not create train GPU mesh.");
        }

        gl.bindVertexArray(mesh.objectVao);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(objectLocations.aPosition);
        gl.vertexAttribPointer(objectLocations.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(objectLocations.aNormal);
        gl.vertexAttribPointer(objectLocations.aNormal, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(objectLocations.aTexCoord);
        gl.vertexAttribPointer(objectLocations.aTexCoord, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        return mesh;
    }

    // ------------------------------------------------------------
    // COMBINE FACES INTO ONE GPU MESH
    // ------------------------------------------------------------

    function mergeMeshGroup(meshes, moving) {

        if (!meshes.length) return [];

        if (meshes.length === 1) {

            var single = meshes[0];

            if (moving) {

                if (!single.doorBasePositions) {
                    single.doorBasePositions =
                    new Float32Array(single.positions);
                }

                if (!single.doorDynamicPositions) {
                    single.doorDynamicPositions =
                    new Float32Array(single.positions.length);
                }

                if (!single.doorBaseNormals) {
                    single.doorBaseNormals =
                    new Float32Array(single.normals);
                }

                if (!single.doorDynamicNormals) {
                    single.doorDynamicNormals =
                    new Float32Array(single.normals.length);
                }

                if (single.doorSide !== undefined) {

                    var vertexCount = single.positions.length / 3;

                    single.doorSides = new Int8Array(vertexCount);
                    single.doorSides.fill(single.doorSide);

                    single.doorTypes = new Uint8Array(vertexCount);
                    single.doorTypes.fill(single.doorType);

                    single.doorSlideRates = new Float32Array(vertexCount);
                    single.doorSlideRates.fill(single.doorSlideRate);

                    single.doorHingeZs = new Float32Array(vertexCount);
                    single.doorHingeZs.fill(single.doorHingeZ);

                    single.doorSwingSigns = new Float32Array(vertexCount);
                    single.doorSwingSigns.fill(single.doorSwingSign);
                }
            }

            return meshes;
        }

        var first = meshes[0];

        var totalFloats = 0;
        var totalIndices = 0;
        var hasDoorMetadata = moving && first.doorSide !== undefined;

        for (var mesh of meshes) {

            if (
                mesh.texture !== first.texture ||
                mesh.positions.length % 3 !== 0
            ) {
                throw new Error(
                    "Invalid mesh group while batching train geometry."
                );
            }

            if (
                hasDoorMetadata &&
                mesh.doorSide === undefined
            ) {
                throw new Error("Missing door movement information.");
            }

            totalFloats += mesh.positions.length;
            totalIndices += mesh.indices.length;
        }

        var totalVertices = totalFloats / 3;

        var mergedPositions = new Float32Array(totalFloats);
        var mergedNormals = new Float32Array(totalFloats);
        var mergedUvs = new Float32Array(totalVertices * 2);

        var use32BitIndices = totalVertices > 65535;
        var IndexArray = use32BitIndices ? Uint32Array : Uint16Array;
        var mergedIndices = new IndexArray(totalIndices);

        var mergedMoveNormals = moving
        ? new Float32Array(totalFloats)
        : null;

        var mergedDoorSides = hasDoorMetadata
        ? new Int8Array(totalVertices)
        : null;

        var mergedDoorTypes = hasDoorMetadata
        ? new Uint8Array(totalVertices)
        : null;

        var mergedDoorSlideRates = hasDoorMetadata
        ? new Float32Array(totalVertices)
        : null;

        var mergedDoorHingeZs = hasDoorMetadata
        ? new Float32Array(totalVertices)
        : null;

        var mergedDoorSwingSigns = hasDoorMetadata
        ? new Float32Array(totalVertices)
        : null;

        var positionOffset = 0;
        var uvOffset = 0;
        var indexOffset = 0;
        var vertexOffset = 0;

        for (var mesh of meshes) {

            mergedPositions.set(mesh.positions, positionOffset);
            mergedNormals.set(mesh.normals, positionOffset);
            mergedUvs.set(mesh.uvs, uvOffset);

            for (var i = 0; i < mesh.indices.length; i++) {
                mergedIndices[indexOffset + i] =
                mesh.indices[i] + vertexOffset;
            }

            if (moving) {

                if (!mesh.doorMoveNormals) {
                    throw new Error(
                        "Door mesh is missing movement normals."
                    );
                }

                mergedMoveNormals.set(
                    mesh.doorMoveNormals,
                    positionOffset
                );
            }

            if (hasDoorMetadata) {

                var vertexCount = mesh.positions.length / 3;

                mergedDoorSides.fill(
                    mesh.doorSide,
                    vertexOffset,
                    vertexOffset + vertexCount
                );

                mergedDoorTypes.fill(
                    mesh.doorType,
                    vertexOffset,
                    vertexOffset + vertexCount
                );

                mergedDoorSlideRates.fill(
                    mesh.doorSlideRate,
                    vertexOffset,
                    vertexOffset + vertexCount
                );

                mergedDoorHingeZs.fill(
                    mesh.doorHingeZ,
                    vertexOffset,
                    vertexOffset + vertexCount
                );

                mergedDoorSwingSigns.fill(
                    mesh.doorSwingSign,
                    vertexOffset,
                    vertexOffset + vertexCount
                );
            }

            positionOffset += mesh.positions.length;
            uvOffset += mesh.uvs.length;
            indexOffset += mesh.indices.length;
            vertexOffset += mesh.positions.length / 3;
        }

        var merged = {
            positionBuffer: gl.createBuffer(),
            normalBuffer: gl.createBuffer(),
            uvBuffer: gl.createBuffer(),
            indexBuffer: gl.createBuffer(),
            objectVao: gl.createVertexArray(),

            indexCount: mergedIndices.length,
            indexType: use32BitIndices
            ? gl.UNSIGNED_INT
            : gl.UNSIGNED_SHORT,

            texture: first.texture,
            colour: first.colour
            ? Array.from(first.colour)
            : [1, 1, 1, 1],

            transparentColor: first.transparentColor
            ? Array.from(first.transparentColor)
            : null,

            repeatS: first.repeatS,
            repeatT: first.repeatT,

            positions: mergedPositions,
            normals: mergedNormals,
            uvs: mergedUvs,
            indices: mergedIndices,

            doorBasePositions: moving
            ? new Float32Array(mergedPositions)
            : null,

            doorMoveNormals: mergedMoveNormals,

            doorDynamicPositions: moving
            ? new Float32Array(totalFloats)
            : null,

            doorBaseNormals: moving
            ? new Float32Array(mergedNormals)
            : null,

            doorDynamicNormals: moving
            ? new Float32Array(totalFloats)
            : null,

            doorSides: mergedDoorSides,
            doorTypes: mergedDoorTypes,
            doorSlideRates: mergedDoorSlideRates,
            doorHingeZs: mergedDoorHingeZs,
            doorSwingSigns: mergedDoorSwingSigns,

            doorSide: first.doorSide,
            doorType: first.doorType,
            doorSlideRate: first.doorSlideRate,
            doorHingeZ: first.doorHingeZ,
            doorSwingSign: first.doorSwingSign
        };

        if (
            !merged.positionBuffer ||
            !merged.normalBuffer ||
            !merged.uvBuffer ||
            !merged.indexBuffer ||
            !merged.objectVao
        ) {
            throw new Error("Could not create combined train mesh.");
        }

        gl.bindVertexArray(merged.objectVao);

        gl.bindBuffer(gl.ARRAY_BUFFER, merged.positionBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            mergedPositions,
            moving ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(objectLocations.aPosition);
        gl.vertexAttribPointer(
            objectLocations.aPosition, 3, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, merged.normalBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            mergedNormals,
            moving ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(objectLocations.aNormal);
        gl.vertexAttribPointer(
            objectLocations.aNormal, 3, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, merged.uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mergedUvs, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(objectLocations.aTexCoord);
        gl.vertexAttribPointer(
            objectLocations.aTexCoord, 2, gl.FLOAT, false, 0, 0
        );

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, merged.indexBuffer);
        gl.bufferData(
            gl.ELEMENT_ARRAY_BUFFER,
            mergedIndices,
            gl.STATIC_DRAW
        );

        gl.bindVertexArray(null);

        for (var oldMesh of meshes) {
            if (oldMesh.objectVao) gl.deleteVertexArray(oldMesh.objectVao);
            if (oldMesh.positionBuffer) gl.deleteBuffer(oldMesh.positionBuffer);
            if (oldMesh.normalBuffer) gl.deleteBuffer(oldMesh.normalBuffer);
            if (oldMesh.uvBuffer) gl.deleteBuffer(oldMesh.uvBuffer);
            if (oldMesh.indexBuffer) gl.deleteBuffer(oldMesh.indexBuffer);
        }

        return [merged];
    }

    // ------------------------------------------------------------
    // DARK REVEALS
    // ------------------------------------------------------------

    function createDarkReveal(vertices, normal, targetArray) {

        var mesh = createFace(vertices, normal, null);
        mesh.colour = [0.15, 0.15, 0.15, 1];

        targetArray.push(mesh);
        return mesh;
    }

    // ------------------------------------------------------------
    // BOGIES
    // ------------------------------------------------------------

    trainComponentMeshes.push(createFace([
        -halfWidth, 0, halfLength,
        -halfWidth, 0, -halfLength,
        -halfWidth, bogieHeight, -halfLength,
        -halfWidth, bogieHeight, halfLength
    ], [-1, 0, 0], misc_0));

    trainComponentMeshes.push(createFace([
        halfWidth, 0, -halfLength,
        halfWidth, 0, halfLength,
        halfWidth, bogieHeight, halfLength,
        halfWidth, bogieHeight, -halfLength
    ], [1, 0, 0], misc_0));

    trainComponentMeshes.push(createFace([
        -halfWidth, 0, halfLength,
        halfWidth, 0, halfLength,
        halfWidth, bogieHeight, halfLength,
        -halfWidth, bogieHeight, halfLength
    ], [0, 0, 1], misc_1));

    trainComponentMeshes.push(createFace([
        halfWidth, 0, -halfLength,
        -halfWidth, 0, -halfLength,
        -halfWidth, bogieHeight, -halfLength,
        halfWidth, bogieHeight, -halfLength
    ], [0, 0, -1], misc_1));

    // ------------------------------------------------------------
    // JACOBS GANGWAYS
    // All four faces use texture 2 (misc_2).
    // ------------------------------------------------------------




    // ------------------------------------------------------------
    // JACOBS MINI-COACH
    //
    // Replaces the original four gangway faces.
    //
    // Uses the normal train body dimensions and textures.
    // The mini-coach length is exactly the bogie length.
    //
    // Each end has:
    //   1. Wall to the left of the gangway opening.
    //   2. Wall to the right of the gangway opening.
    //   3. Wall above the gangway opening.
    //
    // Includes exterior and interior walls and an interior floor.
    //
    // All meshes remain in trainGangwayMeshes and therefore use
    // the existing Jacobs bogie positioning and drawing system.
    // ------------------------------------------------------------

    if (gangwayEnabled) {

        var miniWidth = Number(trainWidth);
        var miniHalfWidth = miniWidth * 0.5;

        var miniHalfGauge = gauge * 0.5;

        var miniHeight =
        Number(train_roof_height) - Number(train_floor_height);

        var miniFloorY = bogieHeight;

        var miniThickness = Number(train_body_thickness);

        var miniLength = halfLength * 2;

        var miniOpeningTop =
        miniHeight * Number(train_doortop_percentage);

        var miniProfile = train_body_dimentions;

        if (
            !Array.isArray(miniProfile) ||
            miniProfile.length < 3 ||
            !Number.isFinite(miniWidth) ||
            miniWidth <= 0 ||
            !Number.isFinite(miniHeight) ||
            miniHeight <= 0 ||
            !Number.isFinite(miniThickness) ||
            miniThickness <= 0 ||
            miniOpeningTop <= 0 ||
            miniOpeningTop >= miniHeight
        ) {
            throw new Error("Invalid Jacobs mini-coach dimensions.");
        }

        if (
            !trainBodyTextureOuter ||
            !trainBodyTextureInner ||
            !trainBetweenTextureOuter ||
            !trainBetweenTextureInner
        ) {
            throw new Error("Jacobs mini-coach textures have not been loaded.");
        }

        // --------------------------------------------------------
        // BODY SIDE WALLS
        // --------------------------------------------------------

        function miniBodyY(y) {

            var result = Number(y) * miniHeight;

            if (Math.abs(Number(y)) < 1e-7) {
                result -= 0.1;
            }

            return miniFloorY + result;
        }

        function miniTextureU(z) {

            return 0.25 + (
                (z + floorCoachLength * 0.5) /
                floorCoachLength
            ) * 0.5;
        }

        // Build left and right exterior and interior walls.
        for (var miniSideIndex = 0; miniSideIndex < 2; miniSideIndex++) {

            var miniSide = miniSideIndex === 0 ? 1 : -1;

            for (
                var miniPanelIndex = 0;
            miniPanelIndex < miniProfile.length - 1;
            miniPanelIndex++
            ) {

                var a = miniProfile[miniPanelIndex];
                var b = miniProfile[miniPanelIndex + 1];

                var x0 = miniSide * Number(a[0]) * miniHalfWidth;
                var x1 = miniSide * Number(b[0]) * miniHalfWidth;

                var y0 = miniBodyY(a[1]);
                var y1 = miniBodyY(b[1]);

                var dx = x1 - x0;
                var dy = y1 - y0;

                var panelLength = Math.hypot(dx, dy);

                if (panelLength < 1e-7) continue;

                var nx = miniSide * dy / panelLength;
                var ny = miniSide * -dx / panelLength;

                var innerX0 = x0 - nx * miniThickness;
                var innerY0 = y0 - ny * miniThickness;

                var innerX1 = x1 - nx * miniThickness;
                var innerY1 = y1 - ny * miniThickness;

                var uFront = miniTextureU(halfLength);
                var uRear = miniTextureU(-halfLength);

                var outerVertices;
                var outerUvs;

                var innerVertices;
                var innerUvs;

                if (miniSide === 1) {

                    outerVertices = [
                        x0, y0, halfLength,
                        x0, y0, -halfLength,
                        x1, y1, -halfLength,
                        x1, y1, halfLength
                    ];

                    outerUvs = [
                        uFront, Number(a[1]),
                        uRear, Number(a[1]),
                        uRear, Number(b[1]),
                        uFront, Number(b[1])
                    ];

                    innerVertices = [
                        innerX1, innerY1, halfLength,
                        innerX1, innerY1, -halfLength,
                        innerX0, innerY0, -halfLength,
                        innerX0, innerY0, halfLength
                    ];

                    innerUvs = [
                        uFront, Number(b[1]),
                        uRear, Number(b[1]),
                        uRear, Number(a[1]),
                        uFront, Number(a[1])
                    ];

                } else {

                    outerVertices = [
                        x1, y1, halfLength,
                        x1, y1, -halfLength,
                        x0, y0, -halfLength,
                        x0, y0, halfLength
                    ];

                    outerUvs = [
                        uFront, Number(b[1]),
                        uRear, Number(b[1]),
                        uRear, Number(a[1]),
                        uFront, Number(a[1])
                    ];

                    innerVertices = [
                        innerX0, innerY0, halfLength,
                        innerX0, innerY0, -halfLength,
                        innerX1, innerY1, -halfLength,
                        innerX1, innerY1, halfLength
                    ];

                    innerUvs = [
                        uFront, Number(a[1]),
                        uRear, Number(a[1]),
                        uRear, Number(b[1]),
                        uFront, Number(b[1])
                    ];
                }

                trainGangwayMeshes.push(
                    createFace(
                        outerVertices,
                        [nx, ny, 0],
                        trainBodyTextureOuter,
                        outerUvs
                    )
                );

                trainGangwayMeshes.push(
                    createFace(
                        innerVertices,
                        [-nx, -ny, 0],
                        trainBodyTextureInner,
                        innerUvs
                    )
                );
            }
        }

        // --------------------------------------------------------
        // INTERIOR FLOOR
        // --------------------------------------------------------

        var miniFloorPhysicalWidth = floorHalfWidth * 2;

        var miniFloor = createFace([
            -floorHalfWidth, miniFloorY, halfLength,
            floorHalfWidth, miniFloorY, halfLength,
            floorHalfWidth, miniFloorY, -halfLength,
            -floorHalfWidth, miniFloorY, -halfLength
        ], [0, 1, 0], misc_3, [
            0, 0,
            miniFloorPhysicalWidth, 0,
            miniFloorPhysicalWidth, miniLength,
            0, miniLength
        ]);

        miniFloor.repeatS = true;
        miniFloor.repeatT = true;

        trainGangwayMeshes.push(miniFloor);

        // --------------------------------------------------------
        // MINI-COACH END OUTLINE
        //
        // Build the complete cross-section from the normal coach
        // profile, mirrored across the centre of the train.
        // --------------------------------------------------------

        var miniOutline = [];

        for (var i = 0; i < miniProfile.length; i++) {

            miniOutline.push({
                x: Number(miniProfile[i][0]) * miniHalfWidth,
                             y: Number(miniProfile[i][1]) * miniHeight -
                             (Math.abs(Number(miniProfile[i][1])) < 1e-7 ? 0.1 : 0)
            });
        }

        for (var i = miniProfile.length - 2; i >= 0; i--) {

            miniOutline.push({
                x: -Number(miniProfile[i][0]) * miniHalfWidth,
                             y: Number(miniProfile[i][1]) * miniHeight -
                             (Math.abs(Number(miniProfile[i][1])) < 1e-7 ? 0.1 : 0)
            });
        }

        // --------------------------------------------------------
        // INTERIOR END OUTLINE
        //
        // Offset the outline inwards by the normal body thickness.
        // --------------------------------------------------------

        function miniPolygonArea(points) {

            var area = 0;

            for (var i = 0; i < points.length; i++) {

                var a = points[i];
                var b = points[(i + 1) % points.length];

                area += a.x * b.y - b.x * a.y;
            }

            return area * 0.5;
        }

        var miniOrientation =
        miniPolygonArea(miniOutline) > 0 ? 1 : -1;

        var miniInnerOutline = [];

        for (var i = 0; i < miniOutline.length; i++) {

            var previous =
            miniOutline[(i + miniOutline.length - 1) % miniOutline.length];

            var current = miniOutline[i];

            var next =
            miniOutline[(i + 1) % miniOutline.length];

            var dx1 = current.x - previous.x;
            var dy1 = current.y - previous.y;

            var dx2 = next.x - current.x;
            var dy2 = next.y - current.y;

            var length1 = Math.hypot(dx1, dy1);
            var length2 = Math.hypot(dx2, dy2);

            if (length1 < 1e-8 || length2 < 1e-8) {
                throw new Error("Invalid Jacobs mini-coach interior outline.");
            }

            var n1x = miniOrientation * dy1 / length1;
            var n1y = -miniOrientation * dx1 / length1;

            var n2x = miniOrientation * dy2 / length2;
            var n2y = -miniOrientation * dx2 / length2;

            var mx = n1x + n2x;
            var my = n1y + n2y;

            var miterLength = Math.hypot(mx, my);

            if (miterLength < 1e-8) {

                mx = n2x;
                my = n2y;

            } else {

                mx /= miterLength;
                my /= miterLength;
            }

            var denominator = mx * n2x + my * n2y;

            if (Math.abs(denominator) < 0.1) {

                mx = n2x;
                my = n2y;
                denominator = 1;
            }

            var offset = Math.max(
                -miniThickness * 8,
                Math.min(
                    miniThickness * 8,
                    miniThickness / denominator
                )
            );

            miniInnerOutline.push({
                x: current.x - mx * offset,
                y: current.y - my * offset
            });
        }

        // --------------------------------------------------------
        // CLIP END WALLS AROUND THE GANGWAY OPENING
        //
        // The three regions are:
        //   1. Left of the opening.
        //   2. Right of the opening.
        //   3. Above the opening.
        //
        // There is deliberately no face across the opening.
        // --------------------------------------------------------

        function miniClip(points, axis, boundary, keepGreater) {

            var result = [];

            for (var i = 0; i < points.length; i++) {

                var a = points[i];
                var b = points[(i + 1) % points.length];

                var av = axis === 0 ? a.x : a.y;
                var bv = axis === 0 ? b.x : b.y;

                var aInside = keepGreater
                ? av >= boundary - 1e-8
                : av <= boundary + 1e-8;

                var bInside = keepGreater
                ? bv >= boundary - 1e-8
                : bv <= boundary + 1e-8;

                if (aInside !== bInside) {

                    var t = (boundary - av) / (bv - av);

                    result.push({
                        x: a.x + (b.x - a.x) * t,
                                y: a.y + (b.y - a.y) * t
                    });
                }

                if (bInside) {
                    result.push({
                        x: b.x,
                        y: b.y
                    });
                }
            }

            return result;
        }

        function miniCleanPolygon(points) {

            var result = [];

            for (var point of points) {

                var previous = result[result.length - 1];

                if (
                    !previous ||
                    Math.hypot(
                        point.x - previous.x,
                        point.y - previous.y
                    ) > 1e-8
                ) {
                    result.push(point);
                }
            }

            if (result.length > 2) {

                var first = result[0];
                var last = result[result.length - 1];

                if (
                    Math.hypot(
                        first.x - last.x,
                        first.y - last.y
                    ) < 1e-8
                ) {
                    result.pop();
                }
            }

            return result;
        }

        function miniEndRegions(points) {

            var regions = [];

            // Left of the gangway opening.
            var left = miniClip(
                points, 0, -miniHalfGauge, false
            );

            left = miniClip(left, 1, 0, true);
            left = miniClip(left, 1, miniOpeningTop, false);

            // Right of the gangway opening.
            var right = miniClip(
                points, 0, miniHalfGauge, true
            );

            right = miniClip(right, 1, 0, true);
            right = miniClip(right, 1, miniOpeningTop, false);

            // Above the gangway opening.
            var above = miniClip(
                points, 1, miniOpeningTop, true
            );

            regions.push(
                miniCleanPolygon(left),
                         miniCleanPolygon(right),
                         miniCleanPolygon(above)
            );

            return regions;
        }

        // --------------------------------------------------------
        // TRIANGULATE END WALL POLYGONS
        // --------------------------------------------------------

        function miniCross(a, b, c) {

            return (
                (b.x - a.x) * (c.y - a.y) -
                (b.y - a.y) * (c.x - a.x)
            );
        }

        function miniTriangulate(points, normalZ) {

            var area = miniPolygonArea(points);

            if (Math.abs(area) < 1e-8) return [];

            var orientation = area > 0 ? 1 : -1;
            var remaining = [];

            for (var i = 0; i < points.length; i++) {
                remaining.push(i);
            }

            var triangles = [];

            while (remaining.length > 3) {

                var foundEar = false;

                for (var i = 0; i < remaining.length; i++) {

                    var ia =
                    remaining[(i + remaining.length - 1) % remaining.length];

                    var ib = remaining[i];

                    var ic =
                    remaining[(i + 1) % remaining.length];

                    var a = points[ia];
                    var b = points[ib];
                    var c = points[ic];

                    if (miniCross(a, b, c) * orientation <= 1e-10) {
                        continue;
                    }

                    var containsPoint = false;

                    for (var j = 0; j < remaining.length; j++) {

                        var ip = remaining[j];

                        if (ip === ia || ip === ib || ip === ic) continue;

                        var p = points[ip];

                        if (
                            miniCross(a, b, p) * orientation > 1e-10 &&
                            miniCross(b, c, p) * orientation > 1e-10 &&
                            miniCross(c, a, p) * orientation > 1e-10
                        ) {
                            containsPoint = true;
                            break;
                        }
                    }

                    if (containsPoint) continue;

                    triangles.push(ia, ib, ic);

                    remaining.splice(i, 1);
                    foundEar = true;
                    break;
                }

                if (!foundEar) {
                    throw new Error("Could not triangulate Jacobs mini-coach end.");
                }
            }

            triangles.push(
                remaining[0],
                remaining[1],
                remaining[2]
            );

            var requiredOrientation = normalZ > 0 ? 1 : -1;

            if (orientation !== requiredOrientation) {

                for (var i = 0; i < triangles.length; i += 3) {

                    var temp = triangles[i + 1];
                    triangles[i + 1] = triangles[i + 2];
                    triangles[i + 2] = temp;
                }
            }

            return triangles;
        }

        // --------------------------------------------------------
        // END WALL TEXTURE BOUNDS
        // --------------------------------------------------------

        var miniMinX = Infinity;
        var miniMaxX = -Infinity;

        var miniMinY = Infinity;
        var miniMaxY = -Infinity;

        for (var point of miniOutline) {

            miniMinX = Math.min(miniMinX, point.x);
            miniMaxX = Math.max(miniMaxX, point.x);

            miniMinY = Math.min(miniMinY, point.y);
            miniMaxY = Math.max(miniMaxY, point.y);
        }

        var miniCentreX = (miniMinX + miniMaxX) * 0.5;
        var miniCentreY = (miniMinY + miniMaxY) * 0.5;

        var miniTextureSize = Math.max(
            miniMaxX - miniMinX,
            miniMaxY - miniMinY,
            1e-8
        );

        miniMinX = miniCentreX - miniTextureSize * 0.5;
        miniMinY = miniCentreY - miniTextureSize * 0.5;

        // --------------------------------------------------------
        // UPLOAD ONE CLIPPED END WALL
        // --------------------------------------------------------

        function miniCreateEndMesh(points, z, normalZ, texture) {

            if (
                points.length < 3 ||
                Math.abs(miniPolygonArea(points)) < 1e-8
            ) {
                return;
            }

            var positions = [];
            var normals = [];
            var uvs = [];

            for (var point of points) {

                positions.push(
                    point.x,
                    point.y + miniFloorY,
                    z
                );

                normals.push(0, 0, normalZ);

                uvs.push(
                    Math.max(
                        0,
                        Math.min(
                            1,
                            (point.x - miniMinX) / miniTextureSize
                        )
                    ),

                    Math.max(
                        0,
                        Math.min(
                            1,
                            1 - (
                                (point.y - miniMinY) / miniTextureSize
                            )
                        )
                    )
                );
            }

            var triangles = miniTriangulate(points, normalZ);

            if (!triangles.length) return;

            var IndexArray = points.length > 65535
            ? Uint32Array
            : Uint16Array;

            var indices = new IndexArray(triangles);

            var mesh = {
                positionBuffer: gl.createBuffer(),
                normalBuffer: gl.createBuffer(),
                uvBuffer: gl.createBuffer(),
                indexBuffer: gl.createBuffer(),
                objectVao: gl.createVertexArray(),

                indexCount: indices.length,

                indexType: indices instanceof Uint32Array
                ? gl.UNSIGNED_INT
                : gl.UNSIGNED_SHORT,

                texture: texture,
                colour: [1, 1, 1, 1],
                transparentColor: null,

                repeatS: false,
                repeatT: false
            };

            if (
                !mesh.positionBuffer ||
                !mesh.normalBuffer ||
                !mesh.uvBuffer ||
                !mesh.indexBuffer ||
                !mesh.objectVao
            ) {
                throw new Error("Could not create Jacobs mini-coach end mesh.");
            }

            gl.bindVertexArray(mesh.objectVao);

            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array(positions),
                          gl.STATIC_DRAW
            );

            gl.enableVertexAttribArray(objectLocations.aPosition);
            gl.vertexAttribPointer(
                objectLocations.aPosition, 3, gl.FLOAT, false, 0, 0
            );

            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array(normals),
                          gl.STATIC_DRAW
            );

            gl.enableVertexAttribArray(objectLocations.aNormal);
            gl.vertexAttribPointer(
                objectLocations.aNormal, 3, gl.FLOAT, false, 0, 0
            );

            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uvBuffer);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array(uvs),
                          gl.STATIC_DRAW
            );

            gl.enableVertexAttribArray(objectLocations.aTexCoord);
            gl.vertexAttribPointer(
                objectLocations.aTexCoord, 2, gl.FLOAT, false, 0, 0
            );

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
            gl.bufferData(
                gl.ELEMENT_ARRAY_BUFFER,
                indices,
                gl.STATIC_DRAW
            );

            gl.bindVertexArray(null);

            trainGangwayMeshes.push(mesh);
        }

        // --------------------------------------------------------
        // CREATE THE THREE OPENING SECTIONS AT BOTH ENDS
        //
        // +Z end: exterior -Z, interior +Z.
        // -Z end: exterior +Z, interior -Z.
        // --------------------------------------------------------

        var outerRegions = miniEndRegions(miniOutline);
        var innerRegions = miniEndRegions(miniInnerOutline);

        for (var i = 0; i < 3; i++) {

            // Front exterior.
            miniCreateEndMesh(
                outerRegions[i],
                halfLength,
                -1,
                trainBetweenTextureOuter
            );

            // Front interior.
            miniCreateEndMesh(
                innerRegions[i],
                halfLength - miniThickness,
                1,
                trainBetweenTextureInner
            );

            // Rear exterior.
            miniCreateEndMesh(
                outerRegions[i],
                -halfLength,
                1,
                trainBetweenTextureOuter
            );

            // Rear interior.
            miniCreateEndMesh(
                innerRegions[i],
                -halfLength + miniThickness,
                -1,
                trainBetweenTextureInner
            );
        }
    }










    // ------------------------------------------------------------
    // COACH FLOORS
    //
    // floorHalfWidth has been calculated from the inner body
    // profile at floor height.
    // ------------------------------------------------------------

    var floorThickness = Math.max(
        0.02,
        Math.min(0.1, bogieHeight * 0.1)
    );

    for (var coachIndex = 0; coachIndex < floorCoachCount; coachIndex++) {

        var frontAdjustment = coachIndex === 0
        ? floorCabOverhang
        : floorNonCabOverhang;

        var rearAdjustment = coachIndex === floorCoachCount - 1
        ? floorCabOverhang
        : floorNonCabOverhang;

        var frontHalfLength = floorCoachLength * 0.5 + frontAdjustment;
        var rearHalfLength = floorCoachLength * 0.5 + rearAdjustment;

        if (frontHalfLength <= 0 || rearHalfLength <= 0) {
            throw new Error("Coach overhang settings produce an invalid floor length.");
        }

        var floorLength = frontHalfLength + rearHalfLength;
        var floorPhysicalWidth = floorHalfWidth * 2;

        // Interior floor with repeating texture.
        var floorTop = createFace([
            -floorHalfWidth, 0, frontHalfLength,
            floorHalfWidth, 0, frontHalfLength,
            floorHalfWidth, 0, -rearHalfLength,
            -floorHalfWidth, 0, -rearHalfLength
        ], [0, 1, 0], misc_3, [
            0, 0,
            floorPhysicalWidth, 0,
            floorPhysicalWidth, floorLength,
            0, floorLength
        ]);

        floorTop.repeatS = true;
        floorTop.repeatT = true;

        var floorBottom = createFace([
            -floorHalfWidth, -floorThickness, -rearHalfLength,
            floorHalfWidth, -floorThickness, -rearHalfLength,
            floorHalfWidth, -floorThickness, frontHalfLength,
            -floorHalfWidth, -floorThickness, frontHalfLength
        ], [0, -1, 0], misc_1);

        trainFloorMeshes.push({
            top: floorTop,
            bottom: floorBottom
        });
    }

    // ------------------------------------------------------------
    // BODY DIMENSIONS
    // ------------------------------------------------------------

    var bodyFloorHeight = Number(train_floor_height);
    var bodyRoofHeight = Number(train_roof_height);
    var bodyHeight = bodyRoofHeight - bodyFloorHeight;

    var bodyDoorTop = Number(train_doortop_percentage);
    var bodyThickness = Number(train_body_thickness);

    var bodyBottomExtension = 0.1;
    var bodyHalfWidth = floorWidth * 0.5;

    if (
        !Number.isFinite(bodyFloorHeight) ||
        !Number.isFinite(bodyRoofHeight) ||
        bodyHeight <= 0 ||
        !Number.isFinite(bodyDoorTop) ||
        bodyDoorTop < 0 ||
        bodyDoorTop > 1 ||
        !Number.isFinite(bodyThickness) ||
        bodyThickness <= 0
    ) {
        throw new Error("Invalid train body dimensions.");
    }

    var bodyDimensions = train_body_dimentions;

    if (!Array.isArray(bodyDimensions) || bodyDimensions.length < 2) {
        throw new Error("Invalid train_body_dimentions.");
    }

    var doorConfigList = Array.isArray(globalThis.traindoors)
    ? globalThis.traindoors
    : [];

    for (var p = 0; p < bodyDimensions.length; p++) {

        var point = bodyDimensions[p];

        if (
            !Array.isArray(point) ||
            point.length < 2 ||
            !Number.isFinite(Number(point[0])) ||
            !Number.isFinite(Number(point[1])) ||
            Number(point[0]) < 0 ||
            Number(point[0]) > 1 ||
            Number(point[1]) < 0 ||
            Number(point[1]) > 1
        ) {
            throw new Error("Invalid train body cross-section point " + p);
        }
    }

    var hasConfiguredDoors = doorConfigList.some(function(door) {
        return Array.isArray(door) && door.length >= 8;
    });

    if (
        hasConfiguredDoors &&
        (!trainDoorTextureOuter || !trainDoorTextureInner)
    ) {
        throw new Error("Train door textures have not been loaded.");
    }

    // ------------------------------------------------------------
    // BODY GEOMETRY
    // ------------------------------------------------------------

    function bodyLocalY(yPercentage) {

        var y = Number(yPercentage) * bodyHeight;

        if (Math.abs(Number(yPercentage)) < 1e-7) {
            y -= bodyBottomExtension;
        }

        return y;
    }

    function bodyTextureU(z) {

        var halfLength = floorCoachLength * 0.5;

        // The normal coach length uses the middle half of the texture.
        // Cab extensions continue at exactly the same UV scale.
        return 0.25 + (
            (z + halfLength) / floorCoachLength
        ) * 0.5;
    }

    function getPanelGeometry(side, pointA, pointB) {

        var x0 = side * pointA.x * bodyHalfWidth;
        var x1 = side * pointB.x * bodyHalfWidth;

        var y0 = bodyLocalY(pointA.y);
        var y1 = bodyLocalY(pointB.y);

        var dx = x1 - x0;
        var dy = y1 - y0;
        var panelLength = Math.hypot(dx, dy);

        if (panelLength < 1e-7) return null;

        var normalX = side * (dy / panelLength);
        var normalY = side * (-dx / panelLength);

        return {
            x0: x0,
            x1: x1,
            y0: y0,
            y1: y1,

            innerX0: x0 - normalX * bodyThickness,
            innerX1: x1 - normalX * bodyThickness,

            innerY0: y0 - normalY * bodyThickness,
            innerY1: y1 - normalY * bodyThickness,

            normalX: normalX,
            normalY: normalY,

            v0: pointA.y,
            v1: pointB.y
        };
    }

    // ------------------------------------------------------------
    // DOOR TOP PROFILE
    // ------------------------------------------------------------

    function findDoorTopProfile() {

        for (var i = 0; i < bodyDimensions.length - 1; i++) {

            var a = {
                x: Number(bodyDimensions[i][0]),
                y: Number(bodyDimensions[i][1])
            };

            var b = {
                x: Number(bodyDimensions[i + 1][0]),
                y: Number(bodyDimensions[i + 1][1])
            };

            var minY = Math.min(a.y, b.y);
            var maxY = Math.max(a.y, b.y);

            if (
                bodyDoorTop < minY - 1e-7 ||
                bodyDoorTop > maxY + 1e-7
            ) {
                continue;
            }

            var t = Math.abs(b.y - a.y) < 1e-7
            ? 0
            : (bodyDoorTop - a.y) / (b.y - a.y);

            return {
                x: a.x + (b.x - a.x) * t,
                y: bodyDoorTop,
                pointA: a,
                pointB: b
            };
        }

        return null;
    }

    var doorTopProfile = findDoorTopProfile();

    // ------------------------------------------------------------
    // SPLIT BODY PANELS AT DOOR TOP
    // ------------------------------------------------------------

    function splitPanelAtDoorTop(pointA, pointB) {

        var a = {
            x: Number(pointA[0]),
            y: Number(pointA[1])
        };

        var b = {
            x: Number(pointB[0]),
            y: Number(pointB[1])
        };

        var aBelow = a.y <= bodyDoorTop + 1e-7;
        var bBelow = b.y <= bodyDoorTop + 1e-7;

        if (aBelow && bBelow) {
            return [{ a: a, b: b, doorEligible: true }];
        }

        if (!aBelow && !bBelow) {
            return [{ a: a, b: b, doorEligible: false }];
        }

        var t = (bodyDoorTop - a.y) / (b.y - a.y);

        var crossingPoint = {
            x: a.x + (b.x - a.x) * t,
            y: bodyDoorTop
        };

        if (aBelow) {
            return [
                { a: a, b: crossingPoint, doorEligible: true },
                { a: crossingPoint, b: b, doorEligible: false }
            ];
        }

        return [
            { a: a, b: crossingPoint, doorEligible: false },
            { a: crossingPoint, b: b, doorEligible: true }
        ];
    }

    // ------------------------------------------------------------
    // DOOR OPENINGS FOR A COACH
    // ------------------------------------------------------------

    function getCoachDoorOpenings(coachIndex, zFront, zRear) {

        var openings = [];

        for (var door of doorConfigList) {

            if (!Array.isArray(door) || door.length < 8) continue;

            var enabled = false;

            if (floorCoachCount === 1) {
                enabled = door[4] === true;
            } else if (coachIndex === 0) {
                enabled = door[1] === true;
            } else if (coachIndex === floorCoachCount - 1) {
                enabled = door[3] === true;
            } else {
                enabled = door[2] === true;
            }

            if (!enabled) continue;

            var doorZ = Number(door[0]);
            var doorWidth = Number(door[5]);
            var doorType = Number(door[6]);
            var doorDirection = Number(door[7]);

            if (
                !Number.isFinite(doorZ) ||
                doorZ < 0 ||
                doorZ > 1 ||
                !Number.isFinite(doorWidth) ||
                doorWidth <= 0 ||
                !Number.isInteger(doorType) ||
                doorType < 0 ||
                doorType > 4 ||
                !Number.isInteger(doorDirection) ||
                doorDirection < 0 ||
                doorDirection > 2
            ) {
                continue;
            }

            if (doorType === 2 && bodyThickness < 0.06) {
                throw new Error(
                    "Inset sliding doors require body thickness of at least 0.06."
                );
            }

            var centreZ = (0.5 - doorZ) * floorCoachLength;

            var openingRearZ = Math.max(
                zRear,
                centreZ - doorWidth * 0.5
            );

            var openingFrontZ = Math.min(
                zFront,
                centreZ + doorWidth * 0.5
            );

            if (openingFrontZ <= openingRearZ) continue;

            openings.push({
                rearZ: openingRearZ,
                frontZ: openingFrontZ,
                centreZ: centreZ,
                width: doorWidth,
                type: doorType,
                direction: doorDirection
            });
        }

        openings.sort(function(a, b) {
            return a.rearZ - b.rearZ;
        });

        return openings;
    }

    // ------------------------------------------------------------
    // SOLID WALL RANGES
    // ------------------------------------------------------------

    function getSolidWallRanges(zFront, zRear, openings) {

        var merged = [];

        for (var opening of openings) {

            var previous = merged[merged.length - 1];

            if (
                previous &&
                opening.rearZ <= previous.frontZ + 1e-7
            ) {
                previous.frontZ = Math.max(
                    previous.frontZ,
                    opening.frontZ
                );
            } else {
                merged.push({
                    rearZ: opening.rearZ,
                    frontZ: opening.frontZ
                });
            }
        }

        var ranges = [];
        var cursor = zRear;

        for (var opening of merged) {

            if (opening.rearZ > cursor + 1e-7) {
                ranges.push({
                    rearZ: cursor,
                    frontZ: opening.rearZ
                });
            }

            cursor = Math.max(cursor, opening.frontZ);
        }

        if (cursor < zFront - 1e-7) {
            ranges.push({
                rearZ: cursor,
                frontZ: zFront
            });
        }

        return ranges;
    }

    // ------------------------------------------------------------
    // CREATE BODY PANEL
    // ------------------------------------------------------------

    function createBodyPanel(
        side,
        pointA,
        pointB,
        range,
        outerMeshes,
        innerMeshes
    ) {

        var g = getPanelGeometry(side, pointA, pointB);
        if (!g) return;

        var uFront = bodyTextureU(range.frontZ);
        var uRear = bodyTextureU(range.rearZ);

        var outerVertices;
        var outerUvs;
        var innerVertices;
        var innerUvs;

        if (side === 1) {

            outerVertices = [
                g.x0, g.y0, range.frontZ,
                g.x0, g.y0, range.rearZ,
                g.x1, g.y1, range.rearZ,
                g.x1, g.y1, range.frontZ
            ];

            outerUvs = [
                uFront, g.v0,
                uRear, g.v0,
                uRear, g.v1,
                uFront, g.v1
            ];

            innerVertices = [
                g.innerX1, g.innerY1, range.frontZ,
                g.innerX1, g.innerY1, range.rearZ,
                g.innerX0, g.innerY0, range.rearZ,
                g.innerX0, g.innerY0, range.frontZ
            ];

            innerUvs = [
                uFront, g.v1,
                uRear, g.v1,
                uRear, g.v0,
                uFront, g.v0
            ];

        } else {

            outerVertices = [
                g.x1, g.y1, range.frontZ,
                g.x1, g.y1, range.rearZ,
                g.x0, g.y0, range.rearZ,
                g.x0, g.y0, range.frontZ
            ];

            outerUvs = [
                uFront, g.v1,
                uRear, g.v1,
                uRear, g.v0,
                uFront, g.v0
            ];

            innerVertices = [
                g.innerX0, g.innerY0, range.frontZ,
                g.innerX0, g.innerY0, range.rearZ,
                g.innerX1, g.innerY1, range.rearZ,
                g.innerX1, g.innerY1, range.frontZ
            ];

            innerUvs = [
                uFront, g.v0,
                uRear, g.v0,
                uRear, g.v1,
                uFront, g.v1
            ];
        }

        outerMeshes.push(
            createFace(
                outerVertices,
                [g.normalX, g.normalY, 0],
                trainBodyTextureOuter,
                outerUvs
            )
        );

        innerMeshes.push(
            createFace(
                innerVertices,
                [-g.normalX, -g.normalY, 0],
                trainBodyTextureInner,
                innerUvs
            )
        );
    }

    // ------------------------------------------------------------
    // STATIC DOOR REVEALS
    // ------------------------------------------------------------

    function createOpeningSideReveal(
        side,
        pointA,
        pointB,
        z,
        normalZ,
        revealMeshes
    ) {

        var g = getPanelGeometry(side, pointA, pointB);
        if (!g) return;

        createDarkReveal([
            g.x0, g.y0, z,
            g.x1, g.y1, z,
            g.innerX1, g.innerY1, z,
            g.innerX0, g.innerY0, z
        ], [0, 0, normalZ], revealMeshes);
    }

    function createOpeningTopReveal(side, opening, revealMeshes) {

        if (!doorTopProfile) return;

        var g = getPanelGeometry(
            side,
            doorTopProfile.pointA,
            doorTopProfile.pointB
        );

        if (!g) return;

        var x = side * doorTopProfile.x * bodyHalfWidth;
        var y = bodyLocalY(doorTopProfile.y);

        var innerX = x - g.normalX * bodyThickness;
        var innerY = y - g.normalY * bodyThickness;

        createDarkReveal([
            x, y, opening.frontZ,
            x, y, opening.rearZ,
            innerX, innerY, opening.rearZ,
            innerX, innerY, opening.frontZ
        ], [-g.normalY, g.normalX, 0], revealMeshes);
    }

    // ------------------------------------------------------------
    // CREATE MOVING DOOR FACE
    // ------------------------------------------------------------

    function createMovingDoorFace(
        leaf,
        vertices,
        faceNormal,
        texture,
        customUvs,
        moveNormal,
        meshGroup
    ) {

        var mesh = createFace(
            vertices,
            faceNormal,
            texture,
            customUvs
        );

        mesh.doorBasePositions = new Float32Array(mesh.positions);
        mesh.doorBaseNormals = new Float32Array(mesh.normals);

        mesh.doorDynamicPositions =
        new Float32Array(mesh.positions.length);

        mesh.doorDynamicNormals =
        new Float32Array(mesh.normals.length);

        mesh.doorMoveNormals = new Float32Array([
            moveNormal[0], moveNormal[1], 0,
            moveNormal[0], moveNormal[1], 0,
            moveNormal[0], moveNormal[1], 0,
            moveNormal[0], moveNormal[1], 0
        ]);

        mesh.doorSide = leaf.side;
        mesh.doorType = leaf.type;

        mesh.doorSlideRate = leaf.type === 4
        ? 0
        : leaf.slideSign * leaf.slideDistance;

        mesh.doorHingeZ = leaf.hingeZ;
        mesh.doorSwingSign = leaf.swingSign;

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            mesh.positions,
            gl.DYNAMIC_DRAW
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            mesh.normals,
            gl.DYNAMIC_DRAW
        );

        meshGroup.push(mesh);
        leaf.meshes.push(mesh);

        return mesh;
    }

    function createMovingDoorReveal(
        leaf,
        vertices,
        faceNormal,
        moveNormal
    ) {

        var mesh = createMovingDoorFace(
            leaf,
            vertices,
            faceNormal,
            null,
            null,
            moveNormal,
            leaf.reveals
        );

        mesh.colour = [0.15, 0.15, 0.15, 1];
        return mesh;
    }

    // ------------------------------------------------------------
    // CREATE DOOR PANEL
    // ------------------------------------------------------------

    function createDoorPanel(
        leaf,
        side,
        pointA,
        pointB,
        zFront,
        zRear
    ) {

        var g = getPanelGeometry(side, pointA, pointB);
        if (!g) return;

        var overlap = 0.02;
        var extraPercentage = overlap / bodyHeight;

        var pointAIsLower =
        Number(pointA.y) <= Number(pointB.y);

        var expandedV0;
        var expandedV1;

        if (pointAIsLower) {
            g.y0 -= overlap;
            g.y1 += overlap;
            expandedV0 = Number(pointA.y) - extraPercentage;
            expandedV1 = Number(pointB.y) + extraPercentage;
        } else {
            g.y0 += overlap;
            g.y1 -= overlap;
            expandedV0 = Number(pointA.y) + extraPercentage;
            expandedV1 = Number(pointB.y) - extraPercentage;
        }

        var dx = g.x1 - g.x0;
        var dy = g.y1 - g.y0;
        var panelLength = Math.hypot(dx, dy);

        if (panelLength < 1e-7) return;

        var normalX = side * (dy / panelLength);
        var normalY = side * (-dx / panelLength);

        var thickness = leaf.thickness;

        var innerX0 = g.x0 - normalX * thickness;
        var innerY0 = g.y0 - normalY * thickness;

        var innerX1 = g.x1 - normalX * thickness;
        var innerY1 = g.y1 - normalY * thickness;

        var openingWidth = leaf.openingFrontZ - leaf.openingRearZ;
        if (openingWidth <= 0) return;

        var uFront = Math.max(
            0,
            Math.min(1, (zFront - leaf.openingRearZ) / openingWidth)
        );

        var uRear = Math.max(
            0,
            Math.min(1, (zRear - leaf.openingRearZ) / openingWidth)
        );

        var v0 = bodyDoorTop <= 0
        ? 0
        : Math.max(0, Math.min(1, expandedV0 / bodyDoorTop));

        var v1 = bodyDoorTop <= 0
        ? 0
        : Math.max(0, Math.min(1, expandedV1 / bodyDoorTop));

        var outerVertices;
        var outerUvs;
        var innerVertices;
        var innerUvs;

        if (side === 1) {

            outerVertices = [
                g.x0, g.y0, zFront,
                g.x0, g.y0, zRear,
                g.x1, g.y1, zRear,
                g.x1, g.y1, zFront
            ];

            outerUvs = [
                uFront, v0,
                uRear, v0,
                uRear, v1,
                uFront, v1
            ];

            innerVertices = [
                innerX1, innerY1, zFront,
                innerX1, innerY1, zRear,
                innerX0, innerY0, zRear,
                innerX0, innerY0, zFront
            ];

            innerUvs = [
                uFront, v1,
                uRear, v1,
                uRear, v0,
                uFront, v0
            ];

        } else {

            outerVertices = [
                g.x1, g.y1, zFront,
                g.x1, g.y1, zRear,
                g.x0, g.y0, zRear,
                g.x0, g.y0, zFront
            ];

            outerUvs = [
                uFront, v1,
                uRear, v1,
                uRear, v0,
                uFront, v0
            ];

            innerVertices = [
                innerX0, innerY0, zFront,
                innerX0, innerY0, zRear,
                innerX1, innerY1, zRear,
                innerX1, innerY1, zFront
            ];

            innerUvs = [
                uFront, v0,
                uRear, v0,
                uRear, v1,
                uFront, v1
            ];
        }

        createMovingDoorFace(
            leaf,
            outerVertices,
            [normalX, normalY, 0],
            trainDoorTextureOuter,
            outerUvs,
            [normalX, normalY],
            leaf.outer
        );

        createMovingDoorFace(
            leaf,
            innerVertices,
            [-normalX, -normalY, 0],
            trainDoorTextureInner,
            innerUvs,
            [normalX, normalY],
            leaf.inner
        );

        createMovingDoorReveal(
            leaf,
            [
                g.x0, g.y0, zFront,
                g.x1, g.y1, zFront,
                innerX1, innerY1, zFront,
                innerX0, innerY0, zFront
            ],
            [0, 0, 1],
            [normalX, normalY]
        );

        createMovingDoorReveal(
            leaf,
            [
                g.x0, g.y0, zRear,
                g.x1, g.y1, zRear,
                innerX1, innerY1, zRear,
                innerX0, innerY0, zRear
            ],
            [0, 0, -1],
            [normalX, normalY]
        );
    }

    // ------------------------------------------------------------
    // MOVING DOOR TOP EDGE
    // ------------------------------------------------------------

    function createDoorTopEdge(leaf, side) {

        if (!doorTopProfile) return;

        var g = getPanelGeometry(
            side,
            doorTopProfile.pointA,
            doorTopProfile.pointB
        );

        if (!g) return;

        var x = side * doorTopProfile.x * bodyHalfWidth;
        var y = bodyLocalY(doorTopProfile.y);

        var innerX = x - g.normalX * leaf.thickness;
        var innerY = y - g.normalY * leaf.thickness;

        createMovingDoorReveal(
            leaf,
            [
                x, y, leaf.frontZ,
                x, y, leaf.rearZ,
                innerX, innerY, leaf.rearZ,
                innerX, innerY, leaf.frontZ
            ],
            [-g.normalY, g.normalX, 0],
            [g.normalX, g.normalY]
        );
    }

    // ------------------------------------------------------------
    // CREATE ONE DOOR LEAF
    // ------------------------------------------------------------

    function createDoorLeaf(side, opening, zRear, zFront, slideSign) {

        var hingeZ = slideSign > 0 ? zRear : zFront;
        var freeEdgeZ = slideSign > 0 ? zFront : zRear;

        if (opening.type === 4) {
            hingeZ = slideSign > 0 ? zFront : zRear;
            freeEdgeZ = slideSign > 0 ? zRear : zFront;
        }

        var swingSign = opening.type === 3
        ? -side * Math.sign(freeEdgeZ - hingeZ)
        : opening.type === 4
        ? side * Math.sign(freeEdgeZ - hingeZ)
        : 0;

        var leaf = {
            side: side,
            type: opening.type,
            direction: opening.direction,

            slideSign: slideSign,

            // Type 3 travels its full width.
            slideDistance: zFront - zRear,

            hingeZ: hingeZ,
            swingSign: swingSign,

            rearZ: zRear,
            frontZ: zFront,

            thickness: opening.type >= 3
            ? 0.1
            : opening.type === 2
            ? 0.06
            : bodyThickness,

            openingRearZ: opening.rearZ,
            openingFrontZ: opening.frontZ,

            outer: [],
            inner: [],
            reveals: [],
            meshes: []
        };

        for (
            var panelIndex = 0;
        panelIndex < bodyDimensions.length - 1;
        panelIndex++
        ) {

            var parts = splitPanelAtDoorTop(
                bodyDimensions[panelIndex],
                bodyDimensions[panelIndex + 1]
            );

            for (var part of parts) {

                if (!part.doorEligible) continue;

                createDoorPanel(
                    leaf,
                    side,
                    part.a,
                    part.b,
                    leaf.frontZ,
                    leaf.rearZ
                );
            }
        }

        createDoorTopEdge(leaf, side);

        leaf.outer = mergeMeshGroup(leaf.outer, true);
        leaf.inner = mergeMeshGroup(leaf.inner, true);
        leaf.reveals = mergeMeshGroup(leaf.reveals, true);

        leaf.meshes = leaf.outer.concat(
            leaf.inner,
            leaf.reveals
        );

        return leaf;
    }

    // ------------------------------------------------------------
    // CREATE DOOR LEAVES FOR AN OPENING
    // ------------------------------------------------------------

    function createDoorLeavesForOpening(side, opening, targetLeaves) {

        if (opening.frontZ <= opening.rearZ) return;

        var centreZ = (opening.frontZ + opening.rearZ) * 0.5;

        if (opening.direction === 2) {

            targetLeaves.push(
                createDoorLeaf(
                    side,
                    opening,
                    opening.rearZ,
                    centreZ,
                    -1
                )
            );

            targetLeaves.push(
                createDoorLeaf(
                    side,
                    opening,
                    centreZ,
                    opening.frontZ,
                    1
                )
            );

        } else {

            var slideSign = opening.direction === 0 ? 1 : -1;

            targetLeaves.push(
                createDoorLeaf(
                    side,
                    opening,
                    opening.rearZ,
                    opening.frontZ,
                    slideSign
                )
            );
        }
    }

    // ------------------------------------------------------------
    // BUILD COACHES
    // ------------------------------------------------------------

    for (var coachIndex = 0; coachIndex < floorCoachCount; coachIndex++) {

        var frontAdjustment = coachIndex === 0
        ? floorCabOverhang
        : floorNonCabOverhang;

        var rearAdjustment = coachIndex === floorCoachCount - 1
        ? floorCabOverhang
        : floorNonCabOverhang;

        var zFront = floorCoachLength * 0.5 + frontAdjustment;
        var zRear = -(floorCoachLength * 0.5 + rearAdjustment);

        var bodyOuterMeshes = [];
        var bodyInnerMeshes = [];
        var bodyRevealMeshes = [];
        var bodyDoorLeaves = [];
        var doorPanelInformation = [];

        // Additional small patches used only to cover NPC door holes.
        var npcDoorFillOuter = [];
        var npcDoorFillInner = [];

        var coachDoorOpenings = getCoachDoorOpenings(
            coachIndex,
            zFront,
            zRear
        );

        var solidWallRanges = getSolidWallRanges(
            zFront,
            zRear,
            coachDoorOpenings
        );

        // --------------------------------------------------------
        // NPC DOOR FILL PANELS
        //
        // Fill only the openings, rather than building a second
        // complete coach body.
        // --------------------------------------------------------

        var npcDoorFillRanges = [];

        for (var opening of coachDoorOpenings) {

            var previous = npcDoorFillRanges[
                npcDoorFillRanges.length - 1
            ];

            if (
                previous &&
                opening.rearZ <= previous.frontZ + 1e-7
            ) {
                previous.frontZ = Math.max(
                    previous.frontZ,
                    opening.frontZ
                );
            } else {
                npcDoorFillRanges.push({
                    rearZ: opening.rearZ,
                    frontZ: opening.frontZ
                });
            }
        }

        for (var sideIndex = 0; sideIndex < 2; sideIndex++) {

            var side = sideIndex === 0 ? 1 : -1;

            for (
                var panelIndex = 0;
            panelIndex < bodyDimensions.length - 1;
            panelIndex++
            ) {

                var parts = splitPanelAtDoorTop(
                    bodyDimensions[panelIndex],
                    bodyDimensions[panelIndex + 1]
                );

                for (var part of parts) {

                    if (!part.doorEligible) continue;

                    for (var range of npcDoorFillRanges) {

                        createBodyPanel(
                            side,
                            part.a,
                            part.b,
                            range,
                            npcDoorFillOuter,
                            npcDoorFillInner
                        );
                    }
                }
            }
        }

        // --------------------------------------------------------
        // PLAYER BODY PANELS AND DOORS
        // --------------------------------------------------------

        for (var sideIndex = 0; sideIndex < 2; sideIndex++) {

            var side = sideIndex === 0 ? 1 : -1;

            for (
                var panelIndex = 0;
            panelIndex < bodyDimensions.length - 1;
            panelIndex++
            ) {

                var parts = splitPanelAtDoorTop(
                    bodyDimensions[panelIndex],
                    bodyDimensions[panelIndex + 1]
                );

                for (var part of parts) {

                    var ranges = part.doorEligible
                    ? solidWallRanges
                    : [{ rearZ: zRear, frontZ: zFront }];

                    doorPanelInformation.push({
                        side: side,
                        panelIndex: panelIndex,
                        eligible: part.doorEligible,
                        openings: part.doorEligible
                        ? coachDoorOpenings
                        : []
                    });

                    for (var range of ranges) {
                        createBodyPanel(
                            side,
                            part.a,
                            part.b,
                            range,
                            bodyOuterMeshes,
                            bodyInnerMeshes
                        );
                    }

                    if (part.doorEligible) {

                        for (var opening of coachDoorOpenings) {

                            createOpeningSideReveal(
                                side,
                                part.a,
                                part.b,
                                opening.frontZ,
                                1,
                                bodyRevealMeshes
                            );

                            createOpeningSideReveal(
                                side,
                                part.a,
                                part.b,
                                opening.rearZ,
                                -1,
                                bodyRevealMeshes
                            );
                        }
                    }
                }
            }

            for (var opening of coachDoorOpenings) {

                createOpeningTopReveal(
                    side,
                    opening,
                    bodyRevealMeshes
                );

                createDoorLeavesForOpening(
                    side,
                    opening,
                    bodyDoorLeaves
                );
            }
        }

        // --------------------------------------------------------
        // COMBINE ALL DOORS ON THIS COACH
        // --------------------------------------------------------

        var allDoorOuter = [];
        var allDoorInner = [];
        var allDoorReveals = [];

        for (var leaf of bodyDoorLeaves) {

            var slideRate = leaf.slideSign * leaf.slideDistance;

            for (var mesh of leaf.outer) {
                mesh.doorSide = leaf.side;
                mesh.doorType = leaf.type;
                mesh.doorSlideRate = slideRate;
                allDoorOuter.push(mesh);
            }

            for (var mesh of leaf.inner) {
                mesh.doorSide = leaf.side;
                mesh.doorType = leaf.type;
                mesh.doorSlideRate = slideRate;
                allDoorInner.push(mesh);
            }

            for (var mesh of leaf.reveals) {
                mesh.doorSide = leaf.side;
                mesh.doorType = leaf.type;
                mesh.doorSlideRate = slideRate;
                allDoorReveals.push(mesh);
            }
        }

        var movingDoorOuter = mergeMeshGroup(allDoorOuter, true);
        var movingDoorInner = mergeMeshGroup(allDoorInner, true);
        var movingDoorReveals = mergeMeshGroup(allDoorReveals, true);

        // --------------------------------------------------------
        // COMBINE STATIC BODY AND NPC DOOR PATCHES
        // --------------------------------------------------------

        bodyOuterMeshes = mergeMeshGroup(bodyOuterMeshes, false);
        bodyInnerMeshes = mergeMeshGroup(bodyInnerMeshes, false);
        bodyRevealMeshes = mergeMeshGroup(bodyRevealMeshes, false);

        npcDoorFillOuter = mergeMeshGroup(npcDoorFillOuter, false);
        npcDoorFillInner = mergeMeshGroup(npcDoorFillInner, false);

        trainBodyMeshes.push({
            outer: bodyOuterMeshes,
            inner: bodyInnerMeshes,
            doorReveals: bodyRevealMeshes,

            npcDoorFillOuter: npcDoorFillOuter,
            npcDoorFillInner: npcDoorFillInner,

            movingDoorOuter: movingDoorOuter,
            movingDoorInner: movingDoorInner,
            movingDoorReveals: movingDoorReveals,

            endGangwayMeshes: [],

            doorPanels: doorPanelInformation,
            doorOpenings: coachDoorOpenings
        });

        // Coach-end gangways are created by build_train_end_faces().
        // Do not create duplicate end gangway geometry here.
    }

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    var bodyMeshCount = 0;
    var doorMeshCount = 0;
    var npcFillMeshCount = 0;

    for (var body of trainBodyMeshes) {

        bodyMeshCount +=
        body.outer.length +
        body.inner.length +
        body.doorReveals.length;

        doorMeshCount +=
        body.movingDoorOuter.length +
        body.movingDoorInner.length +
        body.movingDoorReveals.length;

        npcFillMeshCount +=
        body.npcDoorFillOuter.length +
        body.npcDoorFillInner.length;
    }

    console.log(
        "Train mesh batching complete:",
        bodyMeshCount,
        "static body meshes;",
        doorMeshCount,
        "moving door meshes;",
        npcFillMeshCount,
        "NPC door-fill meshes;",
        trainFloorMeshes.length * 2,
        "floor meshes."
    );

    build_train_end_faces();
}


/////////////////// todo end


function position_train_components() {

    trainComponentPlacements = [];
    trainFloorPlacements = [];

    var railVerticalOffset = Number(RAIL_VERTICAL_OFFSET);
    var railHeight = Number(RAIL_HEIGHT);
    var floorHeight = Number(train_floor_height);

    if (!Number.isFinite(railVerticalOffset)) railVerticalOffset = 0;
    if (!Number.isFinite(railHeight)) railHeight = 0;
    if (!Number.isFinite(floorHeight)) floorHeight = 0;

    function positionBogieSet(bogieList, angleList) {

        if (
            !Array.isArray(bogieList) ||
            !Array.isArray(angleList)
        ) {
            return;
        }

        for (var i = 0; i < bogieList.length; i++) {

            var bogie = bogieList[i];
            var angle = angleList[i];

            if (
                !bogie ||
                bogie[0] === null ||
                bogie[2] === null ||
                bogie[3] === null ||
                angle === null
            ) {
                continue;
            }

            var distance = Number(bogie[0]);
            var lateralOffset = Number(bogie[2]);
            var trackY = Number(bogie[3]);
            var bogieAngle = Number(angle);

            if (
                !Number.isFinite(distance) ||
                !Number.isFinite(lateralOffset) ||
                !Number.isFinite(trackY) ||
                !Number.isFinite(bogieAngle)
            ) {
                continue;
            }

            var sample = sampleAt(distance, false);

            if (!sample) continue;

            var point = worldPoint(
                sample,
                lateralOffset,
                0
            );

            if (
                !point ||
                !Number.isFinite(Number(point.x)) ||
                !Number.isFinite(Number(point.z)) ||
                !Number.isFinite(Number(sample.heading))
            ) {
                continue;
            }

            trainComponentPlacements.push({

                x: Number(point.x),

                                          y: trackY +
                                          railVerticalOffset +
                                          railHeight,

                                          z: Number(point.z),

                                          yaw: Number(sample.heading) + bogieAngle,

                                          distance: distance,

                                          gangway: (
                                              Jacobs_bogies === true &&
                                              i > 0 &&
                                              i < bogieList.length - 1
                                          )
            });
        }
    }

    // PLAYER TRAIN
    positionBogieSet(
        bogies,
        bogies_angle
    );

    // NPC TRAIN
    positionBogieSet(
        bogies_npc,
        bogies_angle_npc
    );

    // ------------------------------------------------------------
    // POSITION COACH FLOORS
    //
    // Also identifies NPC coach placements so their door meshes
    // can be skipped and their static door-fill patches drawn.
    // ------------------------------------------------------------

    function positionCoachFloorSet(coachList) {

        if (!Array.isArray(coachList)) return;

        for (var i = 0; i < coachList.length; i++) {

            var coach = coachList[i];

            if (
                !Array.isArray(coach) ||
                coach.length < 8
            ) {
                continue;
            }

            var centreX = Number(coach[4]);
            var centreTrackY = Number(coach[3]);
            var centreZ = Number(coach[5]);

            var pitch = Number(coach[6]);
            var yaw = Number(coach[7]);

            var distance = Number(coach[1]);

            if (
                !Number.isFinite(centreX) ||
                !Number.isFinite(centreTrackY) ||
                !Number.isFinite(centreZ) ||
                !Number.isFinite(pitch) ||
                !Number.isFinite(yaw) ||
                !Number.isFinite(distance)
            ) {
                continue;
            }

            trainFloorPlacements.push({

                coachIndex: i,

                isNpc: coachList === coach_positions_npc,

                x: centreX,

                y: centreTrackY +
                railVerticalOffset +
                railHeight +
                floorHeight,

                z: centreZ,

                yaw: yaw,
                pitch: pitch,

                distance: distance
            });
        }
    }

    // PLAYER TRAIN FLOORS
    positionCoachFloorSet(coach_positions);

    // NPC TRAIN FLOORS
    positionCoachFloorSet(coach_positions_npc);
}







/////////////////////// todo






function draw_train_components(startDistance, endDistance, cam, basis) {

    if (
        (!trainComponentMeshes.length || !trainComponentPlacements.length) &&
        (!trainFloorPlacements.length || (
            !trainFloorMeshes.length && !trainBodyMeshes.length
        ))
    ) {
        return;
    }

    ensureObjectRenderer();

    var oldBlend = gl.isEnabled(gl.BLEND);
    var oldCull = gl.isEnabled(gl.CULL_FACE);
    var oldDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);

    var oldCullFace = gl.getParameter(gl.CULL_FACE_MODE);
    var oldFrontFace = gl.getParameter(gl.FRONT_FACE);

    var oldBlendSrcRGB = gl.getParameter(gl.BLEND_SRC_RGB);
    var oldBlendDstRGB = gl.getParameter(gl.BLEND_DST_RGB);
    var oldBlendSrcAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA);
    var oldBlendDstAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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

    gl.activeTexture(gl.TEXTURE0);

    // ------------------------------------------------------------
    // VISIBLE BOGIES
    // ------------------------------------------------------------

    var placements = [];

    for (var p of trainComponentPlacements) {

        if (
            p.distance >= startDistance &&
            p.distance <= endDistance
        ) {
            placements.push(p);
        }
    }

    placements.sort(function(a, b) {

        var depthA =
        (a.x - cam.x) * basis.fx +
        (a.y - cam.y) * basis.fy +
        (a.z - cam.z) * basis.fz;

        var depthB =
        (b.x - cam.x) * basis.fx +
        (b.y - cam.y) * basis.fy +
        (b.z - cam.z) * basis.fz;

        return depthB - depthA;
    });

    // ------------------------------------------------------------
    // VISIBLE COACHES
    // ------------------------------------------------------------

    var floorPlacements = [];

    for (var p of trainFloorPlacements) {

        if (
            p.distance >= startDistance &&
            p.distance <= endDistance
        ) {
            floorPlacements.push(p);
        }
    }

    floorPlacements.sort(function(a, b) {

        var depthA =
        (a.x - cam.x) * basis.fx +
        (a.y - cam.y) * basis.fy +
        (a.z - cam.z) * basis.fz;

        var depthB =
        (b.x - cam.x) * basis.fx +
        (b.y - cam.y) * basis.fy +
        (b.z - cam.z) * basis.fz;

        return depthB - depthA;
    });

    // ------------------------------------------------------------
    // DRAW A MESH
    // ------------------------------------------------------------

    function drawMesh(mesh) {

        if (!mesh || !mesh.objectVao || !mesh.indexCount) return;

        gl.bindTexture(gl.TEXTURE_2D, mesh.texture);

        gl.uniform1i(
            objectLocations.uHasTexture,
            mesh.texture ? 1 : 0
        );

        gl.uniform4fv(
            objectLocations.uColour,
            mesh.colour || [1, 1, 1, 1]
        );

        gl.uniform1i(
            objectLocations.uUseTransparentColor,
            mesh.transparentColor ? 1 : 0
        );

        gl.uniform3fv(
            objectLocations.uTransparentColor,
            mesh.transparentColor || [0, 0, 0]
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

    // ------------------------------------------------------------
    // MODEL TRANSFORM
    // ------------------------------------------------------------

    function setModelTransform(x, y, z, yaw, pitch, roll) {

        gl.uniform3f(
            objectLocations.uModelPosition,
            x, y, z
        );

        gl.uniform1f(objectLocations.uYaw, yaw);
        gl.uniform1f(objectLocations.uPitch, pitch);
        gl.uniform1f(objectLocations.uRoll, roll);
    }

    // ------------------------------------------------------------
    // UPDATE A COMBINED DOOR MESH
    // ------------------------------------------------------------

    // ------------------------------------------------------------
    // UPDATE A COMBINED DOOR MESH
    // ------------------------------------------------------------

    function updateDoorBatch(mesh, leftProgress, rightProgress) {

        if (!mesh || !mesh.doorBasePositions) return;

        if (
            mesh.lastLeft === leftProgress &&
            mesh.lastRight === rightProgress
        ) {
            return;
        }

        var base = mesh.doorBasePositions;
        var normals = mesh.doorMoveNormals;

        var sides = mesh.doorSides;
        var types = mesh.doorTypes;
        var slides = mesh.doorSlideRates;

        var hinges = mesh.doorHingeZs;
        var swingSigns = mesh.doorSwingSigns;

        var baseNormals = mesh.doorBaseNormals || mesh.normals;
        var updatedNormals = mesh.doorDynamicNormals;
        var updated = mesh.doorDynamicPositions;

        if (
            !normals ||
            !sides ||
            !types ||
            !slides ||
            !updated
        ) {
            return;
        }

        var bodyThickness = Number(train_body_thickness);

        for (var i = 0, v = 0; i < base.length; i += 3, v++) {

            var progress = sides[v] === -1
            ? leftProgress
            : rightProgress;

            var type = types[v];

            // --------------------------------------------------------
            // SWING DOORS: TYPE 3 AND TYPE 4
            // --------------------------------------------------------

            if (type === 3 || type === 4) {

                var angle = (swingSigns ? swingSigns[v] : 0) *
                progress * (Math.PI * 0.5);

                var cosAngle = Math.cos(angle);
                var sinAngle = Math.sin(angle);

                var hingeZ = hinges
                ? hinges[v]
                : base[i + 2];

                var distanceFromHinge = base[i + 2] - hingeZ;

                updated[i] =
                base[i] + distanceFromHinge * sinAngle;

                updated[i + 1] = base[i + 1];

                updated[i + 2] =
                hingeZ +
                distanceFromHinge * cosAngle +
                (type === 3 ? slides[v] * progress : 0);

                // Rotate the normals with the door.
                if (updatedNormals && baseNormals) {

                    updatedNormals[i] =
                    baseNormals[i] * cosAngle +
                    baseNormals[i + 2] * sinAngle;

                    updatedNormals[i + 1] =
                    baseNormals[i + 1];

                    updatedNormals[i + 2] =
                    -baseNormals[i] * sinAngle +
                    baseNormals[i + 2] * cosAngle;
                }

            } else {

                // ----------------------------------------------------
                // EXISTING DOOR TYPES 0, 1 AND 2
                // ----------------------------------------------------

                var offset;

                if (type === 0) {

                    // Gradually move the door outward over the first
                    // 0.1 of its opening progress.
                    //
                    // At progress 0:       0 outward movement.
                    // At progress 0.05:    half body thickness.
                    // At progress 0.1:    full body thickness.
                    // Above progress 0.1: remains fully outside.
                    //
                    // The Z sliding animation is unchanged.

                    offset = bodyThickness *
                    Math.min(1, progress / 0.1);

                } else if (type === 1) {

                    offset = bodyThickness;

                } else {

                    offset = -(bodyThickness - 0.06) * 0.5;
                }

                updated[i] =
                base[i] + normals[i] * offset;

                updated[i + 1] =
                base[i + 1] + normals[i + 1] * offset;

                // Keep the existing sliding animation unchanged.
                updated[i + 2] =
                base[i + 2] + slides[v] * progress;

                if (updatedNormals && baseNormals) {
                    updatedNormals[i] = baseNormals[i];
                    updatedNormals[i + 1] = baseNormals[i + 1];
                    updatedNormals[i + 2] = baseNormals[i + 2];
                }
            }
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, updated);

        if (updatedNormals) {
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, updatedNormals);
        }

        mesh.lastLeft = leftProgress;
        mesh.lastRight = rightProgress;
    }

    // ------------------------------------------------------------
    // UPDATE PLAYER DOOR POSITIONS
    //
    // NPC coaches are skipped because they have no moving doors.
    // ------------------------------------------------------------

    var leftProgress = Math.max(
        0,
        Math.min(1, Number(left_doors) || 0)
    );

    var rightProgress = Math.max(
        0,
        Math.min(1, Number(right_doors) || 0)
    );

    for (var floorPlacement of floorPlacements) {

        if (floorPlacement.isNpc) continue;

        var bodySet = trainBodyMeshes[floorPlacement.coachIndex];

        if (!bodySet) continue;

        updateDoorBatch(
            bodySet.movingDoorOuter[0],
            leftProgress,
            rightProgress
        );

        updateDoorBatch(
            bodySet.movingDoorInner[0],
            leftProgress,
            rightProgress
        );

        updateDoorBatch(
            bodySet.movingDoorReveals[0],
            leftProgress,
            rightProgress
        );
    }

    // ------------------------------------------------------------
    // DRAW
    // ------------------------------------------------------------

    try {

        for (var alphaPass = 0; alphaPass < 2; alphaPass++) {

            gl.depthMask(alphaPass === 0);

            gl.uniform1i(
                objectLocations.uAlphaPass,
                alphaPass
            );

            // ----------------------------------------------------
            // BOGIES AND EXISTING JACOBS GANGWAYS
            // ----------------------------------------------------

            for (var placement of placements) {

                setModelTransform(
                    placement.x,
                    placement.y,
                    placement.z,
                    placement.yaw,
                    0,
                    0
                );

                for (var mesh of trainComponentMeshes) {
                    drawMesh(mesh);
                }

                // Original Jacobs gangway system.
                if (placement.gangway) {

                    for (var mesh of trainGangwayMeshes) {
                        drawMesh(mesh);
                    }
                }
            }

            // ----------------------------------------------------
            // COACHES
            // ----------------------------------------------------

            for (var floorPlacement of floorPlacements) {

                var coachIndex = floorPlacement.coachIndex;

                setModelTransform(
                    floorPlacement.x,
                    floorPlacement.y,
                    floorPlacement.z,
                    floorPlacement.yaw,
                    floorPlacement.pitch,
                    0
                );

                var bodySet = trainBodyMeshes[coachIndex];

                if (bodySet) {

                    var npcCoach = floorPlacement.isNpc === true;

                    // --------------------------------------------
                    // BODY EXTERIOR AND INTERIOR SIDE PANELS
                    // --------------------------------------------

                    gl.enable(gl.CULL_FACE);
                    gl.frontFace(gl.CCW);
                    gl.cullFace(gl.FRONT);

                    for (var mesh of bodySet.outer) {
                        drawMesh(mesh);
                    }

                    for (var mesh of bodySet.inner) {
                        drawMesh(mesh);
                    }

                    // --------------------------------------------
                    // NPC DOOR FILL PANELS
                    //
                    // Draw only the small patches which cover the
                    // openings in the normal player body panels.
                    // --------------------------------------------

                    if (npcCoach) {

                        for (var mesh of bodySet.npcDoorFillOuter || []) {
                            drawMesh(mesh);
                        }

                        for (var mesh of bodySet.npcDoorFillInner || []) {
                            drawMesh(mesh);
                        }

                    } else {

                        // ----------------------------------------
                        // STATIC DOOR REVEALS
                        // ----------------------------------------

                        gl.disable(gl.CULL_FACE);

                        for (var mesh of bodySet.doorReveals) {
                            drawMesh(mesh);
                        }

                        // ----------------------------------------
                        // MOVING DOOR FACES
                        // ----------------------------------------

                        gl.enable(gl.CULL_FACE);
                        gl.frontFace(gl.CCW);
                        gl.cullFace(gl.FRONT);

                        for (var mesh of bodySet.movingDoorOuter) {
                            drawMesh(mesh);
                        }

                        for (var mesh of bodySet.movingDoorInner) {
                            drawMesh(mesh);
                        }

                        // ----------------------------------------
                        // MOVING DOOR EDGES
                        // ----------------------------------------

                        gl.disable(gl.CULL_FACE);

                        for (var mesh of bodySet.movingDoorReveals) {
                            drawMesh(mesh);
                        }
                    }

                    // --------------------------------------------
                    // COACH END FACES
                    // --------------------------------------------

                    gl.enable(gl.CULL_FACE);
                    gl.frontFace(gl.CCW);
                    gl.cullFace(gl.BACK);

                    for (var mesh of bodySet.endOuter || []) {
                        drawMesh(mesh);
                    }

                    for (var mesh of bodySet.endInner || []) {
                        drawMesh(mesh);
                    }

                    // --------------------------------------------
                    // NEW COACH-END GANGWAYS
                    // Draw two-sided.
                    // --------------------------------------------

                    gl.disable(gl.CULL_FACE);

                    for (var mesh of bodySet.endGangwayMeshes || []) {
                        drawMesh(mesh);
                    }
                }

                // ------------------------------------------------
                // COACH FLOOR
                // ------------------------------------------------

                var floorSet = trainFloorMeshes[coachIndex];

                if (floorSet) {
                    drawMesh(floorSet.top);
                    drawMesh(floorSet.bottom);
                }
            }
        }

    } finally {

        // --------------------------------------------------------
        // RESTORE WEBGL STATE
        // --------------------------------------------------------

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

        gl.uniform3f(objectLocations.uModelPosition, 0, 0, 0);
        gl.uniform1f(objectLocations.uYaw, 0);
        gl.uniform1f(objectLocations.uPitch, 0);
        gl.uniform1f(objectLocations.uRoll, 0);
        gl.uniform1i(objectLocations.uAlphaPass, 0);
    }
}













































///////////// todo end





function render() {
    var last_time = the_time;
    the_time = Date.now()
    fps = fps = (1000 / (the_time - last_time));
    if (status_inuse){if (status_time < (the_time - 1000)){status_inuse = false;sstatusElement.style.display = 'none';}}

    if (!renderLoopRunning) {
        renderAnimationFrameId = null;
        return;
    }
    if (cameraArrowKeys.b)  pos += (400/fps);
    if (cameraArrowKeys.n)  pos -= (400/fps);

    ////////////////// speed calculations go here

    if (crashed){
        //todo
    }

    ////////////////////////////////////////////////////    NPC TRAIN CONTROL
    speed_npc += (accel_npc / fps);
    if (speed_npc > upper_speed_limit_npc){speed_npc = upper_speed_limit_npc}
    if (speed_npc < lower_speed_limit_npc){speed_npc = upper_speed_limit_npc}
    pos_npc += (speed_npc / fps);   ///  todo
    if (cameraArrowKeys.dot)  pos_npc -= (100/fps);
    if (cameraArrowKeys.commar)  pos_npc += (100/fps);
    if ((pos_npc - train_length) < current_route_items_routing_npc[0][0]){pos_npc = (current_route_items_routing_npc[0][0] + train_length); speed_npc = 0; accel_npc = 0}
    if (pos_npc > current_route_items_routing_npc[current_route_items_routing_npc.length-1][0]){pos_npc = current_route_items_routing_npc[current_route_items_routing_npc.length-1][0]; speed_npc = 0; accel_npc = 0}




    // Run once on the first frame
    if (first_run) {
        first_run = false;

        if (Number(pos) - train_length < Number(current_route_items_detailed[0][1])) {
            pos = Number(current_route_items_detailed[0][1]) + train_length + 1;
        }
        if (Number(pos) > Number(current_route_items_detailed[current_route_items_detailed.length - 1][1])) {
            pos = Number(current_route_items_detailed[current_route_items_detailed.length - 1][1]) - 1;
        }

        if (activeRoute && activeRoute.scripts &&
            typeof activeRoute.scripts.onFirstFrame === "function") {
            activeRoute.scripts.onFirstFrame();
            }
    }

    // Run on every frame

    if (activeRoute && activeRoute.scripts &&
        typeof activeRoute.scripts.onEveryFrame === "function") {
        activeRoute.scripts.onEveryFrame();
        }




        // ============================================================
        // TRAIN DOOR ANIMATION
        //
        // Mode 0  = Shut.
        // Mode 1  = Opening.
        // Mode 2  = Fully open.
        // Negative = Waiting until the closing timestamp.
        // Mode 4  = Closing.
        //
        // Negative mode stores the closing timestamp in milliseconds:
        // mode = -timestamp
        //
        // door_speed = seconds to open or close.
        // door_alarm = seconds to wait before closing.
        // ============================================================

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

        var doorMovement = doorDeltaTime / doorSpeedSeconds;


        // ============================================================
        // LEFT DOORS
        // ============================================================

        // MODE 1: OPENING
        if (left_doors_mode === 1) {

            left_doors = Math.min(
                1,
                Math.max(0, Number(left_doors) || 0) + doorMovement
            );

            if (left_doors >= 1) {

                left_doors = 1;
                left_doors_mode = 2;
            }
        }

        // MODE 2: FULLY OPEN
        else if (left_doors_mode === 2) {

            left_doors = 1;


        }

        // NEGATIVE MODE: WAITING TO CLOSE
        else if (left_doors_mode < 0) {

            left_doors = 1;

            if (the_time >= (0 - left_doors_mode)) {
                left_doors_mode = 4;
            }
        }

        // MODE 4: CLOSING
        else if (left_doors_mode === 4) {

            left_doors = Math.max(
                0,
                (Number(left_doors) || 0) - doorMovement
            );

            if (left_doors <= 0) {

                left_doors = 0;
                left_doors_mode = 0;
            }
        }

        // MODE 0: SHUT
        else if (left_doors_mode === 0) {

            left_doors = 0;
        }


        // ============================================================
        // RIGHT DOORS
        // ============================================================

        // MODE 1: OPENING
        if (right_doors_mode === 1) {

            right_doors = Math.min(
                1,
                Math.max(0, Number(right_doors) || 0) + doorMovement
            );

            if (right_doors >= 1) {

                right_doors = 1;
                right_doors_mode = 2;
            }
        }

        // MODE 2: FULLY OPEN
        else if (right_doors_mode === 2) {

            right_doors = 1;


        }

        // NEGATIVE MODE: WAITING TO CLOSE
        else if (right_doors_mode < 0) {

            right_doors = 1;

            if (the_time >= (0 - right_doors_mode)) {
                right_doors_mode = 4;
            }
        }

        // MODE 4: CLOSING
        else if (right_doors_mode === 4) {

            right_doors = Math.max(
                0,
                (Number(right_doors) || 0) - doorMovement
            );

            if (right_doors <= 0) {

                right_doors = 0;
                right_doors_mode = 0;
            }
        }

        // MODE 0: SHUT
        else if (right_doors_mode === 0) {

            right_doors = 0;
        }






        ////////////////////////////////// calculations go here

        set_bogie_positions();
    position_train_components();

    gl.clearColor(...BACKGROUND_RGB, 1.0);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!route || !routeMesh) return;

    // ============================================================
    // CAMERA ARROW KEY MOVEMENT
    // A quarter turn (90 degrees) per second.
    // ============================================================

    if (!lock_mouse && fps > 0 && Number.isFinite(fps)) {
        var cameraTurn = (Math.PI / 2) / fps;

        if (cameraArrowKeys.left)  lookx -= cameraTurn;
        if (cameraArrowKeys.right) lookx += cameraTurn;
        if (cameraArrowKeys.up)    looky += cameraTurn;
        if (cameraArrowKeys.down)  looky -= cameraTurn;

    }

    if (camera_view < 7) {
        if (camera_view < 2) {
            if (lookx > 0.5) { lookx = 0.5; }
            if (lookx < -0.5) { lookx = -0.5; }
            if (looky > 0.4) { looky = 0.4; }
            if (looky < -0.4) { looky = -0.4; }
        } else {
            if (lookx > 4) { lookx -= (Math.PI * 2); }
            if (lookx < -4) { lookx += (Math.PI * 2); }
            if (looky > 0.9) { looky = 0.9; }
            if (looky < -0.9) { looky = -0.9; }
        }
    }

    // ============================================================
    // CAMERA ATTACHMENT
    // ============================================================

    var coachIndex = 0;
    var forwardOffset = 0;
    var sideOffset = 0;
    var heightOffset = EYE_HEIGHT;

    var middleCoachIndex = Math.floor((coach_positions.length - 1) / 2);

    // Distance from coach centre to cab.
    if (cab_overhang < 0){var cabOffset = coachlength / 2 + 0}else{var cabOffset = coachlength / 2 + cab_overhang}


    // CAMERA 0 - REAR CAB, LOOKING BACKWARDS
    if (camera_view === 0) {
        coachIndex = coach_positions.length - 1;
        forwardOffset = 0 - cabOffset;
        sideOffset = 0 - cameraXOffset;
    }

    // CAMERA 1 - FRONT CAB
    if (camera_view === 1) {
        coachIndex = 0;
        forwardOffset = cabOffset;
        sideOffset = cameraXOffset;
    }

    // CAMERA 2 - HEADS OUT
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

    // CAMERA 3 - LEFT SIDE, FRONT / MIDDLE / REAR COACH
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

    // CAMERA 4 - RIGHT SIDE, FRONT / MIDDLE / REAR COACH
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

    // CAMERA 5 - IN FRONT OF FRONT COACH
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

    // CAMERA 6 - ABOVE TRAIN, FRONT / REAR
    if (camera_view === 6) {
        heightOffset = EYE_HEIGHT + 6;

        if (camera_subview === 0) {
            coachIndex = 0;
        } else if (camera_subview === 1) {
            coachIndex = coach_positions.length - 1;
        }
    }

    // CAMERA 7 - BEHIND REAR COACH
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

    // CAMERA 8 - PASSING VIEW (NOT IMPLEMENTED)
    // CAMERA 9 - PASSENGER VIEW (NOT IMPLEMENTED)

    // ============================================================
    // GET COACH POSITION AND APPLY CAMERA OFFSETS
    // ============================================================

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

        // These are the same angles used to render the coach.
        cameraCoachYaw = Number.isFinite(Number(coach[7]))
        ? Number(coach[7])
        : coachSample.heading + coach[2];

        cameraCoachPitch = Number(coach[6]);

        if (!Number.isFinite(cameraCoachPitch)) {
            cameraCoachPitch = 0;
        }

        // Preserve the original reverse-camera setting.
        // Arrow-key yaw and pitch are added relative to the coach.
        cameraRelativeYaw =
        (cameraReverseView ? Math.PI : 0) +
        (lookx || 0);

        cameraRelativePitch = looky || 0;

        // --------------------------------------------------------
        // SPACE MOVEMENT
        // --------------------------------------------------------

        // Movement is stored in coach-local coordinates.
        // It follows the coach as its position and rotation change.
        if (
            cameraArrowKeys.space &&
            fps > 0 &&
            Number.isFinite(fps)
        ) {
            var cameraMoveDistance = 5 / fps;
            var movePitchCos = Math.cos(cameraRelativePitch);

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

        // --------------------------------------------------------
        // CAMERA POSITION RELATIVE TO COACH
        // --------------------------------------------------------

        var cameraFloorHeight = Number(train_floor_height);

        if (!Number.isFinite(cameraFloorHeight)) {
            cameraFloorHeight = 0;
        }

        var localX = sideOffset + cameraMoveOffset.x;

        // The coach model origin is at train_floor_height.
        // Subtract that height to preserve the old camera height.
        var localY =
        heightOffset -
        cameraFloorHeight +
        cameraMoveOffset.y;

        var localZ = forwardOffset + cameraMoveOffset.z;

        // --------------------------------------------------------
        // APPLY COACH PITCH
        // Same order as rotateModel() in the object shader.
        // --------------------------------------------------------

        coachCosPitch = Math.cos(cameraCoachPitch);
        coachSinPitch = Math.sin(cameraCoachPitch);

        var pitchedX = localX;

        var pitchedY =
        coachCosPitch * localY -
        coachSinPitch * localZ;

        var pitchedZ =
        coachSinPitch * localY +
        coachCosPitch * localZ;

        // --------------------------------------------------------
        // APPLY COACH YAW
        // --------------------------------------------------------

        coachCosYaw = Math.cos(cameraCoachYaw);
        coachSinYaw = Math.sin(cameraCoachYaw);

        var rotatedX =
        coachCosYaw * pitchedX +
        coachSinYaw * pitchedZ;

        var rotatedY = pitchedY;

        var rotatedZ =
        -coachSinYaw * pitchedX +
        coachCosYaw * pitchedZ;

        // This is the same origin used for the coach floor meshes.
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

        // Original camera for views not yet implemented.
        var cam0 = sampleAt(pos, false);
        var camSide = basisForSample(cam0);

        cam = {
            x: cam0.x + camSide.rx * cameraXOffset,
            y: cam0.y + EYE_HEIGHT,
            z: cam0.z + camSide.rz * cameraXOffset,
            heading: cam0.heading + (lookx || 0)
        };
    }

    // ============================================================
    // CAMERA BASIS
    // ============================================================

    var basis = cameraBasis(cam);

    if (cameraAttachedToCoach) {

        var cameraPitchCos = Math.cos(cameraRelativePitch);

        // Local forward vector, including arrow-key look.
        var localForwardX =
        Math.sin(cameraRelativeYaw) * cameraPitchCos;

        var localForwardY =
        Math.sin(cameraRelativePitch);

        var localForwardZ =
        Math.cos(cameraRelativeYaw) * cameraPitchCos;

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

        // Keep the original scenery camera behaviour.
        var cameraPitch = looky || 0;
        var pitchCos = Math.cos(cameraPitch);

        basis.fx *= pitchCos;
        basis.fy = Math.sin(cameraPitch);
        basis.fz *= pitchCos;
    }

    gl.useProgram(program);

    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform1f(uTanHalfFov, Math.tan(FOV_DEG * Math.PI / 360));
    gl.uniform1f(uNear, NEAR);
    gl.uniform1f(uFar, DRAW_AHEAD + DRAW_BEHIND + 500);

    gl.uniform3f(uCameraPosition, cam.x, cam.y, cam.z);
    gl.uniform3f(uForward, basis.fx, basis.fy, basis.fz);

    // Important: include the right vector's Y component.
    gl.uniform3f(uRight, basis.rx, 0, basis.rz);

    for (var unit = 0; unit < textureCount; unit++) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, trackTextures[unit]);
    }

    gl.activeTexture(gl.TEXTURE0);

    var startDistance = Math.max(0, pos - DRAW_BEHIND);
    var endDistance = Math.min(route.maxDistance, pos + DRAW_AHEAD);

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

    if (endSegment >= startSegment) {
        for (var zone of routeMesh.zones) {

            if (
                zone.segmentEnd <= startSegment ||
                zone.segmentStart > endSegment
            ) continue;

            var firstSegment = Math.max(
                startSegment,
                zone.segmentStart
            );

            var lastSegment = Math.min(
                endSegment,
                zone.segmentEnd - 1
            );

            var firstLocal = firstSegment - zone.segmentStart;
            var lastLocal = lastSegment - zone.segmentStart;

            var firstVertex = zone.segmentFirst[firstLocal];

            var lastVertex =
            zone.segmentFirst[lastLocal] +
            zone.segmentCount[lastLocal];

            var vertexCount = lastVertex - firstVertex;

            if (vertexCount <= 0) continue;

            gl.bindVertexArray(zone.vao);

            for (
                var selectedTrackTextureIndex = 0;
            selectedTrackTextureIndex <= textureCount * 2;
            selectedTrackTextureIndex++
            ) {
                var textureToBind = selectedTrackTextureIndex === 0
                ? trackTextures[0]
                : trackTextures[selectedTrackTextureIndex - 1];

                gl.bindTexture(gl.TEXTURE_2D, textureToBind);

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

            // ====================================================
            // DRAW PRESELECTED POINT GEOMETRY
            // ====================================================

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

    drawRouteObjects(
        pos,
        startDistance,
        endDistance,
        cam,
        basis
    );

    draw_train_components(
        startDistance,
        endDistance,
        cam,
        basis
    );

    little_canvas();updateStatus();
    if (Number(pos) - train_length < Number(current_route_items_detailed[0][1])) {
        pos = Number(current_route_items_detailed[0][1]) + train_length;
    }
    if (Number(pos) > Number(current_route_items_detailed[current_route_items_detailed.length - 1][1])) {
        pos = Number(current_route_items_detailed[current_route_items_detailed.length - 1][1]);
    }
    if (!renderLoopRunning) return;

    renderAnimationFrameId = requestAnimationFrame(render);
}







