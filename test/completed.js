

// ============================================================
// TRAIN BODY TEXTURE LOADER
//
// Reads PNG files directly from the already-extracted
// textures.zip contents.
//
// No additional ZIP download or extraction is required.
// ============================================================

function loadPNGTextureFromZip(path) {

    if (trainBodyTextureCache.has(path)) {
        return trainBodyTextureCache.get(path);
    }

    var promise = (async function () {

        var zipFiles = window.textureZipFiles;

        if (!zipFiles || !zipFiles[path]) {
            throw new Error(
                "Train body texture not found in textures.zip: " + path
            );
        }

        var bodyGL = window.simulatorGL;

        if (!bodyGL || bodyGL.isContextLost()) {
            throw new Error(
                "WebGL context is unavailable for train body textures."
            );
        }

        var bitmap = await createImageBitmap(
            new Blob(
                [zipFiles[path]],
                { type: "image/png" }
            )
        );

        var texture = null;

        var previousFlip = bodyGL.getParameter(
            bodyGL.UNPACK_FLIP_Y_WEBGL
        );

        try {

            texture = bodyGL.createTexture();

            if (!texture) {
                throw new Error(
                    "Could not create GPU texture for " + path
                );
            }

            bodyGL.bindTexture(
                bodyGL.TEXTURE_2D,
                texture
            );

            bodyGL.pixelStorei(
                bodyGL.UNPACK_FLIP_Y_WEBGL,
                true
            );

            bodyGL.texParameteri(
                bodyGL.TEXTURE_2D,
                bodyGL.TEXTURE_MIN_FILTER,
                bodyGL.LINEAR_MIPMAP_LINEAR
            );

            bodyGL.texParameteri(
                bodyGL.TEXTURE_2D,
                bodyGL.TEXTURE_MAG_FILTER,
                bodyGL.LINEAR
            );

            bodyGL.texParameteri(
                bodyGL.TEXTURE_2D,
                bodyGL.TEXTURE_WRAP_S,
                bodyGL.REPEAT
            );

            bodyGL.texParameteri(
                bodyGL.TEXTURE_2D,
                bodyGL.TEXTURE_WRAP_T,
                bodyGL.REPEAT
            );

            bodyGL.texImage2D(
                bodyGL.TEXTURE_2D,
                0,
                bodyGL.RGBA,
                bodyGL.RGBA,
                bodyGL.UNSIGNED_BYTE,
                bitmap
            );

            bodyGL.generateMipmap(bodyGL.TEXTURE_2D);

            if (DEBUG_GL_UPLOADS) {

                var glError = bodyGL.getError();

                if (glError !== bodyGL.NO_ERROR) {
                    throw new Error(
                        "Train body texture upload failed for " +
                        path + ". WebGL error: " + glError
                    );
                }
            }

            return texture;

        } catch (error) {

            if (texture) {
                bodyGL.deleteTexture(texture);
            }

            throw error;

        } finally {

            bodyGL.bindTexture(
                bodyGL.TEXTURE_2D,
                null
            );

            bodyGL.pixelStorei(
                bodyGL.UNPACK_FLIP_Y_WEBGL,
                previousFlip
            );

            bitmap.close();
        }

    })();

    trainBodyTextureCache.set(path, promise);

    // A failed load must be allowed to retry.
    promise.catch(function () {
        trainBodyTextureCache.delete(path);
    });

    return promise;
}


// ============================================================
// LOAD THE CURRENT TRAIN'S TWO BODY TEXTURES
// ============================================================



async function loadTrainBodyTextures() {

    var trainName = String(current_train || "").trim();
    var liveryName = String(current_livery || "").trim();

    if (!trainName || !liveryName) {
        throw new Error("A train and livery must be selected.");
    }

    var trainPath = ("train/" + trainName + "/").replace(/ /g, "_");
    var livery = liveryName.replace(/ /g, "_");
if (livery_includes_cab){

    var paths = [
        trainPath + livery + ".png",
        trainPath + "interior.png",
        trainPath + livery + "_door.png",
        trainPath + "door_interior.png",
        trainPath + "between_coaches.png",
        trainPath + "between_coaches_interior.png",
        trainPath + livery + "_train_cab.png",
        trainPath + "train_cab_interior.png"
    ];

}else{
    var paths = [
        trainPath + livery + ".png",
        trainPath + "interior.png",
        trainPath + livery + "_door.png",
        trainPath + "door_interior.png",
        trainPath + "between_coaches.png",
        trainPath + "between_coaches_interior.png",
        trainPath + "train_cab.png",
        trainPath + "train_cab_interior.png"
    ];

}





    var textures = await Promise.all(
        paths.map(path => loadPNGTextureFromZip(path))
    );

    trainBodyTextureOuter = textures[0];
    trainBodyTextureInner = textures[1];

    trainDoorTextureOuter = textures[2];
    trainDoorTextureInner = textures[3];

    trainBetweenTextureOuter = textures[4];
    trainBetweenTextureInner = textures[5];

    trainCabTextureOuter = textures[6];
    trainCabTextureInner = textures[7];

    console.log("Train textures loaded:", paths);
}





function buildTrackPositionDatabase(parsedEvents) {
    a2d_map_of_track = [];
    a2d_map_of_stations = [];

    var activeRails = Object.create(null);
    var routeStart = Infinity;
    var routeEnd = -Infinity;
    var i = 0;

    while (i < parsedEvents.length) {
        var distance = Number(parsedEvents[i].distance);

        if (!Number.isFinite(distance)) {
            i++;
            continue;
        }

        var groupStart = i;
        i++;

        while (
            i < parsedEvents.length &&
            Number(parsedEvents[i].distance) === distance
        ) {
            i++;
        }

        if (distance < routeStart) routeStart = distance;
        if (distance > routeEnd) routeEnd = distance;

        var isBlockBoundary =
        Number.isFinite(block_length) &&
        block_length > 0 &&
        distance % block_length === 0;

        // Collect stations here, while parsedEvents is in scope.
        for (var j = groupStart; j < i; j++) {
            var event = parsedEvents[j];

            if (event.type !== "station") continue;

            a2d_map_of_stations.push({
                name: String(event.name || ""),
                                     distance: distance
            });
        }

        var railsUpdatedAtDistance = Object.create(null);

        // Process rail events before railend events at this distance.
        for (var j = groupStart; j < i; j++) {
            var event = parsedEvents[j];

            if (event.type !== "rail") continue;

            var rail = event.rail;
            var key = String(rail);
            var offsetX = Number(event.offsetX);

            if (!Number.isFinite(offsetX)) continue;

            var state = activeRails[key];

            // A rail starts being tracked when its rail event is encountered.
            // It does not have to start on a block boundary.
            if (!state) {
                activeRails[key] = {
                    rail: rail,
                    start: distance,
                    offsetX: offsetX
                };

                railsUpdatedAtDistance[key] = true;
                continue;
            }

            // Existing rail offsets only change at block boundaries.
            if (!isBlockBoundary || offsetX === state.offsetX) {
                continue;
            }

            railsUpdatedAtDistance[key] = true;

            var changeStart = Math.max(
                state.start,
                distance - block_length
            );

            if (changeStart > state.start) {
                a2d_map_of_track.push([
                    state.rail,
                    state.start,
                    changeStart,
                    state.offsetX,
                    state.offsetX
                ]);
            }

            if (distance > changeStart) {
                a2d_map_of_track.push([
                    state.rail,
                    changeStart,
                    distance,
                    state.offsetX,
                    offsetX
                ]);
            }

            state.start = distance;
            state.offsetX = offsetX;
        }

        // Process railend events after rail events at the same distance.
        for (var j = groupStart; j < i; j++) {
            var event = parsedEvents[j];

            if (event.type !== "railend") continue;

            var key = String(event.rail);
            var state = activeRails[key];

            if (!state) continue;

            // A railend can contain the final offsetX. Use it if no rail
            // event has already updated this rail at this distance.
            if (
                !railsUpdatedAtDistance[key] &&
                isBlockBoundary
            ) {
                var offsetX = Number(event.offsetX);

                if (
                    Number.isFinite(offsetX) &&
                    offsetX !== state.offsetX
                ) {
                    var changeStart = Math.max(
                        state.start,
                        distance - block_length
                    );

                    if (changeStart > state.start) {
                        a2d_map_of_track.push([
                            state.rail,
                            state.start,
                            changeStart,
                            state.offsetX,
                            state.offsetX
                        ]);
                    }

                    if (distance > changeStart) {
                        a2d_map_of_track.push([
                            state.rail,
                            changeStart,
                            distance,
                            state.offsetX,
                            offsetX
                        ]);
                    }

                    state.start = distance;
                    state.offsetX = offsetX;
                }
            }

            // Close the rail at the railend distance.
            if (distance > state.start) {
                a2d_map_of_track.push([
                    state.rail,
                    state.start,
                    distance,
                    state.offsetX,
                    state.offsetX
                ]);
            }

            delete activeRails[key];
        }
    }

    // Close any rails that did not have a railend event.
    for (var key in activeRails) {
        var state = activeRails[key];

        if (routeEnd > state.start) {
            a2d_map_of_track.push([
                state.rail,
                state.start,
                routeEnd,
                state.offsetX,
                state.offsetX
            ]);
        }
    }

    // Add the default track 0 across the entire route.
    if (
        Number.isFinite(routeStart) &&
        Number.isFinite(routeEnd)
    ) {
        a2d_map_of_track.push([
            0,
            routeStart,
            routeEnd,
            0,
            0
        ]);
    }

    return a2d_map_of_track;
}

function showRoutePointsSplash() {
    var splashImage = getSplashImageFromZip(2);

    var imageMarkup = splashImage
    ? '<img class="VF-Train_Sim-splash-background" src="' +
    escapeHTML(splashImage) +
    '" alt="" aria-hidden="true">'
    : '<div class="VF-Train_Sim-splash-background-fallback" aria-hidden="true"></div>';

    routeMenuContent.innerHTML =
    '<div class="VF-Train_Sim-splash-screen VF-Train_Sim-splash-ready">' +
    imageMarkup +
    '<div class="VF-Train_Sim-splash-ready-box" style="width:90vw;height:90vh;max-width:90vw;max-height:90vh;box-sizing:border-box;display:flex;flex-direction:column;">' +
    '<div class="VF-Train_Sim-splash-ready-title" style="flex:0 0 auto;">Points</div>' +
    '<div class="VF-Train_Sim-settings-content" style="position:relative;flex:1;min-height:0;width:100%;padding:0;">' +
    '<canvas id="VF-Train_Sim-points-canvas" style="display:block;position:absolute;inset:0;width:100%;height:100%;background:rgba(0,0,0,0.25);cursor:grab;touch-action:none;"></canvas>' +

    '<div style="position:absolute;top:12px;right:12px;z-index:5;display:flex;flex-wrap:wrap;gap:6px;">' +
    '<button type="button" id="VF-Train_Sim-points-to-scale" aria-pressed="false">To scale</button>' +
    '<button type="button" id="VF-Train_Sim-points-enhanced" aria-pressed="true">Enhanced viewing</button>' +
    '<button type="button" id="VF-Train_Sim-points-zoom-in" aria-label="Zoom in">+</button>' +
    '<button type="button" id="VF-Train_Sim-points-zoom-out" aria-label="Zoom out">−</button>' +
    '<button type="button" id="VF-Train_Sim-points-reset">Reset zoom</button>' +
    '</div>' +

    '<button type="button" class="VF-Train_Sim-splash-start" data-menu-action="points-back" style="position:absolute;right:16px;bottom:16px;z-index:5;">Back</button>' +
    '</div>' +
    '</div>' +
    '</div>';

    routeMenuContent.querySelectorAll("button[data-menu-action]").forEach(function(button) {
        button.addEventListener("click", function() {
            handleRouteMenuButtonClick(button);
        });
    });

    routeMenuElement.classList.add("is-open");
    routeMenuElement.classList.add("VF-Train_Sim-splash-mode");
    routeMenuElement.style.display = "flex";


    statusElement.style.display = "none";

    var canvasmappy = routeMenuContent.querySelector(
        "#VF-Train_Sim-points-canvas"
    );

    var firstDistance = Infinity;
    var trackByRail = Object.create(null);

    // Build the rail lookup and find the first route distance.
    for (var i = 0; i < a2d_map_of_track.length; i++) {
        var segment = a2d_map_of_track[i];

        if (!segment) continue;

        var rail = String(segment[0]);
        var startDistance = Number(segment[1]);

        if (!Number.isFinite(startDistance)) continue;

        if (startDistance < firstDistance) {
            firstDistance = startDistance;
        }

        if (!trackByRail[rail]) {
            trackByRail[rail] = [];
        }

        trackByRail[rail].push(segment);
    }

    // Sort rail segments into route order.
    for (var rail in trackByRail) {
        trackByRail[rail].sort(function(a, b) {
            return Number(a[1]) - Number(b[1]);
        });
    }

    canvasmappy.__pointsFirstDistance = Number.isFinite(firstDistance)
    ? firstDistance
    : 0;

    canvasmappy.__pointsTrackByRail = trackByRail;
    canvasmappy.__pointsStations = a2d_map_of_stations.slice();

    canvasmappy.__pointsView = {
        scale: 1,
        panX: 0,
        panY: 0,
        mode: "enhanced"
    };

    canvasmappy.__pointsDrag = {
        active: false,
        pointerId: null,
        lastX: 0,
        lastY: 0,
        moved: false,
        totalMovement: 0
    };

    canvasmappy.__pointsSwitchHits = [];

    pointsMapDraw();
}


function pointsMapZoomAt(canvasmappy, factor, anchorX, anchorY) {
    if (!pointsscreenmode) return;

    var view = canvasmappy.__pointsView;
    var centreX = canvasmappy.clientWidth / 2;
    var centreY = canvasmappy.clientHeight / 2;

    var newScale = Math.max(
        0.01,
        Math.min(100, view.scale * factor)
    );

    var ratio = newScale / view.scale;

    view.panX = anchorX - centreX -
    ((anchorX - centreX - view.panX) * ratio);

    view.panY = anchorY - centreY -
    ((anchorY - centreY - view.panY) * ratio);

    view.scale = newScale;

    pointsMapDraw();
}


function pointsMapPanBy(canvasmappy, dx, dy) {
    if (pointsscreenmode !== true) return;
    if (!canvasmappy || !canvasmappy.__pointsView) return;

    var view = canvasmappy.__pointsView;

    view.panX += dx;
    view.panY += dy;

    pointsMapDraw();
}


function pointsMapSetMode(mode) {
    if (pointsscreenmode !== true) return;

    var canvasmappy = pointsMapGetCanvas();

    if (!canvasmappy || !canvasmappy.__pointsView) return;

    var view = canvasmappy.__pointsView;

    view.mode = mode === "enhanced" ? "enhanced" : "scale";

    var toScaleButton = routeMenuContent.querySelector(
        "#VF-Train_Sim-points-to-scale"
    );

    var enhancedButton = routeMenuContent.querySelector(
        "#VF-Train_Sim-points-enhanced"
    );

    if (toScaleButton) {
        toScaleButton.setAttribute(
            "aria-pressed",
            view.mode === "scale" ? "true" : "false"
        );
    }

    if (enhancedButton) {
        enhancedButton.setAttribute(
            "aria-pressed",
            view.mode === "enhanced" ? "true" : "false"
        );
    }

    pointsMapDraw();
}

function pointsMapFindOffset(canvasmappy, rail, distance) {
    var railSegments =
    canvasmappy.__pointsTrackByRail[String(rail)];

    if (!railSegments || railSegments.length === 0) {
        return null;
    }

    var nearestSegment = null;
    var nearestDistance = Infinity;

    for (var i = 0; i < railSegments.length; i++) {
        var segment = railSegments[i];

        var start = Number(segment[1]);
        var end = Number(segment[2]);
        var startOffset = Number(segment[3]);
        var endOffset = Number(segment[4]);

        if (
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            !Number.isFinite(startOffset) ||
            !Number.isFinite(endOffset)
        ) {
            continue;
        }

        // Use interpolation when the distance is inside this segment.
        if (distance >= start && distance <= end) {
            var proportion = end === start
            ? 0
            : (distance - start) / (end - start);

            return startOffset +
            (endOffset - startOffset) * proportion;
        }

        // Keep the closest segment for extrapolation.
        var distanceToSegment = distance < start
        ? start - distance
        : distance - end;

        if (distanceToSegment < nearestDistance) {
            nearestDistance = distanceToSegment;
            nearestSegment = segment;
        }
    }

    // Extrapolate using the nearest segment's gradient.
    if (nearestSegment) {
        var start = Number(nearestSegment[1]);
        var end = Number(nearestSegment[2]);
        var startOffset = Number(nearestSegment[3]);
        var endOffset = Number(nearestSegment[4]);

        var proportion = end === start
        ? 0
        : (distance - start) / (end - start);

        return startOffset +
        (endOffset - startOffset) * proportion;
    }

    return null;
}









function pointsMapDraw() {
    if (pointsscreenmode !== true) return;

    var canvasmappy = pointsMapGetCanvas();
    if (!canvasmappy || !canvasmappy.__pointsView) return;

    var ctxmappy = canvasmappy.getContext("2d");
    if (!ctxmappy) return;

    var width = canvasmappy.clientWidth;
    var height = canvasmappy.clientHeight;

    if (!width || !height) return;

    var pixelRatio = window.devicePixelRatio || 1;

    var backingWidth = Math.round(width * pixelRatio);
    var backingHeight = Math.round(height * pixelRatio);

    if (
        canvasmappy.width !== backingWidth ||
        canvasmappy.height !== backingHeight
    ) {
        canvasmappy.width = backingWidth;
        canvasmappy.height = backingHeight;
    }

    ctxmappy.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctxmappy.clearRect(0, 0, width, height);

    var view = canvasmappy.__pointsView;

    // ------------------------------------------------------------
    // READ TRAIN ARRAYS
    // ------------------------------------------------------------

    var bogieData = (
        typeof bogies !== "undefined" &&
        Array.isArray(bogies)
    ) ? bogies : [];

    var bogieDataNpc = (
        typeof bogies_npc !== "undefined" &&
        Array.isArray(bogies_npc)
    ) ? bogies_npc : [];

    var bogieAnglesData = (
        typeof bogies_angle !== "undefined" &&
        Array.isArray(bogies_angle)
    ) ? bogies_angle : [];

    var bogieAnglesDataNpc = (
        typeof bogies_angle_npc !== "undefined" &&
        Array.isArray(bogies_angle_npc)
    ) ? bogies_angle_npc : [];

    var coachData = (
        typeof coach_positions !== "undefined" &&
        Array.isArray(coach_positions)
    ) ? coach_positions : [];

    var coachDataNpc = (
        typeof coach_positions_npc !== "undefined" &&
        Array.isArray(coach_positions_npc)
    ) ? coach_positions_npc : [];

    // ------------------------------------------------------------
    // MAP REFERENCE DISTANCE
    // ------------------------------------------------------------

    var firstBogieDistance = canvasmappy.__pointsFirstDistance;

    for (var i = 0; i < bogieData.length; i++) {
        if (
            bogieData[i] &&
            Number.isFinite(Number(bogieData[i][0]))
        ) {
            firstBogieDistance = Number(bogieData[i][0]);
            break;
        }
    }

    if (!Number.isFinite(Number(firstBogieDistance))) {
        for (var i = 0; i < bogieDataNpc.length; i++) {
            if (
                bogieDataNpc[i] &&
                Number.isFinite(Number(bogieDataNpc[i][0]))
            ) {
                firstBogieDistance = Number(bogieDataNpc[i][0]);
                break;
            }
        }
    }

    if (!Number.isFinite(Number(firstBogieDistance))) {
        firstBogieDistance = 0;
    }

    var horizontalScale = (width / 1600) * view.scale;

    // Enhanced mode exaggerates the lateral map axis only.
    var verticalScale = horizontalScale *
    (view.mode === "enhanced" ? 16 : 1);

    // ------------------------------------------------------------
    // MAP TRACK OFFSET FALLBACK
    // Used only for drawing track lines and switches.
    // ------------------------------------------------------------

    function getNearestRailOffset(rail, distance) {
        var nearestOffset = null;
        var nearestDistance = Infinity;

        for (var i = 0; i < a2d_map_of_track.length; i++) {
            var segment = a2d_map_of_track[i];

            if (Number(segment[0]) !== Number(rail)) continue;

            var startDistance = Number(segment[1]);
            var endDistance = Number(segment[2]);
            var startOffset = Number(segment[3]);
            var endOffset = Number(segment[4]);

            if (
                !Number.isFinite(startDistance) ||
                !Number.isFinite(endDistance) ||
                !Number.isFinite(startOffset) ||
                !Number.isFinite(endOffset)
            ) {
                continue;
            }

            var distanceToStart = Math.abs(
                distance - startDistance
            );

            if (distanceToStart < nearestDistance) {
                nearestDistance = distanceToStart;
                nearestOffset = startOffset;
            }

            var distanceToEnd = Math.abs(
                distance - endDistance
            );

            if (distanceToEnd < nearestDistance) {
                nearestDistance = distanceToEnd;
                nearestOffset = endOffset;
            }
        }

        return nearestOffset;
    }

    function getMapPoint(distance, rail, fallbackOffset) {
        var offset = pointsMapFindOffset(
            canvasmappy,
            rail,
            distance
        );

        if (offset === null) {
            offset = getNearestRailOffset(rail, distance);
        }

        if (offset === null) {
            offset = fallbackOffset;
        }

        if (!Number.isFinite(Number(offset))) {
            offset = 0;
        }

        return {
            x: width / 2 +
            (distance - firstBogieDistance) *
            horizontalScale + view.panX,

            y: height / 2 +
            offset * verticalScale + view.panY
        };
    }

    // ------------------------------------------------------------
    // DRAW TRACK LINES
    // ------------------------------------------------------------

    ctxmappy.beginPath();

    for (var i = 0; i < a2d_map_of_track.length; i++) {
        var segment = a2d_map_of_track[i];

        var rail = segment[0];
        var startDistance = Number(segment[1]);
        var endDistance = Number(segment[2]);
        var startOffsetX = Number(segment[3]);
        var endOffsetX = Number(segment[4]);

        if (
            !Number.isFinite(startDistance) ||
            !Number.isFinite(endDistance) ||
            !Number.isFinite(startOffsetX) ||
            !Number.isFinite(endOffsetX)
        ) {
            continue;
        }

        if (Number(rail) === 0) {
            startDistance -= 200;
            endDistance += 200;
        }

        var startPoint = getMapPoint(
            startDistance,
            rail,
            startOffsetX
        );

        var endPoint = getMapPoint(
            endDistance,
            rail,
            endOffsetX
        );

        ctxmappy.moveTo(startPoint.x, startPoint.y);
        ctxmappy.lineTo(endPoint.x, endPoint.y);
    }

    ctxmappy.strokeStyle = "#aeb9c5";
    ctxmappy.lineWidth = 4;
    ctxmappy.lineCap = "round";
    ctxmappy.stroke();

    // ------------------------------------------------------------
    // DRAW SWITCHES
    // ------------------------------------------------------------

    var switchHits = [];

    var switchBlockLength =
    Number.isFinite(Number(block_length)) &&
    Number(block_length) > 0
    ? Number(block_length)
    : 25;

    for (var i = 0; i < trackSwitches.length; i++) {
        var switchItem = trackSwitches[i];

        if (!switchItem) continue;

        var switchType = switchItem[3];

        if (
            switchType !== "facing points" &&
                switchType !== "non facing points"
        ) {
            continue;
        }

        var switchDistance = Number(switchItem[0]);
        var railA = Number(switchItem[1]);
        var railB = Number(switchItem[2]);

        if (
            !Number.isFinite(switchDistance) ||
            !Number.isFinite(railA) ||
            !Number.isFinite(railB)
        ) {
            continue;
        }

        var offsetA = pointsMapFindOffset(
            canvasmappy,
            railA,
            switchDistance
        );

        var offsetB = pointsMapFindOffset(
            canvasmappy,
            railB,
            switchDistance
        );

        if (offsetA === null && offsetB === null) continue;

        if (offsetA === null) offsetA = offsetB;
        if (offsetB === null) offsetB = offsetA;

        var switchPoint = getMapPoint(
            switchDistance,
                railA,
                offsetA
        );

        var switchX = switchPoint.x;

        var switchY = (
            height / 2 +
            ((offsetA + offsetB) / 2) * verticalScale +
            view.panY
        );

        var facingPoints = switchType === "facing points";

        var branchDistance = switchDistance +
        (facingPoints
        ? switchBlockLength
        : -switchBlockLength);

        var branchPointA = getMapPoint(
            branchDistance,
            railA,
            offsetA
        );

        var branchPointB = getMapPoint(
            branchDistance,
            railB,
            offsetB
        );

        var selectedRail = switchItem[4] ? railB : railA;

        ctxmappy.beginPath();
        ctxmappy.moveTo(switchX, switchY);
        ctxmappy.lineTo(branchPointA.x, branchPointA.y);
        ctxmappy.moveTo(switchX, switchY);
        ctxmappy.lineTo(branchPointB.x, branchPointB.y);

        ctxmappy.strokeStyle = "#aeb9c5";
        ctxmappy.lineWidth = 4;
        ctxmappy.lineCap = "round";
        ctxmappy.stroke();

        var selectedPoint = selectedRail === railA
        ? branchPointA
        : branchPointB;

        ctxmappy.beginPath();
        ctxmappy.moveTo(switchX, switchY);
        ctxmappy.lineTo(selectedPoint.x, selectedPoint.y);

        ctxmappy.strokeStyle = "#218cff";
        ctxmappy.lineWidth = 10;
        ctxmappy.lineCap = "round";
        ctxmappy.stroke();

        var switchRadius = Math.max(
            2.5,
            Math.min(7, 4 * view.scale)
        );

        ctxmappy.beginPath();
        ctxmappy.arc(
            switchX,
                switchY,
                    switchRadius,
                        0,
                     Math.PI * 2
        );

        ctxmappy.fillStyle = "#218cff";
        ctxmappy.fill();

        switchHits.push({
            x: switchX,
            y: switchY,
            index: i,
            radius: 30,
            armA: {
                x1: switchX,
                y1: switchY,
                x2: branchPointA.x,
                y2: branchPointA.y
            },
            armB: {
                x1: switchX,
                y1: switchY,
                x2: branchPointB.x,
                y2: branchPointB.y
            }
        });
    }

    canvasmappy.__pointsSwitchHits = switchHits;

    // ------------------------------------------------------------
    // DRAW NAMED STATIONS
    // ------------------------------------------------------------

    ctxmappy.save();

    ctxmappy.font = Math.max(14, 20 * view.scale) +
    "px Arial, sans-serif";

    ctxmappy.textAlign = "center";
    ctxmappy.textBaseline = "bottom";
    ctxmappy.lineWidth = Math.max(2, 3 * view.scale);
    ctxmappy.strokeStyle = "rgba(0,0,0,0.95)";
    ctxmappy.fillStyle = "#ffffff";

    var stationY = height / 2 +
    view.panY - (24 * view.scale);

    var stations = canvasmappy.__pointsStations || [];

    for (var i = 0; i < stations.length; i++) {
        var station = stations[i];

        var stationName = String(station.name || "").trim();

        if (!stationName) continue;

        var stationX = width / 2 +
        (station.distance - firstBogieDistance) *
        horizontalScale + view.panX;

        if (stationX < -500 || stationX > width + 500) {
            continue;
        }

        ctxmappy.strokeText(stationName, stationX, stationY);
        ctxmappy.fillText(stationName, stationX, stationY);
    }

    ctxmappy.restore();

    // ------------------------------------------------------------
    // COACH DIMENSIONS
    // ------------------------------------------------------------

    var coachLengthValue = Number(coachlength);

    if (
        !Number.isFinite(coachLengthValue) ||
        coachLengthValue <= 0
    ) {
        coachLengthValue = 22;
    }

    var cabOverhangValue = Number(cab_overhang);

    if (!Number.isFinite(cabOverhangValue)) {
        cabOverhangValue = 0;
    }

    var nonCabGap = Math.abs(Number(non_cab_overhang));

    if (!Number.isFinite(nonCabGap)) {
        nonCabGap = 0;
    }

    var coachCount = Math.floor(Number(coaches));

    if (!Number.isFinite(coachCount) || coachCount < 0) {
        coachCount = 0;
    }

    // Half the previous coach width.
    var halfCoachWidth = coachLengthValue / 12;

    // ------------------------------------------------------------
    // DRAW COACHES DIRECTLY FROM coach_positions
    //
    // [lateralOffsetX, routeDistance, yaw]
    // ------------------------------------------------------------

    function drawCoachPositions(coachArray, fillColour) {
        if (!Array.isArray(coachArray)) return;

        var count = Math.min(
            coachCount,
            coachArray.length
        );

        for (var i = 0; i < count; i++) {
            var coach = coachArray[i];

            if (
                !Array.isArray(coach) ||
                coach.length < 3 ||
                !Number.isFinite(Number(coach[0])) ||
                !Number.isFinite(Number(coach[1])) ||
                !Number.isFinite(Number(coach[2]))
            ) {
                continue;
            }

            var centreX = width / 2 +
            (
                Number(coach[1]) -
                firstBogieDistance
            ) * horizontalScale +
            view.panX;

            var centreY = height / 2 +
            Number(coach[0]) * verticalScale +
            view.panY;

            var yaw = Number(coach[2]);

            var forwardX = Math.cos(yaw);
            var forwardY = Math.sin(yaw);

            // Outer ends have cab overhang.
            // Internal ends retract by the non-cab gap.
            var frontHalfLength =
            coachLengthValue * 0.5 +
            (
                i === 0
                ? cabOverhangValue
                : -nonCabGap
            );

            var rearHalfLength =
            coachLengthValue * 0.5 +
            (
                i === count - 1
                ? cabOverhangValue
                : -nonCabGap
            );

            var frontX = centreX +
            forwardX *
                frontHalfLength *
                horizontalScale;

            var frontY = centreY +
            forwardY *
                frontHalfLength *
                verticalScale;

            var rearX = centreX -
            forwardX *
                rearHalfLength *
                horizontalScale;

            var rearY = centreY -
            forwardY *
                rearHalfLength *
                verticalScale;

            var acrossX =
            -Math.sin(yaw) *
            halfCoachWidth *
            horizontalScale;

            var acrossY =
            Math.cos(yaw) *
            halfCoachWidth *
            verticalScale;

            ctxmappy.beginPath();

            ctxmappy.moveTo(
                frontX - acrossX,
                frontY - acrossY
            );

            ctxmappy.lineTo(
                rearX - acrossX,
                rearY - acrossY
            );

            ctxmappy.lineTo(
                rearX + acrossX,
                rearY + acrossY
            );

            ctxmappy.lineTo(
                frontX + acrossX,
                frontY + acrossY
            );

            ctxmappy.closePath();

            ctxmappy.fillStyle = fillColour;
            ctxmappy.fill();
        }
    }

    // Player train.
    drawCoachPositions(
        coachData,
        "#d92727"
    );

    // NPC train: slightly darker red.
    drawCoachPositions(
        coachDataNpc,
        "#b51f25"
    );

    // ------------------------------------------------------------
    // DRAW BOGIES AS GREY SQUARES
    // ------------------------------------------------------------

    function drawBogieSquares(
        bogieArray,
        angleArray
    ) {
        if (
            !Array.isArray(bogieArray) ||
            !Array.isArray(angleArray)
        ) {
            return;
        }

        var squareSize = Math.max(
            5,
            Math.min(9, 7 * view.scale)
        );

        for (var i = 0; i < bogieArray.length; i++) {
            var bogie = bogieArray[i];

            if (
                !bogie ||
                !Number.isFinite(Number(bogie[0])) ||
                !Number.isFinite(Number(bogie[2]))
            ) {
                continue;
            }

            var yaw = Number(angleArray[i]);

            if (!Number.isFinite(yaw)) continue;

            var x = width / 2 +
            (
                Number(bogie[0]) -
                firstBogieDistance
            ) * horizontalScale +
            view.panX;

            var y = height / 2 +
            Number(bogie[2]) * verticalScale +
            view.panY;

            var screenYaw = Math.atan2(
                Math.sin(yaw) * verticalScale,
                                       Math.cos(yaw) * horizontalScale
            );

            ctxmappy.save();

            ctxmappy.translate(x, y);
            ctxmappy.rotate(screenYaw);

            ctxmappy.fillStyle = "#92999f";
            ctxmappy.strokeStyle = "#42484d";
            ctxmappy.lineWidth = 1;

            ctxmappy.fillRect(
                -squareSize / 2,
                -squareSize / 2,
                squareSize,
                squareSize
            );

            ctxmappy.strokeRect(
                -squareSize / 2,
                -squareSize / 2,
                squareSize,
                squareSize
            );

            ctxmappy.restore();
        }
    }

    drawBogieSquares(
        bogieData,
        bogieAnglesData
    );

    drawBogieSquares(
        bogieDataNpc,
        bogieAnglesDataNpc
    );
}









function pointsMapGetCanvas() {
    return routeMenuContent.querySelector(
        "#VF-Train_Sim-points-canvas"
    );
}


function pointsMapAddListeners() {
    pointsMapRemoveListeners();

    if (pointsscreenmode !== true) return;

    var canvasmappy = pointsMapGetCanvas();

    if (!canvasmappy) return;

    var buttons = {
        zoomIn: routeMenuContent.querySelector(
            "#VF-Train_Sim-points-zoom-in"
        ),
        zoomOut: routeMenuContent.querySelector(
            "#VF-Train_Sim-points-zoom-out"
        ),
        toScale: routeMenuContent.querySelector(
            "#VF-Train_Sim-points-to-scale"
        ),
        enhanced: routeMenuContent.querySelector(
            "#VF-Train_Sim-points-enhanced"
        ),
        reset: routeMenuContent.querySelector(
            "#VF-Train_Sim-points-reset"
        )
    };

    canvasmappy.__pointsListenerButtons = buttons;
    routeMenuContent.__pointsMapListenerCanvas = canvasmappy;

    canvasmappy.addEventListener(
        "wheel",
        pointsMapWheel,
        { passive: false }
    );

    canvasmappy.addEventListener("pointerdown", pointsMapPointerDown);
    canvasmappy.addEventListener("pointermove", pointsMapPointerMove);
    canvasmappy.addEventListener("pointerup", pointsMapPointerUp);
    canvasmappy.addEventListener("pointercancel", pointsMapPointerCancel);
    canvasmappy.addEventListener("click", pointsMapClick);

    if (buttons.zoomIn) {
        buttons.zoomIn.addEventListener("click", pointsMapZoomIn);
    }

    if (buttons.zoomOut) {
        buttons.zoomOut.addEventListener("click", pointsMapZoomOut);
    }

    if (buttons.toScale) {
        buttons.toScale.addEventListener("click", pointsMapToScale);
    }

    if (buttons.enhanced) {
        buttons.enhanced.addEventListener("click", pointsMapEnhanced);
    }

    if (buttons.reset) {
        buttons.reset.addEventListener("click", pointsMapResetZoom);
    }

    window.addEventListener("resize", pointsMapResize);
}


function pointsMapRemoveListeners() {
    var canvasmappy = routeMenuContent.__pointsMapListenerCanvas;

    if (!canvasmappy) return;

    canvasmappy.removeEventListener("wheel", pointsMapWheel);
    canvasmappy.removeEventListener("pointerdown", pointsMapPointerDown);
    canvasmappy.removeEventListener("pointermove", pointsMapPointerMove);
    canvasmappy.removeEventListener("pointerup", pointsMapPointerUp);
    canvasmappy.removeEventListener("pointercancel", pointsMapPointerCancel);
    canvasmappy.removeEventListener("click", pointsMapClick);

    var buttons = canvasmappy.__pointsListenerButtons || {};

    if (buttons.zoomIn) {
        buttons.zoomIn.removeEventListener("click", pointsMapZoomIn);
    }

    if (buttons.zoomOut) {
        buttons.zoomOut.removeEventListener("click", pointsMapZoomOut);
    }

    if (buttons.toScale) {
        buttons.toScale.removeEventListener("click", pointsMapToScale);
    }

    if (buttons.enhanced) {
        buttons.enhanced.removeEventListener("click", pointsMapEnhanced);
    }

    if (buttons.reset) {
        buttons.reset.removeEventListener("click", pointsMapResetZoom);
    }

    window.removeEventListener("resize", pointsMapResize);

    if (
        canvasmappy.__pointsDrag &&
        canvasmappy.__pointsDrag.active &&
        canvasmappy.__pointsDrag.pointerId !== null &&
        canvasmappy.hasPointerCapture &&
        canvasmappy.hasPointerCapture(canvasmappy.__pointsDrag.pointerId)
    ) {
        canvasmappy.releasePointerCapture(
            canvasmappy.__pointsDrag.pointerId
        );
    }

    if (canvasmappy.__pointsDrag) {
        canvasmappy.__pointsDrag.active = false;
        canvasmappy.__pointsDrag.pointerId = null;
    }

    delete canvasmappy.__pointsListenerButtons;
    routeMenuContent.__pointsMapListenerCanvas = null;
}


function pointsMapListenerInactive(event) {
    if (pointsscreenmode === true) return false;

    pointsMapRemoveListeners();

    return true;
}


function pointsMapWheel(event) {
    if (pointsMapListenerInactive(event)) return;

    event.preventDefault();

    var canvasmappy = event.currentTarget;
    var rect = canvasmappy.getBoundingClientRect();

    pointsMapZoomAt(
        canvasmappy,
        Math.exp(-event.deltaY * 0.001),
                    event.clientX - rect.left,
                    event.clientY - rect.top
    );
}


function pointsMapPointerDown(event) {
    if (pointsMapListenerInactive(event)) return;
    if (event.button !== undefined && event.button !== 0) return;

    var canvasmappy = event.currentTarget;
    var drag = canvasmappy.__pointsDrag;

    drag.active = true;
    drag.pointerId = event.pointerId;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.moved = false;
    drag.totalMovement = 0;

    canvasmappy.style.cursor = "grabbing";

    if (canvasmappy.setPointerCapture) {
        canvasmappy.setPointerCapture(event.pointerId);
    }
}


function pointsMapPointerMove(event) {
    if (pointsMapListenerInactive(event)) return;

    var canvasmappy = event.currentTarget;
    var drag = canvasmappy.__pointsDrag;

    if (!drag.active || drag.pointerId !== event.pointerId) {
        return;
    }

    var dx = event.clientX - drag.lastX;
    var dy = event.clientY - drag.lastY;

    drag.totalMovement += Math.abs(dx) + Math.abs(dy);

    if (drag.totalMovement > 4) {
        drag.moved = true;
    }

    drag.lastX = event.clientX;
    drag.lastY = event.clientY;

    pointsMapPanBy(canvasmappy, dx, dy);
}


function pointsMapPointerUp(event) {
    if (pointsMapListenerInactive(event)) return;

    var canvasmappy = event.currentTarget;
    var drag = canvasmappy.__pointsDrag;

    if (!drag.active || drag.pointerId !== event.pointerId) {
        return;
    }

    drag.active = false;
    drag.pointerId = null;

    canvasmappy.style.cursor = "grab";

    if (
        canvasmappy.hasPointerCapture &&
        canvasmappy.hasPointerCapture(event.pointerId)
    ) {
        canvasmappy.releasePointerCapture(event.pointerId);
    }
}


function pointsMapPointerCancel(event) {
    if (pointsMapListenerInactive(event)) return;

    var canvasmappy = event.currentTarget;
    var drag = canvasmappy.__pointsDrag;

    drag.active = false;
    drag.pointerId = null;
    drag.moved = false;
    drag.totalMovement = 0;

    canvasmappy.style.cursor = "grab";
}


function pointsMapClick(event) {
    if (pointsMapListenerInactive(event)) return;

    var canvasmappy = event.currentTarget;
    var drag = canvasmappy.__pointsDrag;

    if (drag.moved) {
        drag.moved = false;
        return;
    }

    var rect = canvasmappy.getBoundingClientRect();
    var clickX = event.clientX - rect.left;
    var clickY = event.clientY - rect.top;

    var hits = canvasmappy.__pointsSwitchHits || [];

    function distanceToSegmentSquared(px, py, x1, y1, x2, y2) {
        var dx = x2 - x1;
        var dy = y2 - y1;

        if (dx === 0 && dy === 0) {
            dx = px - x1;
            dy = py - y1;
            return dx * dx + dy * dy;
        }

        var t = (
            (px - x1) * dx +
            (py - y1) * dy
        ) / (dx * dx + dy * dy);

        t = Math.max(0, Math.min(1, t));

        var nearestX = x1 + t * dx;
        var nearestY = y1 + t * dy;

        dx = px - nearestX;
        dy = py - nearestY;

        return dx * dx + dy * dy;
    }

    for (var i = hits.length - 1; i >= 0; i--) {
        var hit = hits[i];

        var dx = clickX - hit.x;
        var dy = clickY - hit.y;

        var clickedMarker =
        dx * dx + dy * dy <= hit.radius * hit.radius;

        var clickedArmA =
        distanceToSegmentSquared(
            clickX,
            clickY,
            hit.armA.x1,
            hit.armA.y1,
            hit.armA.x2,
            hit.armA.y2
        ) <= 18 * 18;

        var clickedArmB =
        distanceToSegmentSquared(
            clickX,
            clickY,
            hit.armB.x1,
            hit.armB.y1,
            hit.armB.x2,
            hit.armB.y2
        ) <= 18 * 18;

        if (clickedMarker || clickedArmA || clickedArmB) {
            if (allow_points_change){
            trackSwitches[hit.index][4] =
            !trackSwitches[hit.index][4];
            updatepoints();
            populateCurrentRouteItems();
            refresh_waiting_passenger_platforms();
            }
            pointsMapDraw();
            return;
        }
    }
}


function pointsMapZoomIn(event) {
    if (pointsMapListenerInactive(event)) return;

    event.preventDefault();
    event.stopPropagation();

    var canvasmappy = pointsMapGetCanvas();

    if (canvasmappy) {
        pointsMapZoomAt(
            canvasmappy,
            1.25,
            canvasmappy.clientWidth / 2,
            canvasmappy.clientHeight / 2
        );
    }
}


function pointsMapZoomOut(event) {
    if (pointsMapListenerInactive(event)) return;

    event.preventDefault();
    event.stopPropagation();

    var canvasmappy = pointsMapGetCanvas();

    if (canvasmappy) {
        pointsMapZoomAt(
            canvasmappy,
            0.8,
            canvasmappy.clientWidth / 2,
            canvasmappy.clientHeight / 2
        );
    }
}


function pointsMapToScale(event) {
    if (pointsMapListenerInactive(event)) return;

    event.preventDefault();
    event.stopPropagation();

    pointsMapSetMode("scale");
}


function pointsMapEnhanced(event) {
    if (pointsMapListenerInactive(event)) return;

    event.preventDefault();
    event.stopPropagation();

    pointsMapSetMode("enhanced");
}


function pointsMapResetZoom(event) {
    if (pointsMapListenerInactive(event)) return;

    event.preventDefault();
    event.stopPropagation();

    var canvasmappy = pointsMapGetCanvas();

    if (!canvasmappy || !canvasmappy.__pointsView) return;

    canvasmappy.__pointsView.scale = 1;
    canvasmappy.__pointsView.panX = 0;
    canvasmappy.__pointsView.panY = 0;

    pointsMapDraw();
}


function pointsMapResize(event) {
    if (pointsMapListenerInactive(event)) return;

    pointsMapDraw();
}






/////////////////  this could be minified once done





















































































function set_bogie_positions() {
    var EPS = 1e-7;
    var MAX_DISTANCE_STEP = 0.5;

    var routeObject =
    typeof route !== "undefined" && route
    ? route
    : null;

    var samples =
    routeObject && Array.isArray(routeObject.samples)
    ? routeObject.samples
    : [];

    var railTracks =
    routeObject && Array.isArray(routeObject.rails)
    ? routeObject.rails
    : [];

    var coachCount = Math.floor(Number(coaches));

    if (!Number.isFinite(coachCount) || coachCount < 0) {
        coachCount = 0;
    }

    var coachLengthValue = Number(coachlength);

    if (
        !Number.isFinite(coachLengthValue) ||
        coachLengthValue <= 0
    ) {
        coachLengthValue = 22;
    }

    var cabOverhangValue = Number(cab_overhang);

    if (!Number.isFinite(cabOverhangValue)) {
        cabOverhangValue = 0;
    }

    var nominalTrainLength =
    coachCount * coachLengthValue +
    cabOverhangValue * 2;

    if (samples.length < 2) {
        bogies = [];
        bogies_npc = [];
        bogies_angle = [];
        bogies_angle_npc = [];
        coach_positions = [];
        coach_positions_npc = [];

        adjusted_train_length = nominalTrainLength;

        return;
    }

    var firstDistance = Number(samples[0].d);
    var lastDistance = Number(samples[samples.length - 1].d);

    if (!Number.isFinite(firstDistance)) firstDistance = 0;
    if (!Number.isFinite(lastDistance)) lastDistance = firstDistance;

    var bogiePercentage = Number(trains_bogies_percentage);

    if (!Number.isFinite(bogiePercentage)) {
        bogiePercentage = 50;
    }

    bogiePercentage = Math.max(
        0,
        Math.min(100, bogiePercentage)
    );

    // ------------------------------------------------------------
    // PREPARE ROUTING
    // ------------------------------------------------------------

    function prepareRouting(source) {
        if (!Array.isArray(source)) {
            return [];
        }

        var result = [];

        for (var i = 0; i < source.length; i++) {
            var entry = source[i];

            if (!Array.isArray(entry) || entry.length < 2) {
                continue;
            }

            var distance = Number(entry[0]);
            var rail = Number(entry[1]);

            if (
                !Number.isFinite(distance) ||
                !Number.isFinite(rail)
            ) {
                continue;
            }

            result.push({
                distance: distance,
                rail: rail,
                order: i
            });
        }

        result.sort(function(a, b) {
            return (
                a.distance - b.distance ||
                a.order - b.order
            );
        });

        return result;
    }

    function getRailAtRouteDistance(
        routing,
        distance,
        fallbackRail
    ) {
        var activeRail = Number(fallbackRail);

        if (!Number.isFinite(activeRail)) {
            activeRail = 0;
        }

        var low = 0;
        var high = routing.length - 1;
        var found = -1;

        while (low <= high) {
            var middle = Math.floor((low + high) * 0.5);

            if (routing[middle].distance <= distance + EPS) {
                found = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }

        if (found >= 0) {
            activeRail = routing[found].rail;
        }

        return activeRail;
    }

    function getPreviousRoutingBoundary(routing, distance) {
        var low = 0;
        var high = routing.length;

        while (low < high) {
            var middle = Math.floor((low + high) * 0.5);

            if (routing[middle].distance < distance - EPS) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }

        var previousIndex = low - 1;

        if (previousIndex < 0) {
            return firstDistance;
        }

        return Math.max(
            firstDistance,
            routing[previousIndex].distance
        );
    }

    // ------------------------------------------------------------
    // MASTER ROUTE VERTICAL GRADIENT
    // ------------------------------------------------------------

    function masterVerticalGradientAt(distance) {
        var low;
        var high;

        if (distance <= firstDistance) {
            low = 0;
            high = 1;

        } else if (distance >= lastDistance) {
            low = samples.length - 2;
            high = samples.length - 1;

        } else {
            low = 0;
            high = samples.length - 1;

            while (low + 1 < high) {
                var middle = Math.floor((low + high) * 0.5);

                if (Number(samples[middle].d) <= distance) {
                    low = middle;
                } else {
                    high = middle;
                }
            }
        }

        var a = samples[low];
        var b = samples[high];

        var span = Number(b.d) - Number(a.d);

        if (span <= EPS) return 0;

        return (
            Number(b.y) - Number(a.y)
        ) / span;
    }

    // ------------------------------------------------------------
    // ACTUAL RAIL OFFSET
    // ------------------------------------------------------------

    function getRailTrackAt(rail, distance) {
        if (Number(rail) === 0) return null;

        for (var track of railTracks) {
            if (Number(track.rail) !== Number(rail)) {
                continue;
            }

            var start = Number(track.startDistance);
            var end = Number(track.endDistance);

            if (
                Number.isFinite(start) &&
                Number.isFinite(end) &&
                distance >= start - EPS &&
                distance <= end + EPS
            ) {
                return track;
            }

            if (Array.isArray(track.segments)) {
                for (var segment of track.segments) {
                    var a = Number(segment.a && segment.a.d);
                    var b = Number(segment.b && segment.b.d);

                    if (
                        Number.isFinite(a) &&
                        Number.isFinite(b) &&
                        distance >= Math.min(a, b) - EPS &&
                        distance <= Math.max(a, b) + EPS
                    ) {
                        return track;
                    }
                }
            }
        }

        // Allow the first rail section to extend behind the route start.
        if (distance < firstDistance) {
            for (var track of railTracks) {
                if (Number(track.rail) !== Number(rail)) {
                    continue;
                }

                var trackStart = Number(track.startDistance);

                if (!Number.isFinite(trackStart)) {
                    trackStart = Infinity;

                    if (Array.isArray(track.segments)) {
                        for (var segment of track.segments) {
                            var a = Number(segment.a && segment.a.d);
                            var b = Number(segment.b && segment.b.d);

                            if (Number.isFinite(a)) {
                                trackStart = Math.min(trackStart, a);
                            }

                            if (Number.isFinite(b)) {
                                trackStart = Math.min(trackStart, b);
                            }
                        }
                    }
                }

                if (Math.abs(trackStart - firstDistance) <= EPS) {
                    return track;
                }
            }
        }

        return null;
    }

    function getRailOffsetAt(rail, distance) {
        var centreline = {
            x: 0,
            y: 0,
            dx: 0,
            dy: 0
        };

        if (Number(rail) === 0) {
            return centreline;
        }

        var track = getRailTrackAt(rail, distance);

        if (!track) return centreline;

        var trackStart = Number(track.startDistance);
        var trackEnd = Number(track.endDistance);

        if (Array.isArray(track.segments)) {
            for (var segment of track.segments) {
                var a = Number(segment.a && segment.a.d);
                var b = Number(segment.b && segment.b.d);

                if (Number.isFinite(a)) {
                    trackStart = Number.isFinite(trackStart)
                    ? Math.min(trackStart, a)
                    : a;
                }

                if (Number.isFinite(b)) {
                    trackEnd = Number.isFinite(trackEnd)
                    ? Math.max(trackEnd, b)
                    : b;
                }
            }
        }

        var lookupDistance = distance;

        if (
            Number.isFinite(trackStart) &&
            Number.isFinite(trackEnd)
        ) {
            lookupDistance = Math.max(
                trackStart,
                Math.min(trackEnd, distance)
            );
        }

        var offset = interpolateRailOffset(
            track,
            lookupDistance
        );

        if (!offset) return centreline;

        var x = Number(offset.x);
        var y = Number(offset.y);
        var dx = Number(offset.dx);
        var dy = Number(offset.dy);

        return {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            dx: Number.isFinite(dx) ? dx : 0,
            dy: Number.isFinite(dy) ? dy : 0
        };
    }
    window.getPassengerRailOffsetAt = getRailOffsetAt;
    // ------------------------------------------------------------
    // TRACK POSITION AND YAW
    // ------------------------------------------------------------

    // Shared by player and NPC calculations during this frame.
    var trackGeometryCache = new Map();

    function getTrackGeometryAt(distance, rail) {

        var railKey = Number(rail);
        var railCache = trackGeometryCache.get(railKey);

        if (!railCache) {
            railCache = new Map();
            trackGeometryCache.set(railKey, railCache);
        }

        if (railCache.has(distance)) {
            return railCache.get(distance);
        }

        var sample = sampleAt(distance, false);

        if (!sample) {

            var nearestDistance = Infinity;

            for (var candidate of samples) {

                var candidateDistance = Number(candidate.d);

                if (!Number.isFinite(candidateDistance)) {
                    continue;
                }

                var gap = Math.abs(candidateDistance - distance);

                if (gap < nearestDistance) {
                    nearestDistance = gap;
                    sample = candidate;
                }
            }
        }

        if (!sample) {
            railCache.set(distance, null);
            return null;
        }

        var offset = getRailOffsetAt(rail, distance);

        if (!offset) {
            offset = {
                x: 0,
                y: 0,
                dx: 0,
                dy: 0
            };
        }

        var curvature = Number(sample.curvature);

        if (!Number.isFinite(curvature)) {
            curvature = 0;
        }

        var along = 1 - curvature * offset.x;
        var across = offset.dx;

        var verticalGradient = masterVerticalGradientAt(distance);

        if (!Number.isFinite(verticalGradient)) {
            verticalGradient = 0;
        }

        var vertical = verticalGradient + offset.dy;

        var horizontalRate = Math.hypot(along, across);

        var distanceRate = Math.hypot(
            along,
            across,
            vertical
        );

        if (
            !Number.isFinite(distanceRate) ||
            distanceRate <= EPS
        ) {
            distanceRate = 1;
        }

        var sampleY = Number(sample.y);

        if (!Number.isFinite(sampleY)) {
            sampleY = 0;
        }

        var result = {
            x: offset.x,
            y: sampleY + offset.y,
            z: distance,

            yaw: Number(rail) === 0
            ? 0
            : Math.atan2(across, along),

            pitch: -Math.atan2(vertical, horizontalRate),

            distanceRate: distanceRate
        };

        railCache.set(distance, result);

        return result;
    }

    // ------------------------------------------------------------
    // PHYSICAL DISTANCE ALONG RAIL
    // ------------------------------------------------------------

    function integrateRailDistance(distance0, distance1, rail) {
        if (distance1 <= distance0) return 0;

        var midpoint = (distance0 + distance1) * 0.5;

        var point0 = getTrackGeometryAt(distance0, rail);
        var pointMid = getTrackGeometryAt(midpoint, rail);
        var point1 = getTrackGeometryAt(distance1, rail);

        if (!point0 || !pointMid || !point1) {
            return null;
        }

        return (distance1 - distance0) / 6 * (
            point0.distanceRate +
            4 * pointMid.distanceRate +
            point1.distanceRate
        );
    }

    // ------------------------------------------------------------
    // FIND CUMULATIVE BOGIE POSITIONS
    // ------------------------------------------------------------




    function getDistancesBehindTrain(
        position,
        targetDistances,
        routing,
        frontRail
    ) {

        var result = [];

        var cursor = Number(position);

        if (!Number.isFinite(cursor)) {
            cursor = firstDistance;
        }

        var startRail = getRailAtRouteDistance(
            routing,
            firstDistance + EPS * 10,
            frontRail
        );

        var previousTargetDistance = 0;

        // These indexes move backwards through the sorted routing
        // array. They are reset for each train, not each bogie.
        var boundaryIndex = routing.length - 1;
        var railIndex = routing.length - 1;

        for (
            var targetIndex = 0;
        targetIndex < targetDistances.length;
        targetIndex++
        ) {

            var targetDistance = Number(
                targetDistances[targetIndex]
            );

            if (!Number.isFinite(targetDistance)) {
                targetDistance = previousTargetDistance;
            }

            var remaining =
            targetDistance - previousTargetDistance;

            if (remaining < 0) {
                remaining = 0;
            }

            var iterations = 0;

            while (remaining > EPS) {

                if (++iterations > 200000) {
                    cursor -= remaining;
                    remaining = 0;
                    break;
                }

                var beforeRouteStart =
                cursor <= firstDistance + EPS;

                // ------------------------------------------------
                // FIND THE PREVIOUS ROUTING BOUNDARY
                //
                // Exactly the same strict EPS comparison as the
                // original getPreviousRoutingBoundary().
                // ------------------------------------------------

                var boundary;

                if (beforeRouteStart) {

                    boundary = firstDistance;

                } else {

                    while (
                        boundaryIndex >= 0 &&
                        !(
                            routing[boundaryIndex].distance <
                            cursor - EPS
                        )
                    ) {
                        boundaryIndex--;
                    }

                    boundary = boundaryIndex < 0
                    ? firstDistance
                    : Math.max(
                        firstDistance,
                        routing[boundaryIndex].distance
                    );
                }

                var available = cursor - boundary;

                var step = beforeRouteStart || available <= EPS
                ? MAX_DISTANCE_STEP
                : Math.min(MAX_DISTANCE_STEP, available);

                if (!Number.isFinite(step) || step <= EPS) {
                    cursor -= remaining;
                    remaining = 0;
                    break;
                }

                var distance0 = cursor - step;
                var distance1 = cursor;

                // ------------------------------------------------
                // DETERMINE THE RAIL FOR THIS INTERVAL
                //
                // Routing is selected at the interval midpoint,
                // exactly as in the original function.
                //
                // This is what preserves branch-track switching.
                // ------------------------------------------------

                var intervalRail;

                if (beforeRouteStart) {

                    intervalRail = startRail;

                } else {

                    var midpoint =
                    (distance0 + distance1) * 0.5;

                    while (
                        railIndex >= 0 &&
                        routing[railIndex].distance > midpoint + EPS
                    ) {
                        railIndex--;
                    }

                    intervalRail = railIndex >= 0
                    ? routing[railIndex].rail
                    : Number(frontRail);

                    if (!Number.isFinite(intervalRail)) {
                        intervalRail = 0;
                    }
                }

                // ------------------------------------------------
                // EXACT ORIGINAL SIMPSON INTEGRATION
                // ------------------------------------------------

                var segmentLength = integrateRailDistance(
                    distance0,
                    distance1,
                    intervalRail
                );

                if (
                    segmentLength === null ||
                    !Number.isFinite(segmentLength) ||
                    segmentLength <= EPS
                ) {
                    cursor -= remaining;
                    remaining = 0;
                    break;
                }

                if (segmentLength <= remaining + EPS) {

                    cursor = distance0;

                    remaining = Math.max(
                        0,
                        remaining - segmentLength
                    );

                } else {

                    // ------------------------------------------------
                    // EXACT ORIGINAL 24-ITERATION BISECTION
                    // ------------------------------------------------

                    var low = distance0;
                    var high = distance1;
                    var integrationFailed = false;

                    for (var iteration = 0; iteration < 14; iteration++) {

                        var middle = (low + high) * 0.5;

                        var partialLength = integrateRailDistance(
                            middle,
                            distance1,
                            intervalRail
                        );

                        if (
                            partialLength === null ||
                            !Number.isFinite(partialLength)
                        ) {
                            integrationFailed = true;
                            break;
                        }

                        if (partialLength > remaining) {
                            low = middle;
                        } else {
                            high = middle;
                        }
                    }

                    cursor = integrationFailed
                    ? distance1 - remaining
                    : (low + high) * 0.5;

                    remaining = 0;
                }
            }

            result.push(cursor);

            previousTargetDistance = targetDistance;
        }

        return result;
    }



    // ------------------------------------------------------------
    // ANGLE MIDPOINT
    // ------------------------------------------------------------

    function angleMidpoint(angleA, angleB) {
        var difference = angleB - angleA;

        while (difference > Math.PI) {
            difference -= Math.PI * 2;
        }

        while (difference < -Math.PI) {
            difference += Math.PI * 2;
        }

        var result = angleA + difference * 0.5;

        while (result > Math.PI) {
            result -= Math.PI * 2;
        }

        while (result < -Math.PI) {
            result += Math.PI * 2;
        }

        return result;
    }

    // ------------------------------------------------------------
    // BUILD ONE TRAIN
    // ------------------------------------------------------------






    // ------------------------------------------------------------
    // BUILD ONE TRAIN
    // ------------------------------------------------------------

    function buildTrain(position, fallbackRail, routing) {

        // --------------------------------------------------------
        // DETERMINE THE FRONT RAIL
        // --------------------------------------------------------

        var frontRail = getRailAtRouteDistance(
            routing,
            position,
            fallbackRail
        );

        // --------------------------------------------------------
        // DETERMINE BOGIE DISTANCES
        // --------------------------------------------------------

        var targetDistances = [];

        if (Jacobs_bogies === true) {

            // Jacobs configuration:
            // One bogie at each coach boundary.

            for (var b = 0; b <= coachCount; b++) {

                targetDistances.push(
                    cabOverhangValue +
                    b * coachLengthValue
                );
            }

        } else {

            // Conventional configuration:
            // Two bogies per coach.

            var frontOffset =
            coachLengthValue *
            (100 - bogiePercentage) / 200;

            var rearOffset =
            coachLengthValue *
            (100 + bogiePercentage) / 200;

            for (var c = 0; c < coachCount; c++) {

                targetDistances.push(
                    cabOverhangValue +
                    c * coachLengthValue +
                    frontOffset
                );

                targetDistances.push(
                    cabOverhangValue +
                    c * coachLengthValue +
                    rearOffset
                );
            }
        }

        // --------------------------------------------------------
        // CALCULATE ROUTE DISTANCES OF EVERY BOGIE
        // --------------------------------------------------------



        var distances = getDistancesBehindTrain(
            position,
            targetDistances,
            routing,
            frontRail
        );



        var trainBogies = [];
        var trainAngles = [];

        // --------------------------------------------------------
        // BUILD BOGIE ARRAYS
        //
        // bogies:
        // [routeDistance, rail, lateralOffsetX, trackPositionY]
        //
        // angles:
        // [yaw relative to master route heading]
        // --------------------------------------------------------

        for (var i = 0; i < distances.length; i++) {

            var distance = distances[i];

            if (
                distance === null ||
                !Number.isFinite(Number(distance))
            ) {

                trainBogies.push([
                    null,
                    null,
                    null,
                    null,
                    null
                ]);

                trainAngles.push(null);

                continue;
            }

            // Determine which rail the bogie is on.
            var rail = distance < firstDistance - EPS
            ? getRailAtRouteDistance(
                routing,
                firstDistance + EPS * 10,
                frontRail
            )
            : getRailAtRouteDistance(
                routing,
                distance,
                frontRail
            );

            // Get the actual track geometry.
            var geometry = getTrackGeometryAt(
                distance,
                rail
            );

            if (
                !geometry ||
                !Number.isFinite(Number(geometry.x)) ||
                !Number.isFinite(Number(geometry.y)) ||
                !Number.isFinite(Number(geometry.yaw))
            ) {

                trainBogies.push([
                    distance,
                    rail,
                    null,
                    null,
                    null,
                    null
                ]);

                trainAngles.push(null);

                continue;
            }

            trainBogies.push([
                distance,
                rail,
                Number(geometry.x),
                             Number(geometry.y),
                             Number(geometry.pitch)
            ]);

            trainAngles.push(
                Number(geometry.yaw)
            );
        }

        // ========================================================
        // BUILD COACH POSITIONS
        //
        // Every coach is positioned between its two bogie pivots.
        //
        // Conventional:
        // Two bogies within each coach.
        //
        // Jacobs:
        // Two shared boundary bogies for each coach.
        //
        // Neither cab nor non-cab overhang affects the position.
        // Those measurements only affect the floor dimensions.
        // ========================================================

        var trainCoaches = [];

        // --------------------------------------------------------
        // NORMALISE AN ANGLE TO -PI ... +PI
        // --------------------------------------------------------

        function normaliseCoachAngle(angle) {

            while (angle > Math.PI) {
                angle -= Math.PI * 2;
            }

            while (angle < -Math.PI) {
                angle += Math.PI * 2;
            }

            return angle;
        }

        // --------------------------------------------------------
        // GET THE WORLD POSITION OF A BOGIE PIVOT
        //
        // The track geometry supplies the lateral and vertical
        // offsets. worldPoint converts the pivot into world X/Z.
        // --------------------------------------------------------

        function getBogieWorldAnchor(bogie) {

            if (
                !bogie ||
                bogie[0] === null ||
                bogie[2] === null ||
                bogie[3] === null
            ) {
                return null;
            }

            var distance = Number(bogie[0]);
            var lateralOffset = Number(bogie[2]);
            var trackY = Number(bogie[3]);

            if (
                !Number.isFinite(distance) ||
                !Number.isFinite(lateralOffset) ||
                !Number.isFinite(trackY)
            ) {
                return null;
            }

            var sample = sampleAt(
                distance,
                false
            );

            if (!sample) return null;

            var point = worldPoint(
                sample,
                lateralOffset,
                0
            );

            if (
                !point ||
                !Number.isFinite(Number(point.x)) ||
                !Number.isFinite(Number(point.z))
            ) {
                return null;
            }

            return {
                distance: distance,
                lateralOffset: lateralOffset,
                trackY: trackY,

                x: Number(point.x),
                z: Number(point.z),

                heading: Number(sample.heading)
            };
        }

        // --------------------------------------------------------
        // CALCULATE EACH COACH FROM ITS TWO BOGIE PIVOTS
        // --------------------------------------------------------

        for (var c = 0; c < coachCount; c++) {

            // Find the two bogies belonging to this coach.
            var bogieIndexA = Jacobs_bogies === true
            ? c
            : c * 2;

            var bogieIndexB = bogieIndexA + 1;

            var bogieA = trainBogies[bogieIndexA];
            var bogieB = trainBogies[bogieIndexB];

            // Get their yaw values.
            var angleA = trainAngles[bogieIndexA];
            var angleB = trainAngles[bogieIndexB];

            // Get their exact world positions.
            var anchorA = getBogieWorldAnchor(bogieA);
            var anchorB = getBogieWorldAnchor(bogieB);

            if (!anchorA || !anchorB) {

                trainCoaches.push(null);

                continue;
            }

            // ----------------------------------------------------
            // COACH CENTRE
            //
            // The coach reference position is exactly halfway
            // between its two bogie pivots.
            // ----------------------------------------------------

            var centreDistance = (
                anchorA.distance +
                anchorB.distance
            ) * 0.5;

            var centreLateral = (
                anchorA.lateralOffset +
                anchorB.lateralOffset
            ) * 0.5;

            var centreTrackY = (
                anchorA.trackY +
                anchorB.trackY
            ) * 0.5;

            // Exact midpoint in world coordinates.
            var centreWorldX = (
                anchorA.x +
                anchorB.x
            ) * 0.5;

            var centreWorldZ = (
                anchorA.z +
                anchorB.z
            ) * 0.5;

            // ----------------------------------------------------
            // COACH YAW
            //
            // The front bogie is A.
            // The rear bogie is B.
            //
            // The coach heading follows the straight chord
            // between the two bogie pivots.
            // ----------------------------------------------------

            var dx = anchorA.x - anchorB.x;
            var dz = anchorA.z - anchorB.z;

            var horizontalSpan = Math.hypot(
                dx,
                dz
            );

            // Obtain the master route heading at the coach centre.
            var coachSample = sampleAt(
                centreDistance,
                false
            );

            // Fall back to either bogie's heading if required.
            var masterHeading = 0;

            if (
                coachSample &&
                Number.isFinite(Number(coachSample.heading))
            ) {

                masterHeading = Number(
                    coachSample.heading
                );

            } else if (
                Number.isFinite(anchorA.heading)
            ) {

                masterHeading = anchorA.heading;

            } else if (
                Number.isFinite(anchorB.heading)
            ) {

                masterHeading = anchorB.heading;
            }

            // Fallback if the two pivots are effectively coincident.
            var fallbackAngle = angleMidpoint(
                Number.isFinite(Number(angleA))
                ? Number(angleA)
                : 0,

                Number.isFinite(Number(angleB))
                ? Number(angleB)
                : 0
            );

            // Absolute world heading.
            var worldYaw = horizontalSpan > EPS
            ? Math.atan2(dx, dz)
            : masterHeading + fallbackAngle;

            // Store yaw relative to the master route heading
            // for compatibility with the existing camera and map.
            var relativeYaw = normaliseCoachAngle(
                worldYaw - masterHeading
            );

            // ----------------------------------------------------
            // COACH PITCH
            //
            // The two bogie pivot heights determine the slope.
            //
            // Positive local Z is the front of the coach.
            // With the standard right-handed X rotation convention,
            // the sign below gives the correct front-up/front-down
            // slope.
            // ----------------------------------------------------

            var coachPitch = horizontalSpan > EPS
            ? Math.atan2(
                anchorB.trackY - anchorA.trackY,
                horizontalSpan
            )
            : 0;

            // ----------------------------------------------------
            // STORE COACH POSITION
            //
            // [0] Average lateral offset
            // [1] Average route distance
            // [2] Relative yaw
            // [3] Average track elevation
            // [4] Exact world X midpoint
            // [5] Exact world Z midpoint
            // [6] Coach pitch
            // [7] Absolute world yaw
            // ----------------------------------------------------

            trainCoaches.push([

                centreLateral,
                centreDistance,
                relativeYaw,
                centreTrackY,

                centreWorldX,
                centreWorldZ,

                coachPitch,
                worldYaw

            ]);
        }

        // ========================================================
        // RETURN TRAIN DATA
        //
        // IMPORTANT:
        // This return must remain outside the coach loop.
        // Both playerTrain and npcTrain depend on this object.
        // ========================================================

        return {
            frontRail: frontRail,
            bogies: trainBogies,
            angles: trainAngles,
            coaches: trainCoaches
        };

    }










    // ------------------------------------------------------------
    // PLAYER TRAIN
    // ------------------------------------------------------------

    var playerRouting = prepareRouting(
        typeof current_route_items_routing !== "undefined"
        ? current_route_items_routing
        : []
    );

    var playerTrain = buildTrain(
        pos,
        current_track,
        playerRouting
    );

    bogies = playerTrain.bogies;
    bogies_angle = playerTrain.angles;
    coach_positions = playerTrain.coaches;
    current_track = playerTrain.frontRail;

    // ------------------------------------------------------------
    // ADJUSTED TRAIN LENGTH
    //
    // Calculate the distance in the route Z direction between
    // the outer ends of the first and last coach.
    //
    // This uses each end coach's actual yaw.
    // non_cab_overhang is deliberately excluded.
    // ------------------------------------------------------------

    adjusted_train_length = nominalTrainLength;

    if (
        coach_positions.length > 0 &&
        coach_positions[0] &&
        coach_positions[coach_positions.length - 1]
    ) {
        var firstCoach = coach_positions[0];
        var lastCoach = coach_positions[coach_positions.length - 1];

        var firstCoachZ = Number(firstCoach[1]);
        var firstCoachYaw = Number(firstCoach[2]);

        var lastCoachZ = Number(lastCoach[1]);
        var lastCoachYaw = Number(lastCoach[2]);

        if (
            Number.isFinite(firstCoachZ) &&
            Number.isFinite(firstCoachYaw) &&
            Number.isFinite(lastCoachZ) &&
            Number.isFinite(lastCoachYaw)
        ) {
            var halfCoachWithCab =
            coachLengthValue * 0.5 +
            cabOverhangValue;

            var frontTrainZ =
            firstCoachZ +
            Math.cos(firstCoachYaw) * halfCoachWithCab;

            var rearTrainZ =
            lastCoachZ -
            Math.cos(lastCoachYaw) * halfCoachWithCab;

            var calculatedLength = Math.abs(
                frontTrainZ - rearTrainZ
            );

            if (Number.isFinite(calculatedLength)) {
                adjusted_train_length = calculatedLength;
            }
        }
    }

    // ------------------------------------------------------------
    // NPC TRAIN
    // ------------------------------------------------------------

    var npcRouting = prepareRouting(
        typeof current_route_items_routing_npc !== "undefined"
        ? current_route_items_routing_npc
        : []
    );

    var npcTrain = buildTrain(
        pos_npc,
        current_track_npc,
        npcRouting
    );

    bogies_npc = npcTrain.bogies;
    bogies_angle_npc = npcTrain.angles;
    coach_positions_npc = npcTrain.coaches;
    current_track_npc = npcTrain.frontRail;
}

























































































/*



function set_bogie_positions() {
    var EPS = 1e-7;
    var MAX_DISTANCE_STEP = 0.5;

    var routeObject =
    typeof route !== "undefined" && route
    ? route
    : null;

    var samples =
    routeObject && Array.isArray(routeObject.samples)
    ? routeObject.samples
    : [];

    var railTracks =
    routeObject && Array.isArray(routeObject.rails)
    ? routeObject.rails
    : [];

    var coachCount = Math.floor(Number(coaches));

    if (!Number.isFinite(coachCount) || coachCount < 0) {
        coachCount = 0;
    }

    var coachLengthValue = Number(coachlength);

    if (
        !Number.isFinite(coachLengthValue) ||
        coachLengthValue <= 0
    ) {
        coachLengthValue = 22;
    }

    var cabOverhangValue = Number(cab_overhang);

    if (!Number.isFinite(cabOverhangValue)) {
        cabOverhangValue = 0;
    }

    var nominalTrainLength =
    coachCount * coachLengthValue +
    cabOverhangValue * 2;

    if (samples.length < 2) {
        bogies = [];
        bogies_npc = [];
        bogies_angle = [];
        bogies_angle_npc = [];
        coach_positions = [];
        coach_positions_npc = [];

        adjusted_train_length = nominalTrainLength;

        return;
    }

    var firstDistance = Number(samples[0].d);
    var lastDistance = Number(samples[samples.length - 1].d);

    if (!Number.isFinite(firstDistance)) firstDistance = 0;
    if (!Number.isFinite(lastDistance)) lastDistance = firstDistance;

    var bogiePercentage = Number(trains_bogies_percentage);

    if (!Number.isFinite(bogiePercentage)) {
        bogiePercentage = 50;
    }

    bogiePercentage = Math.max(
        0,
        Math.min(100, bogiePercentage)
    );

    // ------------------------------------------------------------
    // PREPARE ROUTING
    // ------------------------------------------------------------

    function prepareRouting(source) {
        if (!Array.isArray(source)) {
            return [];
        }

        var result = [];

        for (var i = 0; i < source.length; i++) {
            var entry = source[i];

            if (!Array.isArray(entry) || entry.length < 2) {
                continue;
            }

            var distance = Number(entry[0]);
            var rail = Number(entry[1]);

            if (
                !Number.isFinite(distance) ||
                !Number.isFinite(rail)
            ) {
                continue;
            }

            result.push({
                distance: distance,
                rail: rail,
                order: i
            });
        }

        result.sort(function(a, b) {
            return (
                a.distance - b.distance ||
                a.order - b.order
            );
        });

        return result;
    }

    function getRailAtRouteDistance(
        routing,
        distance,
        fallbackRail
    ) {
        var activeRail = Number(fallbackRail);

        if (!Number.isFinite(activeRail)) {
            activeRail = 0;
        }

        var low = 0;
        var high = routing.length - 1;
        var found = -1;

        while (low <= high) {
            var middle = Math.floor((low + high) * 0.5);

            if (routing[middle].distance <= distance + EPS) {
                found = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }

        if (found >= 0) {
            activeRail = routing[found].rail;
        }

        return activeRail;
    }

    function getPreviousRoutingBoundary(routing, distance) {
        var low = 0;
        var high = routing.length;

        while (low < high) {
            var middle = Math.floor((low + high) * 0.5);

            if (routing[middle].distance < distance - EPS) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }

        var previousIndex = low - 1;

        if (previousIndex < 0) {
            return firstDistance;
        }

        return Math.max(
            firstDistance,
            routing[previousIndex].distance
        );
    }

    // ------------------------------------------------------------
    // MASTER ROUTE VERTICAL GRADIENT
    // ------------------------------------------------------------

    function masterVerticalGradientAt(distance) {
        var low;
        var high;

        if (distance <= firstDistance) {
            low = 0;
            high = 1;

        } else if (distance >= lastDistance) {
            low = samples.length - 2;
            high = samples.length - 1;

        } else {
            low = 0;
            high = samples.length - 1;

            while (low + 1 < high) {
                var middle = Math.floor((low + high) * 0.5);

                if (Number(samples[middle].d) <= distance) {
                    low = middle;
                } else {
                    high = middle;
                }
            }
        }

        var a = samples[low];
        var b = samples[high];

        var span = Number(b.d) - Number(a.d);

        if (span <= EPS) return 0;

        return (
            Number(b.y) - Number(a.y)
        ) / span;
    }

    // ------------------------------------------------------------
    // ACTUAL RAIL OFFSET
    // ------------------------------------------------------------

    function getRailTrackAt(rail, distance) {
        if (Number(rail) === 0) return null;

        for (var track of railTracks) {
            if (Number(track.rail) !== Number(rail)) {
                continue;
            }

            var start = Number(track.startDistance);
            var end = Number(track.endDistance);

            if (
                Number.isFinite(start) &&
                Number.isFinite(end) &&
                distance >= start - EPS &&
                distance <= end + EPS
            ) {
                return track;
            }

            if (Array.isArray(track.segments)) {
                for (var segment of track.segments) {
                    var a = Number(segment.a && segment.a.d);
                    var b = Number(segment.b && segment.b.d);

                    if (
                        Number.isFinite(a) &&
                        Number.isFinite(b) &&
                        distance >= Math.min(a, b) - EPS &&
                        distance <= Math.max(a, b) + EPS
                    ) {
                        return track;
                    }
                }
            }
        }

        // Allow the first rail section to extend behind the route start.
        if (distance < firstDistance) {
            for (var track of railTracks) {
                if (Number(track.rail) !== Number(rail)) {
                    continue;
                }

                var trackStart = Number(track.startDistance);

                if (!Number.isFinite(trackStart)) {
                    trackStart = Infinity;

                    if (Array.isArray(track.segments)) {
                        for (var segment of track.segments) {
                            var a = Number(segment.a && segment.a.d);
                            var b = Number(segment.b && segment.b.d);

                            if (Number.isFinite(a)) {
                                trackStart = Math.min(trackStart, a);
                            }

                            if (Number.isFinite(b)) {
                                trackStart = Math.min(trackStart, b);
                            }
                        }
                    }
                }

                if (Math.abs(trackStart - firstDistance) <= EPS) {
                    return track;
                }
            }
        }

        return null;
    }

    function getRailOffsetAt(rail, distance) {
        var centreline = {
            x: 0,
            y: 0,
            dx: 0,
            dy: 0
        };

        if (Number(rail) === 0) {
            return centreline;
        }

        var track = getRailTrackAt(rail, distance);

        if (!track) return centreline;

        var trackStart = Number(track.startDistance);
        var trackEnd = Number(track.endDistance);

        if (Array.isArray(track.segments)) {
            for (var segment of track.segments) {
                var a = Number(segment.a && segment.a.d);
                var b = Number(segment.b && segment.b.d);

                if (Number.isFinite(a)) {
                    trackStart = Number.isFinite(trackStart)
                    ? Math.min(trackStart, a)
                    : a;
                }

                if (Number.isFinite(b)) {
                    trackEnd = Number.isFinite(trackEnd)
                    ? Math.max(trackEnd, b)
                    : b;
                }
            }
        }

        var lookupDistance = distance;

        if (
            Number.isFinite(trackStart) &&
            Number.isFinite(trackEnd)
        ) {
            lookupDistance = Math.max(
                trackStart,
                Math.min(trackEnd, distance)
            );
        }

        var offset = interpolateRailOffset(
            track,
            lookupDistance
        );

        if (!offset) return centreline;

        var x = Number(offset.x);
        var y = Number(offset.y);
        var dx = Number(offset.dx);
        var dy = Number(offset.dy);

        return {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            dx: Number.isFinite(dx) ? dx : 0,
            dy: Number.isFinite(dy) ? dy : 0
        };
    }
    window.getPassengerRailOffsetAt = getRailOffsetAt;
    // ------------------------------------------------------------
    // TRACK POSITION AND YAW
    // ------------------------------------------------------------

    function getTrackGeometryAt(distance, rail) {

        var sample = sampleAt(distance, false);

        if (!sample) {

            var nearestDistance = Infinity;

            for (var candidate of samples) {

                var candidateDistance = Number(candidate.d);

                if (!Number.isFinite(candidateDistance)) {
                    continue;
                }

                var gap = Math.abs(candidateDistance - distance);

                if (gap < nearestDistance) {
                    nearestDistance = gap;
                    sample = candidate;
                }
            }
        }

        if (!sample) return null;

        var offset = getRailOffsetAt(rail, distance);

        if (!offset) {
            offset = {
                x: 0,
                y: 0,
                dx: 0,
                dy: 0
            };
        }

        var curvature = Number(sample.curvature);

        if (!Number.isFinite(curvature)) {
            curvature = 0;
        }

        var along = 1 - curvature * offset.x;
        var across = offset.dx;

        var verticalGradient = masterVerticalGradientAt(distance);

        if (!Number.isFinite(verticalGradient)) {
            verticalGradient = 0;
        }

        var vertical = verticalGradient + offset.dy;

        var horizontalRate = Math.hypot(
            along,
            across
        );

        var distanceRate = Math.hypot(
            along,
            across,
            vertical
        );

        if (
            !Number.isFinite(distanceRate) ||
            distanceRate <= EPS
        ) {
            distanceRate = 1;
        }

        var sampleY = Number(sample.y);

        if (!Number.isFinite(sampleY)) {
            sampleY = 0;
        }

        return {
            x: offset.x,
            y: sampleY + offset.y,
            z: distance,

            yaw: Number(rail) === 0
            ? 0
            : Math.atan2(across, along),

            // Pitch follows the actual vertical gradient of this rail.
            // Negative pitch means the front of the bogie points upwards.
            pitch: -Math.atan2(vertical, horizontalRate),

            distanceRate: distanceRate
        };
    }

    // ------------------------------------------------------------
    // PHYSICAL DISTANCE ALONG RAIL
    // ------------------------------------------------------------

    function integrateRailDistance(distance0, distance1, rail) {
        if (distance1 <= distance0) return 0;

        var midpoint = (distance0 + distance1) * 0.5;

        var point0 = getTrackGeometryAt(distance0, rail);
        var pointMid = getTrackGeometryAt(midpoint, rail);
        var point1 = getTrackGeometryAt(distance1, rail);

        if (!point0 || !pointMid || !point1) {
            return null;
        }

        return (distance1 - distance0) / 6 * (
            point0.distanceRate +
            4 * pointMid.distanceRate +
            point1.distanceRate
        );
    }

    // ------------------------------------------------------------
    // FIND CUMULATIVE BOGIE POSITIONS
    // ------------------------------------------------------------

    function getDistancesBehindTrain(
        position,
        targetDistances,
        routing,
        frontRail
    ) {
        var result = [];

        var cursor = Number(position);

        if (!Number.isFinite(cursor)) {
            cursor = firstDistance;
        }

        var startRail = getRailAtRouteDistance(
            routing,
            firstDistance + EPS * 10,
            frontRail
        );

        var previousTargetDistance = 0;

        for (
            var targetIndex = 0;
        targetIndex < targetDistances.length;
        targetIndex++
        ) {
            var targetDistance = Number(
                targetDistances[targetIndex]
            );

            if (!Number.isFinite(targetDistance)) {
                targetDistance = previousTargetDistance;
            }

            var remaining =
            targetDistance - previousTargetDistance;

            if (remaining < 0) {
                remaining = 0;
            }

            var iterations = 0;

            while (remaining > EPS) {
                iterations++;

                if (iterations > 200000) {
                    cursor -= remaining;
                    remaining = 0;
                    break;
                }

                var beforeRouteStart =
                cursor <= firstDistance + EPS;

                var boundary = beforeRouteStart
                ? firstDistance
                : getPreviousRoutingBoundary(
                    routing,
                    cursor
                );

                var available = cursor - boundary;

                var step = beforeRouteStart || available <= EPS
                ? MAX_DISTANCE_STEP
                : Math.min(
                    MAX_DISTANCE_STEP,
                    available
                );

                if (!Number.isFinite(step) || step <= EPS) {
                    cursor -= remaining;
                    remaining = 0;
                    break;
                }

                var distance0 = cursor - step;
                var distance1 = cursor;

                var intervalRail = beforeRouteStart
                ? startRail
                : getRailAtRouteDistance(
                    routing,
                    (distance0 + distance1) * 0.5,
                                         frontRail
                );

                var segmentLength = integrateRailDistance(
                    distance0,
                    distance1,
                    intervalRail
                );

                if (
                    segmentLength === null ||
                    !Number.isFinite(segmentLength) ||
                    segmentLength <= EPS
                ) {
                    cursor -= remaining;
                    remaining = 0;
                    break;
                }

                if (segmentLength <= remaining + EPS) {
                    cursor = distance0;
                    remaining = Math.max(
                        0,
                        remaining - segmentLength
                    );

                } else {
                    var low = distance0;
                    var high = distance1;
                    var integrationFailed = false;

                    for (var iteration = 0; iteration < 24; iteration++) {
                        var middle = (low + high) * 0.5;

                        var partialLength = integrateRailDistance(
                            middle,
                            distance1,
                            intervalRail
                        );

                        if (
                            partialLength === null ||
                            !Number.isFinite(partialLength)
                        ) {
                            integrationFailed = true;
                            break;
                        }

                        if (partialLength > remaining) {
                            low = middle;
                        } else {
                            high = middle;
                        }
                    }

                    if (integrationFailed) {
                        cursor = distance1 - remaining;
                    } else {
                        cursor = (low + high) * 0.5;
                    }

                    remaining = 0;
                }
            }

            result.push(cursor);

            previousTargetDistance = targetDistance;
        }

        return result;
    }

    // ------------------------------------------------------------
    // ANGLE MIDPOINT
    // ------------------------------------------------------------

    function angleMidpoint(angleA, angleB) {
        var difference = angleB - angleA;

        while (difference > Math.PI) {
            difference -= Math.PI * 2;
        }

        while (difference < -Math.PI) {
            difference += Math.PI * 2;
        }

        var result = angleA + difference * 0.5;

        while (result > Math.PI) {
            result -= Math.PI * 2;
        }

        while (result < -Math.PI) {
            result += Math.PI * 2;
        }

        return result;
    }

    // ------------------------------------------------------------
    // BUILD ONE TRAIN
    // ------------------------------------------------------------






    // ------------------------------------------------------------
    // BUILD ONE TRAIN
    // ------------------------------------------------------------

    function buildTrain(position, fallbackRail, routing) {

        // --------------------------------------------------------
        // DETERMINE THE FRONT RAIL
        // --------------------------------------------------------

        var frontRail = getRailAtRouteDistance(
            routing,
            position,
            fallbackRail
        );

        // --------------------------------------------------------
        // DETERMINE BOGIE DISTANCES
        // --------------------------------------------------------

        var targetDistances = [];

        if (Jacobs_bogies === true) {

            // Jacobs configuration:
            // One bogie at each coach boundary.

            for (var b = 0; b <= coachCount; b++) {

                targetDistances.push(
                    cabOverhangValue +
                    b * coachLengthValue
                );
            }

        } else {

            // Conventional configuration:
            // Two bogies per coach.

            var frontOffset =
            coachLengthValue *
            (100 - bogiePercentage) / 200;

            var rearOffset =
            coachLengthValue *
            (100 + bogiePercentage) / 200;

            for (var c = 0; c < coachCount; c++) {

                targetDistances.push(
                    cabOverhangValue +
                    c * coachLengthValue +
                    frontOffset
                );

                targetDistances.push(
                    cabOverhangValue +
                    c * coachLengthValue +
                    rearOffset
                );
            }
        }

        // --------------------------------------------------------
        // CALCULATE ROUTE DISTANCES OF EVERY BOGIE
        // --------------------------------------------------------

        var distances = getDistancesBehindTrain(
            position,
            targetDistances,
            routing,
            frontRail
        );

        var trainBogies = [];
        var trainAngles = [];

        // --------------------------------------------------------
        // BUILD BOGIE ARRAYS
        //
        // bogies:
        // [routeDistance, rail, lateralOffsetX, trackPositionY]
        //
        // angles:
        // [yaw relative to master route heading]
        // --------------------------------------------------------

        for (var i = 0; i < distances.length; i++) {

            var distance = distances[i];

            if (
                distance === null ||
                !Number.isFinite(Number(distance))
            ) {

                trainBogies.push([
                    null,
                    null,
                    null,
                    null,
                    null
                ]);

                trainAngles.push(null);

                continue;
            }

            // Determine which rail the bogie is on.
            var rail = distance < firstDistance - EPS
            ? getRailAtRouteDistance(
                routing,
                firstDistance + EPS * 10,
                frontRail
            )
            : getRailAtRouteDistance(
                routing,
                distance,
                frontRail
            );

            // Get the actual track geometry.
            var geometry = getTrackGeometryAt(
                distance,
                rail
            );

            if (
                !geometry ||
                !Number.isFinite(Number(geometry.x)) ||
                !Number.isFinite(Number(geometry.y)) ||
                !Number.isFinite(Number(geometry.yaw))
            ) {

                trainBogies.push([
                    distance,
                    rail,
                    null,
                    null,
                    null,
                    null
                ]);

                trainAngles.push(null);

                continue;
            }

            trainBogies.push([
                distance,
                rail,
                Number(geometry.x),
                Number(geometry.y),
                Number(geometry.pitch)
            ]);

            trainAngles.push(
                Number(geometry.yaw)
            );
        }

        // ========================================================
        // BUILD COACH POSITIONS
        //
        // Every coach is positioned between its two bogie pivots.
        //
        // Conventional:
        // Two bogies within each coach.
        //
        // Jacobs:
        // Two shared boundary bogies for each coach.
        //
        // Neither cab nor non-cab overhang affects the position.
        // Those measurements only affect the floor dimensions.
        // ========================================================

        var trainCoaches = [];

        // --------------------------------------------------------
        // NORMALISE AN ANGLE TO -PI ... +PI
        // --------------------------------------------------------

        function normaliseCoachAngle(angle) {

            while (angle > Math.PI) {
                angle -= Math.PI * 2;
            }

            while (angle < -Math.PI) {
                angle += Math.PI * 2;
            }

            return angle;
        }

        // --------------------------------------------------------
        // GET THE WORLD POSITION OF A BOGIE PIVOT
        //
        // The track geometry supplies the lateral and vertical
        // offsets. worldPoint converts the pivot into world X/Z.
        // --------------------------------------------------------

        function getBogieWorldAnchor(bogie) {

            if (
                !bogie ||
                bogie[0] === null ||
                bogie[2] === null ||
                bogie[3] === null
            ) {
                return null;
            }

            var distance = Number(bogie[0]);
            var lateralOffset = Number(bogie[2]);
            var trackY = Number(bogie[3]);

            if (
                !Number.isFinite(distance) ||
                !Number.isFinite(lateralOffset) ||
                !Number.isFinite(trackY)
            ) {
                return null;
            }

            var sample = sampleAt(
                distance,
                false
            );

            if (!sample) return null;

            var point = worldPoint(
                sample,
                lateralOffset,
                0
            );

            if (
                !point ||
                !Number.isFinite(Number(point.x)) ||
                !Number.isFinite(Number(point.z))
            ) {
                return null;
            }

            return {
                distance: distance,
                lateralOffset: lateralOffset,
                trackY: trackY,

                x: Number(point.x),
                z: Number(point.z),

                heading: Number(sample.heading)
            };
        }

        // --------------------------------------------------------
        // CALCULATE EACH COACH FROM ITS TWO BOGIE PIVOTS
        // --------------------------------------------------------

        for (var c = 0; c < coachCount; c++) {

            // Find the two bogies belonging to this coach.
            var bogieIndexA = Jacobs_bogies === true
            ? c
            : c * 2;

            var bogieIndexB = bogieIndexA + 1;

            var bogieA = trainBogies[bogieIndexA];
            var bogieB = trainBogies[bogieIndexB];

            // Get their yaw values.
            var angleA = trainAngles[bogieIndexA];
            var angleB = trainAngles[bogieIndexB];

            // Get their exact world positions.
            var anchorA = getBogieWorldAnchor(bogieA);
            var anchorB = getBogieWorldAnchor(bogieB);

            if (!anchorA || !anchorB) {

                trainCoaches.push(null);

                continue;
            }

            // ----------------------------------------------------
            // COACH CENTRE
            //
            // The coach reference position is exactly halfway
            // between its two bogie pivots.
            // ----------------------------------------------------

            var centreDistance = (
                anchorA.distance +
                anchorB.distance
            ) * 0.5;

            var centreLateral = (
                anchorA.lateralOffset +
                anchorB.lateralOffset
            ) * 0.5;

            var centreTrackY = (
                anchorA.trackY +
                anchorB.trackY
            ) * 0.5;

            // Exact midpoint in world coordinates.
            var centreWorldX = (
                anchorA.x +
                anchorB.x
            ) * 0.5;

            var centreWorldZ = (
                anchorA.z +
                anchorB.z
            ) * 0.5;

            // ----------------------------------------------------
            // COACH YAW
            //
            // The front bogie is A.
            // The rear bogie is B.
            //
            // The coach heading follows the straight chord
            // between the two bogie pivots.
            // ----------------------------------------------------

            var dx = anchorA.x - anchorB.x;
            var dz = anchorA.z - anchorB.z;

            var horizontalSpan = Math.hypot(
                dx,
                dz
            );

            // Obtain the master route heading at the coach centre.
            var coachSample = sampleAt(
                centreDistance,
                false
            );

            // Fall back to either bogie's heading if required.
            var masterHeading = 0;

            if (
                coachSample &&
                Number.isFinite(Number(coachSample.heading))
            ) {

                masterHeading = Number(
                    coachSample.heading
                );

            } else if (
                Number.isFinite(anchorA.heading)
            ) {

                masterHeading = anchorA.heading;

            } else if (
                Number.isFinite(anchorB.heading)
            ) {

                masterHeading = anchorB.heading;
            }

            // Fallback if the two pivots are effectively coincident.
            var fallbackAngle = angleMidpoint(
                Number.isFinite(Number(angleA))
                ? Number(angleA)
                : 0,

                Number.isFinite(Number(angleB))
                ? Number(angleB)
                : 0
            );

            // Absolute world heading.
            var worldYaw = horizontalSpan > EPS
            ? Math.atan2(dx, dz)
            : masterHeading + fallbackAngle;

            // Store yaw relative to the master route heading
            // for compatibility with the existing camera and map.
            var relativeYaw = normaliseCoachAngle(
                worldYaw - masterHeading
            );

            // ----------------------------------------------------
            // COACH PITCH
            //
            // The two bogie pivot heights determine the slope.
            //
            // Positive local Z is the front of the coach.
            // With the standard right-handed X rotation convention,
            // the sign below gives the correct front-up/front-down
            // slope.
            // ----------------------------------------------------

            var coachPitch = horizontalSpan > EPS
            ? Math.atan2(
                anchorB.trackY - anchorA.trackY,
                horizontalSpan
            )
            : 0;

            // ----------------------------------------------------
            // STORE COACH POSITION
            //
            // [0] Average lateral offset
            // [1] Average route distance
            // [2] Relative yaw
            // [3] Average track elevation
            // [4] Exact world X midpoint
            // [5] Exact world Z midpoint
            // [6] Coach pitch
            // [7] Absolute world yaw
            // ----------------------------------------------------

            trainCoaches.push([

                centreLateral,
                centreDistance,
                relativeYaw,
                centreTrackY,

                centreWorldX,
                centreWorldZ,

                coachPitch,
                worldYaw

            ]);
        }

        // ========================================================
        // RETURN TRAIN DATA
        //
        // IMPORTANT:
        // This return must remain outside the coach loop.
        // Both playerTrain and npcTrain depend on this object.
        // ========================================================

        return {
            frontRail: frontRail,
            bogies: trainBogies,
            angles: trainAngles,
            coaches: trainCoaches
        };

    }










    // ------------------------------------------------------------
    // PLAYER TRAIN
    // ------------------------------------------------------------

    var playerRouting = prepareRouting(
        typeof current_route_items_routing !== "undefined"
        ? current_route_items_routing
        : []
    );

    var playerTrain = buildTrain(
        pos,
        current_track,
        playerRouting
    );

    bogies = playerTrain.bogies;
    bogies_angle = playerTrain.angles;
    coach_positions = playerTrain.coaches;
    current_track = playerTrain.frontRail;

    // ------------------------------------------------------------
    // ADJUSTED TRAIN LENGTH
    //
    // Calculate the distance in the route Z direction between
    // the outer ends of the first and last coach.
    //
    // This uses each end coach's actual yaw.
    // non_cab_overhang is deliberately excluded.
    // ------------------------------------------------------------

    adjusted_train_length = nominalTrainLength;

    if (
        coach_positions.length > 0 &&
        coach_positions[0] &&
        coach_positions[coach_positions.length - 1]
    ) {
        var firstCoach = coach_positions[0];
        var lastCoach = coach_positions[coach_positions.length - 1];

        var firstCoachZ = Number(firstCoach[1]);
        var firstCoachYaw = Number(firstCoach[2]);

        var lastCoachZ = Number(lastCoach[1]);
        var lastCoachYaw = Number(lastCoach[2]);

        if (
            Number.isFinite(firstCoachZ) &&
            Number.isFinite(firstCoachYaw) &&
            Number.isFinite(lastCoachZ) &&
            Number.isFinite(lastCoachYaw)
        ) {
            var halfCoachWithCab =
            coachLengthValue * 0.5 +
            cabOverhangValue;

            var frontTrainZ =
            firstCoachZ +
            Math.cos(firstCoachYaw) * halfCoachWithCab;

            var rearTrainZ =
            lastCoachZ -
            Math.cos(lastCoachYaw) * halfCoachWithCab;

            var calculatedLength = Math.abs(
                frontTrainZ - rearTrainZ
            );

            if (Number.isFinite(calculatedLength)) {
                adjusted_train_length = calculatedLength;
            }
        }
    }

    // ------------------------------------------------------------
    // NPC TRAIN
    // ------------------------------------------------------------

    var npcRouting = prepareRouting(
        typeof current_route_items_routing_npc !== "undefined"
        ? current_route_items_routing_npc
        : []
    );

    var npcTrain = buildTrain(
        pos_npc,
        current_track_npc,
        npcRouting
    );

    bogies_npc = npcTrain.bogies;
    bogies_angle_npc = npcTrain.angles;
    coach_positions_npc = npcTrain.coaches;
    current_track_npc = npcTrain.frontRail;
}


*/








































































////////////////////////////////////////////////////////////






function refresh_waiting_passenger_platforms() {
        populateSpeedLimits();


    if (
        !Array.isArray(passengers) ||
        !Array.isArray(route.stations) ||
        !Array.isArray(current_route_items_routing) ||
        current_route_items_routing.length === 0 ||
        !Array.isArray(door_positions) ||
        !Array.isArray(coach_positions)
    ) {
        return;
    }

    var trainPosition = Number(pos);

    if (!Number.isFinite(trainPosition)) return;

    function parseSide(value) {

        var name = String(value || "").toLowerCase();

        if (name === "left" || name === "-1") {
            return -1;
        }

        if (name === "right" || name === "1") {
            return 1;
        }

        return 0;
    }

    // --------------------------------------------------------
    // GET THE TRACK AT AN ABSOLUTE ROUTE POSITION
    //
    // current_route_items_routing contains:
    // [absolute route position, track number]
    //
    // Use the last routing entry whose position is less
    // than or equal to the requested station position.
    // --------------------------------------------------------

    function getTrackAtPosition(routePosition) {

        if (!Number.isFinite(routePosition)) {
            return null;
        }

        var selectedTrack = null;
        var nearestPosition = -Infinity;

        for (
            var i = 0;
        i < current_route_items_routing.length;
        i++
        ) {

            var item = current_route_items_routing[i];

            if (!item || item.length < 2) continue;

            var itemPosition = Number(item[0]);
            var itemTrack = Number(item[1]);

            if (
                !Number.isFinite(itemPosition) ||
                !Number.isFinite(itemTrack)
            ) {
                continue;
            }

            if (
                itemPosition <= routePosition &&
                itemPosition >= nearestPosition
            ) {

                nearestPosition = itemPosition;
                selectedTrack = itemTrack;
            }
        }

        // If the station is before the first routing entry,
        // use the first valid entry.
        if (selectedTrack === null) {

            var earliestPosition = Infinity;

            for (
                var i = 0;
            i < current_route_items_routing.length;
            i++
            ) {

                var item = current_route_items_routing[i];

                if (!item || item.length < 2) continue;

                var itemPosition = Number(item[0]);
                var itemTrack = Number(item[1]);

                if (
                    !Number.isFinite(itemPosition) ||
                    !Number.isFinite(itemTrack)
                ) {
                    continue;
                }

                if (itemPosition < earliestPosition) {

                    earliestPosition = itemPosition;
                    selectedTrack = itemTrack;
                }
            }
        }

        return selectedTrack;
    }

    // --------------------------------------------------------
    // GET STATION INFORMATION
    // --------------------------------------------------------

    function getStationInformation(stationIndex, door) {

        var station = route.stations[stationIndex];

        if (
            !station ||
            station.type !== "station" ||
            (
                station.freeroamFromPlatform !== true &&
                station.freeroamFromPlatform !== "true"
            ) ||
            String(station.freeroamSource || "").toLowerCase() !== "platform"
        ) {
            return null;
        }

        // This is the actual stopping position used to place
        // passengers longitudinally alongside the train.
        var stationStop = (
            station.stopDistance !== undefined &&
            station.stopDistance !== null &&
            station.stopDistance !== ""
        )
        ? Number(station.stopDistance)
        : Number(station.distance);

        if (!Number.isFinite(stationStop)) {
            return null;
        }

        // Use the station's actual route position for track
        // selection, not the train's current position.
        var stationPosition = Number(station.distance);

        if (!Number.isFinite(stationPosition)) {
            stationPosition = stationStop;
        }

        var stationTrack = getTrackAtPosition(stationPosition);

        if (!Number.isFinite(stationTrack)) {
            return null;
        }

        // ----------------------------------------------------
        // DETERMINE THE PLATFORM SIDE
        // ----------------------------------------------------

        // doorSide is authoritative when supplied.
        // stopSide is used as a fallback.
        var requiredSide =
        parseSide(station.doorSide) ||
        parseSide(station.stopSide) ||
        1;

        // Track 1 has the opposite left/right orientation.
        if (stationTrack === 1) {
            requiredSide *= -1;
        }

        // ----------------------------------------------------
        // GET THE TRACK'S LATERAL OFFSET AT THE STATION
        // ----------------------------------------------------

        var trackOffset = NaN;

        if (typeof window.getPassengerRailOffsetAt === "function") {

            try {

                var railOffset = window.getPassengerRailOffsetAt(
                    stationTrack,
                    stationPosition
                );

                if (
                    railOffset &&
                    Number.isFinite(Number(railOffset.x))
                ) {
                    trackOffset = Number(railOffset.x);
                }

            } catch (error) {
                trackOffset = NaN;
            }
        }

        if (!Number.isFinite(trackOffset)) {

            var coach = coach_positions[Number(door.coach)];

            if (coach) {
                trackOffset = Number(coach[0]);
            }
        }

        if (!Number.isFinite(trackOffset)) {
            trackOffset = 0;
        }

        var freeDistance =
        typeof freeroamX !== "undefined"
        ? Math.abs(Number(freeroamX))
        : Math.abs(Number(station.freeroamX));

        if (!Number.isFinite(freeDistance)) {
            freeDistance = Number(trainWidth) * 1.5;
        }

        freeDistance = Math.max(
            Math.abs(Number(trainWidth)) * 0.5 + 0.5,
                                freeDistance
        );

        return {
            station: station,
            stationIndex: stationIndex,
            stationPosition: stationPosition,
            stationStop: stationStop,
            stationTrack: stationTrack,
            trackOffset: trackOffset,
            side: requiredSide,
            freeDistance: freeDistance
        };
    }

    // --------------------------------------------------------
    // UPDATE WAITING PLATFORM PASSENGERS
    // --------------------------------------------------------

    for (var passenger of passengers) {

        if (
            !passenger ||
            !Array.isArray(passenger) ||
            passenger[0] === true
        ) {
            continue;
        }

        var isPlayer =
        passenger._isPlayerPassenger === true;

        var phase = String(passenger._phase || "");

        // Do not interrupt passengers who are actively boarding
        // or leaving the train.
        if (
            !isPlayer &&
            phase !== "waiting"
        ) {
            continue;
        }

        var stationIndex = Number(passenger._stationIndex);

        if (
            !Number.isInteger(stationIndex) ||
            stationIndex < 0 ||
            stationIndex >= route.stations.length
        ) {
            stationIndex = passengerStationIndex;
        }

        if (
            !Number.isInteger(stationIndex) ||
            stationIndex < 0 ||
            stationIndex >= route.stations.length
        ) {
            continue;
        }

        var doorIndex = Math.floor(Number(passenger[1]));

        if (
            !Number.isFinite(doorIndex) ||
            doorIndex < 0 ||
            doorIndex >= door_positions.length
        ) {
            continue;
        }

        // Passenger references use even physical door indexes.
        doorIndex -= doorIndex % 2;

        var door = door_positions[doorIndex];

        if (!door) continue;

        var coachIndex = Number(door.coach);
        var coach = coach_positions[coachIndex];

        if (!coach) continue;

        var localZ = Number(door.localZ);
        var doorWidth = Number(door.width);
        var coachRoute = Number(coach[1]);

        if (
            !Number.isFinite(localZ) ||
            !Number.isFinite(doorWidth) ||
            doorWidth <= 0 ||
            !Number.isFinite(coachRoute)
        ) {
            continue;
        }

        var information = getStationInformation(
            stationIndex,
            door
        );

        if (!information) continue;

        // ----------------------------------------------------
        // PASSENGER SLOT
        // ----------------------------------------------------

        var slot = Number(passenger._doorSlot);

        if (slot !== -1 && slot !== 1) {

            var oldDoorRoute =
            information.stationStop +
            (coachRoute + localZ - trainPosition);

            slot = Number(passenger[3]) < oldDoorRoute ? -1 : 1;
        }

        // ----------------------------------------------------
        // NEW PLATFORM POSITION
        // ----------------------------------------------------

        var newDoorRoute =
        information.stationStop +
        (coachRoute + localZ - trainPosition);

        var newPassengerRoute =
        newDoorRoute + slot * doorWidth * (boat_mode ? 0.35 : 0.5);

        // ----------------------------------------------------
        // CHECK WHETHER THE CONFIGURATION HAS CHANGED
        // ----------------------------------------------------

        var signature = [

            information.stationIndex,
            information.stationPosition,
            information.stationStop,
            information.side,
            information.stationTrack,
            information.trackOffset,
            doorIndex,
            localZ,
            doorWidth,
            information.freeDistance

        ].join("|");

        if (passenger._platformRefreshKey === signature) {
            continue;
        }

        // ----------------------------------------------------
        // PRESERVE THE PASSENGER'S DISTANCE FROM THE TRAIN
        // ----------------------------------------------------

        var oldFreeDistance =
        Number(passenger._freeroamX);

        var oldLateralPosition =
        Math.abs(Number(passenger[2]));

        var distanceFactor = 0.85;

        if (
            Number.isFinite(oldFreeDistance) &&
            oldFreeDistance > 0 &&
            Number.isFinite(oldLateralPosition)
        ) {
            distanceFactor =
            oldLateralPosition / oldFreeDistance;
        }

        distanceFactor = Math.max(
            0.05,
            Math.min(1, distanceFactor)
        );

        // ----------------------------------------------------
        // APPLY THE NEW SIDE AND TRACK
        // ----------------------------------------------------

        passenger[1] = doorIndex;

        passenger[2] =
        information.side *
        information.freeDistance *
        distanceFactor;

        passenger[3] = newPassengerRoute;

        passenger[4] =
        Number(coach[7]) -
        information.side * (Math.PI / 2);

        passenger._doorSlot = slot;

        passenger._doorSide = information.side;

        passenger._stationIndex =
        information.stationIndex;

        passenger._stationStop =
        information.stationStop;

        passenger._stationTrack =
        information.stationTrack;

        passenger._trackOffset =
        information.trackOffset;

        passenger._freeroamX =
        information.freeDistance;

        passenger._platformRefreshKey = signature;
    }
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
    var gangwayLengthFactor = Jacobs_bogies ? 0.4 : 1;

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
    // RIB BOAT
    for (var mesh of boatMeshes) {
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
    boatMeshes = [];
    door_positions.length = 0;

    passengers.length = 0;

    passengerStationIndex = -1;
    passengerRouteReference = null;
    passengerLastUpdateTime = 0;

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
            -floorHalfWidth, miniFloorY, halfLength - 0.1,
            floorHalfWidth, miniFloorY, halfLength - 0.1,
            floorHalfWidth, miniFloorY, -halfLength + 0.1,
            -floorHalfWidth, miniFloorY, -halfLength + 0.1
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

        var frontHalfLength = floorCoachLength * 0.49 + frontAdjustment;
        var rearHalfLength = floorCoachLength * 0.49 + rearAdjustment;

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
        // ============================================================
        // RECORD PASSENGER DOOR POSITIONS
        //
        // One entry for each actual door on each side of the coach.
        //
        // side:
        //     +1 = right
        //     -1 = left
        //
        // localZ = door centre relative to coach centre.
        //
        // The passenger's "doors" array value is the index of this
        // entry in door_positions.
        // ============================================================

        for (var opening of coachDoorOpenings) {

            // RIGHT SIDE
            door_positions.push({

                coach: coachIndex,

                side: 1,

                localZ: Number(opening.centreZ),

                                width: Number(opening.width)

            });

            // LEFT SIDE
            door_positions.push({

                coach: coachIndex,

                side: -1,

                localZ: Number(opening.centreZ),

                                width: Number(opening.width)

            });
        }
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








    // ============================================================
    // RIB BOAT
    //
    // Created only when boat_mode is true.
    //
    // Local +Z is forwards.
    // The boat is approximately 4 metres long.
    // ============================================================

    if (boat_mode) {



        var rib_pos_var = 2;

        var ribHalfWidth = 0.62;
        var ribTubeRadius = 0.26;
        var ribTubeCentreY = 0.34;

        var ribRearZ = -2.6 + rib_pos_var;
        var ribBowCentreZ = 0 + rib_pos_var;

        var ribStraightSteps = 22;
        var ribCurveSteps = 24;
        var ribSides = 16;

        var ribPath = [];

        // --------------------------------------------------------
        // LEFT SIDE: TRANSOM TO FRONT
        // --------------------------------------------------------

        for (var i = 0; i <= ribStraightSteps; i++) {

            var z = ribRearZ +
            (ribBowCentreZ - ribRearZ) *
            (i / ribStraightSteps);

            ribPath.push({
                x: -ribHalfWidth,
                z: z
            });
        }

        // --------------------------------------------------------
        // CURVED FRONT OF THE RIB
        // --------------------------------------------------------

        for (var i = 1; i <= ribCurveSteps; i++) {

            var angle = Math.PI -
            Math.PI * (i / ribCurveSteps);

            ribPath.push({
                x: ribHalfWidth * Math.cos(angle),
                         z: ribBowCentreZ +
                         ribHalfWidth * Math.sin(angle)
            });
        }

        // --------------------------------------------------------
        // RIGHT SIDE: FRONT TO TRANSOM
        // --------------------------------------------------------

        for (var i = 1; i <= ribStraightSteps; i++) {

            var z = ribBowCentreZ +
            (ribRearZ - ribBowCentreZ) *
            (i / ribStraightSteps);

            ribPath.push({
                x: ribHalfWidth,
                z: z
            });
        }

        // --------------------------------------------------------
        // BUILD THE CIRCULAR INFLATABLE TUBE
        // --------------------------------------------------------

        var ribPositions = [];
        var ribNormals = [];
        var ribUvs = [];
        var ribIndices = [];

        for (var i = 0; i < ribPath.length; i++) {

            var previous = ribPath[Math.max(0, i - 1)];
            var next = ribPath[Math.min(ribPath.length - 1, i + 1)];

            var tangentX = next.x - previous.x;
            var tangentZ = next.z - previous.z;

            var tangentLength = Math.hypot(
                tangentX,
                tangentZ
            );

            if (tangentLength < 1e-8) continue;

            tangentX /= tangentLength;
            tangentZ /= tangentLength;

            var sideX = -tangentZ;
            var sideZ = tangentX;

            for (var j = 0; j < ribSides; j++) {

                var angle = (j / ribSides) * Math.PI * 2;

                var horizontal = Math.cos(angle);
                var vertical = Math.sin(angle);

                var nx = horizontal * sideX;
                var ny = vertical;
                var nz = horizontal * sideZ;

                ribPositions.push(
                    ribPath[i].x + nx * ribTubeRadius,
                    ribTubeCentreY + ny * ribTubeRadius,
                    ribPath[i].z + nz * ribTubeRadius
                );

                ribNormals.push(nx, ny, nz);

                ribUvs.push(
                    i / (ribPath.length - 1),
                            j / ribSides
                );
            }
        }

        // Connect the circular tube sections.
        for (var i = 0; i < ribPath.length - 1; i++) {

            for (var j = 0; j < ribSides; j++) {

                var nextJ = (j + 1) % ribSides;

                var a = i * ribSides + j;
                var b = (i + 1) * ribSides + j;
                var c = (i + 1) * ribSides + nextJ;
                var d = i * ribSides + nextJ;

                ribIndices.push(
                    a, b, c,
                    a, c, d
                );
            }
        }

        var ribPositionData = new Float32Array(ribPositions);
        var ribNormalData = new Float32Array(ribNormals);
        var ribUvData = new Float32Array(ribUvs);
        var ribIndexData = new Uint16Array(ribIndices);

        var ribTubeMesh = {

            positionBuffer: gl.createBuffer(),
            normalBuffer: gl.createBuffer(),
            uvBuffer: gl.createBuffer(),
            indexBuffer: gl.createBuffer(),
            objectVao: gl.createVertexArray(),

            indexCount: ribIndexData.length,
            indexType: gl.UNSIGNED_SHORT,

            texture: null,
            colour: [0.015, 0.25, 0.055, 1],

            transparentColor: null,
            repeatS: false,
            repeatT: false
        };

        if (
            !ribTubeMesh.positionBuffer ||
            !ribTubeMesh.normalBuffer ||
            !ribTubeMesh.uvBuffer ||
            !ribTubeMesh.indexBuffer ||
            !ribTubeMesh.objectVao
        ) {
            throw new Error("Could not create RIB tube.");
        }

        gl.bindVertexArray(ribTubeMesh.objectVao);

        gl.bindBuffer(gl.ARRAY_BUFFER, ribTubeMesh.positionBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            ribPositionData,
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

        gl.bindBuffer(gl.ARRAY_BUFFER, ribTubeMesh.normalBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            ribNormalData,
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

        gl.bindBuffer(gl.ARRAY_BUFFER, ribTubeMesh.uvBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            ribUvData,
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

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ribTubeMesh.indexBuffer);
        gl.bufferData(
            gl.ELEMENT_ARRAY_BUFFER,
            ribIndexData,
            gl.STATIC_DRAW
        );

        gl.bindVertexArray(null);

        boatMeshes.push(ribTubeMesh);

        // --------------------------------------------------------
        // GREY RIB FLOOR
        // --------------------------------------------------------

        var ribFloorHeight = 0.24;
        var ribFloorRearZ = ribRearZ + 0.13;

        var ribFloorVerticalDifference =
        ribTubeCentreY - ribFloorHeight;

        var ribFloorHorizontalOffset = Math.sqrt(
            Math.max(
                0,
                ribTubeRadius * ribTubeRadius -
                ribFloorVerticalDifference * ribFloorVerticalDifference
            )
        );

        var ribFloorRadius =
        ribHalfWidth - ribFloorHorizontalOffset;

        var ribFloorBoundary = [];

        // Left rear corner.
        ribFloorBoundary.push({
            x: -ribFloorRadius,
            z: ribFloorRearZ
        });

        // Left side, running forwards.
        ribFloorBoundary.push({
            x: -ribFloorRadius,
            z: ribBowCentreZ
        });

        // Curved front edge.
        var ribFloorCurveSteps = 32;

        for (var i = 1; i < ribFloorCurveSteps; i++) {

            var angle =
            Math.PI -
            Math.PI * (i / ribFloorCurveSteps);

            ribFloorBoundary.push({
                x: ribFloorRadius * Math.cos(angle),
                                  z: ribBowCentreZ +
                                  ribFloorRadius * Math.sin(angle)
            });
        }

        // Right side where the bow curve meets the straight tube.
        ribFloorBoundary.push({
            x: ribFloorRadius,
            z: ribBowCentreZ
        });

        // Right side, running back to the transom.
        ribFloorBoundary.push({
            x: ribFloorRadius,
            z: ribFloorRearZ
        });

        // --------------------------------------------------------
        // TRIANGULATE THE FLOOR AS A SINGLE FLAT SURFACE
        // --------------------------------------------------------

        var ribFloorPositions = [];
        var ribFloorNormals = [];
        var ribFloorUvs = [];
        var ribFloorIndices = [];

        // Centre point for the triangle fan.
        var ribFloorCentreZ =
        (
            ribFloorRearZ +
            ribBowCentreZ +
            ribFloorRadius
        ) * 0.5;

        ribFloorPositions.push(
            0,
            ribFloorHeight,
            ribFloorCentreZ
        );

        ribFloorNormals.push(0, 1, 0);
        ribFloorUvs.push(0.5, 0.5);

        // Add every boundary vertex.
        for (var i = 0; i < ribFloorBoundary.length; i++) {

            var point = ribFloorBoundary[i];

            ribFloorPositions.push(
                point.x,
                ribFloorHeight,
                point.z
            );

            ribFloorNormals.push(0, 1, 0);

            ribFloorUvs.push(
                (point.x / (ribFloorRadius * 2)) + 0.5,
                             (point.z - ribFloorRearZ) /
                             (
                                 ribBowCentreZ +
                                 ribFloorRadius -
                                 ribFloorRearZ
                             )
            );
        }

        // Make triangles from the centre to the curved boundary.
        for (var i = 0; i < ribFloorBoundary.length; i++) {

            var current = i + 1;

            var next =
            ((i + 1) % ribFloorBoundary.length) + 1;

            ribFloorIndices.push(
                0,
                current,
                next
            );
        }

        var ribFloorPositionData =
        new Float32Array(ribFloorPositions);

        var ribFloorNormalData =
        new Float32Array(ribFloorNormals);

        var ribFloorUvData =
        new Float32Array(ribFloorUvs);

        var ribFloorIndexData =
        new Uint16Array(ribFloorIndices);

        var ribFloorMesh = {

            positionBuffer: gl.createBuffer(),
            normalBuffer: gl.createBuffer(),
            uvBuffer: gl.createBuffer(),
            indexBuffer: gl.createBuffer(),
            objectVao: gl.createVertexArray(),

            indexCount: ribFloorIndexData.length,
            indexType: gl.UNSIGNED_SHORT,

            texture: null,
            colour: [0.40, 0.41, 0.41, 1],

            transparentColor: null,
            repeatS: false,
            repeatT: false
        };

        if (
            !ribFloorMesh.positionBuffer ||
            !ribFloorMesh.normalBuffer ||
            !ribFloorMesh.uvBuffer ||
            !ribFloorMesh.indexBuffer ||
            !ribFloorMesh.objectVao
        ) {
            throw new Error("Could not create RIB floor.");
        }

        gl.bindVertexArray(ribFloorMesh.objectVao);

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            ribFloorMesh.positionBuffer
        );

        gl.bufferData(
            gl.ARRAY_BUFFER,
            ribFloorPositionData,
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

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            ribFloorMesh.normalBuffer
        );

        gl.bufferData(
            gl.ARRAY_BUFFER,
            ribFloorNormalData,
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

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            ribFloorMesh.uvBuffer
        );

        gl.bufferData(
            gl.ARRAY_BUFFER,
            ribFloorUvData,
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

        gl.bindBuffer(
            gl.ELEMENT_ARRAY_BUFFER,
            ribFloorMesh.indexBuffer
        );

        gl.bufferData(
            gl.ELEMENT_ARRAY_BUFFER,
            ribFloorIndexData,
            gl.STATIC_DRAW
        );

        gl.bindVertexArray(null);

        boatMeshes.push(ribFloorMesh);

        // --------------------------------------------------------
        // DARK GREY TRANSOM
        // --------------------------------------------------------

        var ribTransom = createFace([

            -0.76, 0.18, ribRearZ - 0.01,
            0.76, 0.18, ribRearZ - 0.01,
            0.76, 0.66, ribRearZ - 0.01,
            -0.76, 0.66, ribRearZ - 0.01
        ], [0, 0, -1], null);

        ribTransom.colour = [0.18, 0.19, 0.19, 1];

        boatMeshes.push(ribTransom);

        // --------------------------------------------------------
        // BLACK ENGINE
        // --------------------------------------------------------

        var engineHalfWidth = 0.15;
        var engineBottom = 0.015;
        var engineTop = 0.78;

        var engineFrontZ = ribRearZ - 0.01;
        var engineRearZ = engineFrontZ - 0.32;

        var engineColour = [0.018, 0.018, 0.022, 1];

        // Engine rear face.
        var engineFace = createFace([

            engineHalfWidth, engineBottom, engineRearZ,
            -engineHalfWidth, engineBottom, engineRearZ,
            -engineHalfWidth, engineTop, engineRearZ,
            engineHalfWidth, engineTop, engineRearZ

        ], [0, 0, -1], null);

        engineFace.colour = engineColour;
        boatMeshes.push(engineFace);

        // Engine front face.
        var engineFace = createFace([

            -engineHalfWidth, engineBottom, engineFrontZ,
            engineHalfWidth, engineBottom, engineFrontZ,
            engineHalfWidth, engineTop, engineFrontZ,
            -engineHalfWidth, engineTop, engineFrontZ

        ], [0, 0, 1], null);

        engineFace.colour = engineColour;
        boatMeshes.push(engineFace);

        // Engine left face.
        var engineFace = createFace([

            -engineHalfWidth, engineBottom, engineRearZ,
            -engineHalfWidth, engineBottom, engineFrontZ,
            -engineHalfWidth, engineTop, engineFrontZ,
            -engineHalfWidth, engineTop, engineRearZ

        ], [-1, 0, 0], null);

        engineFace.colour = engineColour;
        boatMeshes.push(engineFace);

        // Engine right face.
        var engineFace = createFace([

            engineHalfWidth, engineBottom, engineFrontZ,
            engineHalfWidth, engineBottom, engineRearZ,
            engineHalfWidth, engineTop, engineRearZ,
            engineHalfWidth, engineTop, engineFrontZ

        ], [1, 0, 0], null);

        engineFace.colour = engineColour;
        boatMeshes.push(engineFace);

        // Engine top face.
        var engineFace = createFace([

            -engineHalfWidth, engineTop, engineRearZ,
            engineHalfWidth, engineTop, engineRearZ,
            engineHalfWidth, engineTop, engineFrontZ,
            -engineHalfWidth, engineTop, engineFrontZ

        ], [0, 1, 0], null);

        engineFace.colour = engineColour;
        boatMeshes.push(engineFace);

        // Engine bottom face.
        var engineFace = createFace([

            -engineHalfWidth, engineBottom, engineFrontZ,
            engineHalfWidth, engineBottom, engineFrontZ,
            engineHalfWidth, engineBottom, engineRearZ,
            -engineHalfWidth, engineBottom, engineRearZ

        ], [0, -1, 0], null);

        engineFace.colour = engineColour;
        boatMeshes.push(engineFace);














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
                bogie[4] === null ||
                angle === null
            ) {
                continue;
            }

            var distance = Number(bogie[0]);
            var lateralOffset = Number(bogie[2]);
            var trackY = Number(bogie[3]);
            var bogiePitch = Number(bogie[4]);
            var bogieAngle = Number(angle);

            if (
                !Number.isFinite(distance) ||
                !Number.isFinite(lateralOffset) ||
                !Number.isFinite(trackY) ||
                !Number.isFinite(bogiePitch) ||
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

                                          pitch: bogiePitch,

                                          distance: distance,

                                          isNpc: bogieList === bogies_npc,

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














// ============================================================
// UPDATE PASSENGERS
// ============================================================




function update_passengers() {

    // --------------------------------------------------------
    // REQUIRED DATA
    // --------------------------------------------------------

    if (
        typeof route === "undefined" ||
        !route ||
        !Array.isArray(route.stations) ||
        !Array.isArray(current_route_items_routing) ||
        current_route_items_routing.length === 0 ||
        !Array.isArray(door_positions) ||
        door_positions.length === 0 ||
        !Array.isArray(coach_positions) ||
        coach_positions.length === 0
    ) {
        return;
    }

    if (!Array.isArray(passengers)) {
        passengers = [];
    }

    var trainPosition = Number(pos);
    var width = Number(trainWidth);

    if (
        !Number.isFinite(trainPosition) ||
        !Number.isFinite(width) ||
        width <= 0
    ) {
        return;
    }

    // --------------------------------------------------------
    // REMEMBER THE PREVIOUS STATION
    // --------------------------------------------------------

    var previousStationIndex = passengerStationIndex;

    // --------------------------------------------------------
    // FIND THE SPECIAL PASSENGER
    // --------------------------------------------------------

    var playerPassenger = !boat_mode
    ? passengers.find(function(p) {
        return p && p._isPlayerPassenger === true;
    }) || null
    : null;

    // --------------------------------------------------------
    // ROUTE CHANGE
    // --------------------------------------------------------

    if (passengerRouteReference !== route) {

        passengerRouteReference = route;

        passengerStationIndex = -1;
        previousStationIndex = -1;

        passengers = playerPassenger
        ? [playerPassenger]
        : [];

        passengerLastUpdateTime = 0;
    }

    // --------------------------------------------------------
    // TIME AND MOVEMENT
    // --------------------------------------------------------

    var now = Number(the_time) || Date.now();

    var deltaTime = passengerLastUpdateTime > 0
    ? Math.max(
        0,
        Math.min(
            0.1,
            (now - passengerLastUpdateTime) / 1000
        )
    )
    : 0;

    passengerLastUpdateTime = now;

    var walkSpeed = Number(passengerWalkSpeed);

    if (!Number.isFinite(walkSpeed) || walkSpeed <= 0) {
        walkSpeed = 1.2;
    }

    var maximumMovement = walkSpeed * deltaTime;

    var stopAccuracy =
    typeof stopaccuracy !== "undefined"
    ? Math.abs(Number(stopaccuracy))
    : 0;

    if (!Number.isFinite(stopAccuracy)) {
        stopAccuracy = 0;
    }

    // --------------------------------------------------------
    // STATION DISTANCE
    // --------------------------------------------------------

    function getStationStopDistance(index) {

        var station = route.stations[index];

        if (!station) return NaN;

        return (
            station.stopDistance !== undefined &&
            station.stopDistance !== null &&
            station.stopDistance !== ""
        )
        ? Number(station.stopDistance)
        : Number(station.distance);
    }

    // --------------------------------------------------------
    // FIND STOPPING STATIONS
    // --------------------------------------------------------

    var stationIndices = [];

    for (var i = 0; i < route.stations.length; i++) {

        var station = route.stations[i];

        if (!station || station.type !== "station") {
            continue;
        }

        if (
            station.passThrough === true ||
            station.passThrough === "true"
        ) {
            continue;
        }

        if (!Number.isFinite(getStationStopDistance(i))) {
            continue;
        }

        stationIndices.push(i);
    }

    if (stationIndices.length === 0) return;

    stationIndices.sort(function(a, b) {
        return (
            getStationStopDistance(a) -
            getStationStopDistance(b)
        );
    });

    // --------------------------------------------------------
    // INITIALISE STATION
    // --------------------------------------------------------

    if (passengerStationIndex === -1) {
        passengerStationIndex = stationIndices[0];
    }

    var stationListPosition =
    stationIndices.indexOf(passengerStationIndex);

    if (stationListPosition === -1) {

        stationListPosition = 0;
        passengerStationIndex = stationIndices[0];
    }

    // --------------------------------------------------------
    // FIND CURRENT STATION USING MIDPOINTS
    // --------------------------------------------------------

    while (stationListPosition < stationIndices.length - 1) {

        var currentIndex =
        stationIndices[stationListPosition];

        var nextIndex =
        stationIndices[stationListPosition + 1];

        var midpoint = (
            getStationStopDistance(currentIndex) +
            getStationStopDistance(nextIndex)
        ) * 0.5;

        if (trainPosition > midpoint) {

            stationListPosition++;

            passengerStationIndex =
            stationIndices[stationListPosition];

        } else {
            break;
        }
    }

    while (stationListPosition > 0) {

        var previousIndex =
        stationIndices[stationListPosition - 1];

        var currentIndex =
        stationIndices[stationListPosition];

        var midpoint = (
            getStationStopDistance(previousIndex) +
            getStationStopDistance(currentIndex)
        ) * 0.5;

        if (trainPosition < midpoint) {

            stationListPosition--;

            passengerStationIndex =
            stationIndices[stationListPosition];

        } else {
            break;
        }
    }

    var stationChanged =
    passengerStationIndex !== previousStationIndex;

    var initialStation =
    previousStationIndex === -1;

    var station =
    route.stations[passengerStationIndex];

    if (!station) return;

    var stationStop =
    getStationStopDistance(passengerStationIndex);





















    // --------------------------------------------------------
    // FREEROAM X
    // --------------------------------------------------------

    var freeRoamDistance =
    typeof freeroamX !== "undefined"
    ? Math.abs(Number(freeroamX))
    : Math.abs(Number(station.freeroamX));

    if (!Number.isFinite(freeRoamDistance)) {
        freeRoamDistance = width * 1.5;
    }

    freeRoamDistance = Math.max(
        width * 0.5 + 0.5,
        freeRoamDistance
    );

    // --------------------------------------------------------
    // PLATFORM SIDE
    // --------------------------------------------------------

    function parseSide(value) {

        var name = String(value || "").toLowerCase();

        if (name === "left" || name === "-1") return -1;
        if (name === "right" || name === "1") return 1;

        return 0;
    }

    var requiredSide =
    parseSide(station.doorSide) ||
    parseSide(station.stopSide) ||
    1;

    // --------------------------------------------------------
    // STATION TRACK
    // --------------------------------------------------------

    var stationPosition = Number(station.distance);

    if (!Number.isFinite(stationPosition)) {
        stationPosition = stationStop;
    }

    var stationTrack = null;
    var nearestPosition = -Infinity;
    var earliestPosition = Infinity;

    for (
        var i = 0;
    i < current_route_items_routing.length;
    i++
    ) {

        var item = current_route_items_routing[i];

        if (!item || item.length < 2) continue;

        var itemPosition = Number(item[0]);
        var itemTrack = Number(item[1]);

        if (
            !Number.isFinite(itemPosition) ||
            !Number.isFinite(itemTrack)
        ) {
            continue;
        }

        if (itemPosition < earliestPosition) {

            earliestPosition = itemPosition;

            if (stationTrack === null) {
                stationTrack = itemTrack;
            }
        }

        if (
            itemPosition <= stationPosition &&
            itemPosition >= nearestPosition
        ) {

            nearestPosition = itemPosition;
            stationTrack = itemTrack;
        }
    }

    if (!Number.isFinite(stationTrack)) {
        stationTrack = 0;
    }

    // Track 1 has the opposite left/right orientation.
    if (stationTrack === 1) {
        requiredSide *= -1;
    }

    // --------------------------------------------------------
    // STATION TRACK OFFSET
    // --------------------------------------------------------

    var stationTrackOffsetX = NaN;

    if (typeof getRailOffsetAt === "function") {

        try {

            var railOffset = getRailOffsetAt(
                stationTrack,
                stationPosition
            );

            if (
                railOffset &&
                Number.isFinite(Number(railOffset.x))
            ) {
                stationTrackOffsetX = Number(railOffset.x);
            }

        } catch (error) {
            stationTrackOffsetX = NaN;
        }
    }








































    // --------------------------------------------------------
    // NORMALISE PASSENGER DOOR INDEX
    //
    // Even indexes are used for every physical doorway.
    // The actual side is stored separately in _doorSide.
    // --------------------------------------------------------

    function normalisePassengerDoor(passenger) {

        var oldIndex = Math.floor(Number(passenger[1]));

        if (
            !Number.isFinite(oldIndex) ||
            oldIndex < 0 ||
            oldIndex >= door_positions.length
        ) {
            return null;
        }

        var oldDoor = door_positions[oldIndex];

        var side = Number(passenger._doorSide);

        if (side !== -1 && side !== 1) {
            side = Number(oldDoor.side) < 0 ? -1 : 1;
        }

        var evenIndex = oldIndex - (oldIndex % 2);

        if (!door_positions[evenIndex]) {
            return null;
        }

        passenger[1] = evenIndex;
        passenger._doorSide = side;

        if (
            passenger._doorSlot !== -1 &&
            passenger._doorSlot !== 1
        ) {

            var localZ =
            Number(door_positions[evenIndex].localZ);

            passenger._doorSlot =
            Number(passenger[3]) < localZ ? -1 : 1;
        }

        return evenIndex + ":" +
        Number(passenger._doorSlot);
    }

    // --------------------------------------------------------
    // REMOVE EXISTING ONBOARD DUPLICATES
    // --------------------------------------------------------

    var cleanedPassengers = [];

    var occupiedOnboardSlots = new Set();

    if (playerPassenger) {

        var playerKey =
        normalisePassengerDoor(playerPassenger);

        cleanedPassengers.push(playerPassenger);

        if (
            playerPassenger[0] === true &&
            playerKey !== null
        ) {
            occupiedOnboardSlots.add(playerKey);
        }
    }

    for (var passenger of passengers) {

        if (
            !passenger ||
            passenger === playerPassenger ||
            passenger._isPlayerPassenger === true
        ) {
            continue;
        }

        var passengerKey =
        normalisePassengerDoor(passenger);

        if (passenger[0] === true) {

            if (
                passengerKey !== null &&
                occupiedOnboardSlots.has(passengerKey)
            ) {
                continue;
            }

            if (passengerKey !== null) {
                occupiedOnboardSlots.add(passengerKey);
            }
        }

        cleanedPassengers.push(passenger);
    }

    passengers = cleanedPassengers;

    // --------------------------------------------------------
    // MAKE PHYSICAL DOOR INFORMATION
    //
    // The even entry supplies the coach and local Z.
    // _doorSide supplies the platform side.
    // --------------------------------------------------------

    function makeDoorInformation(doorIndex) {

        var door = door_positions[doorIndex];

        if (!door) return null;

        var coachIndex = Number(door.coach);

        var coach = coach_positions[coachIndex];

        if (!coach) return null;

        var coachRoute = Number(coach[1]);
        var localZ = Number(door.localZ);
        var doorWidth = Number(door.width);

        if (
            !Number.isFinite(coachRoute) ||
            !Number.isFinite(localZ) ||
            !Number.isFinite(doorWidth) ||
            doorWidth <= 0
        ) {
            return null;
        }

        var trackOffset = Number(coach[0]);

        if (Number.isFinite(stationTrackOffsetX)) {
            trackOffset = stationTrackOffsetX;
        }

        if (!Number.isFinite(trackOffset)) {
            trackOffset = 0;
        }

        var yaw = Number(coach[7]);

        if (!Number.isFinite(yaw)) {
            yaw = 0;
        }

        return {

            index: doorIndex,

            coach: coachIndex,

            side: requiredSide,

            localZ: localZ,

            width: doorWidth,

            routeZ:
            stationStop +
            (coachRoute + localZ - trainPosition),

            trackOffset: trackOffset,

            yaw: yaw
        };
    }

    // --------------------------------------------------------
    // GENERATE PASSENGERS WHEN THE STATION CHANGES
    // --------------------------------------------------------

    if (stationChanged) {

        // ----------------------------------------------------
        // RETAIN ONBOARD PASSENGERS
        // ----------------------------------------------------

        var onboardPassengers = [];

        for (var existingPassenger of passengers) {

            if (
                !existingPassenger ||
                existingPassenger._isPlayerPassenger === true ||
                existingPassenger[0] !== true
            ) {
                continue;
            }

            existingPassenger._phase = "onboard";

            existingPassenger._wantsToAlight = false;
            existingPassenger._forceAlight = false;

            existingPassenger._stationIndex =
            passengerStationIndex;

            existingPassenger._stationStop =
            stationStop;

            existingPassenger._stationTrack =
            stationTrack;

            existingPassenger._freeroamX =
            freeRoamDistance;

            existingPassenger._doorSide =
            requiredSide;

            onboardPassengers.push(existingPassenger);
        }

        passengers = playerPassenger
        ? [playerPassenger]
        : [];

        for (var existingPassenger of onboardPassengers) {
            passengers.push(existingPassenger);
        }

        // ----------------------------------------------------
        // GET ONE ENTRY PER PHYSICAL DOOR
        // ----------------------------------------------------

        var eligibleDoors = [];

        for (
            var doorIndex = 0;
        doorIndex < door_positions.length;
        doorIndex += 2
        ) {

            if (boat_mode) {
                if ((doorIndex < 2) || (doorIndex > 3))


                continue;
            }



            var doorInformation =
            makeDoorInformation(doorIndex);

            if (doorInformation) {
                eligibleDoors.push(doorInformation);
            }



        }

        if (eligibleDoors.length === 0) return;

        // ----------------------------------------------------
        // CAPACITY
        //
        // Each physical door has two passenger positions.
        // ----------------------------------------------------

        var capacity = eligibleDoors.length * 2;

        // ----------------------------------------------------
        // TARGET OCCUPANCY
        //
        // First station: exactly 50%.
        //
        // Later stations: randomly 65-75%.
        //
        // This avoids filling the train too heavily at the
        // first station, while allowing normal passenger
        // turnover at subsequent stations.
        // ----------------------------------------------------

        var targetPercentage = initialStation
        ? 0.50
        : 0.65 + Math.random() * 0.10;

        var targetPassengerCount = boat_mode
        ? (Math.random() < 0.5 ? 1 : 2)
        : Math.round(capacity * targetPercentage);

        targetPassengerCount = Math.max(
            1,
            Math.min(
                capacity,
                targetPassengerCount
            )
        );

        // ----------------------------------------------------
        // CURRENT OCCUPANCY
        // ----------------------------------------------------

        var playerOnTrain =
        playerPassenger !== null &&
        playerPassenger[0] === true;

        var currentPassengerCount =
        onboardPassengers.length +
        (playerOnTrain ? 1 : 0);

        // ----------------------------------------------------
        // SELECT ALIGHTING PASSENGERS
        //
        // At subsequent stations, approximately 25% of the
        // onboard passengers leave.
        //
        // At least one leaves when there are passengers,
        // so that passenger turnover can occur.
        //
        // Also remove enough passengers if the train is
        // already above the new target occupancy.
        // ----------------------------------------------------

        var alightCount = 0;

        if (!initialStation && onboardPassengers.length > 0) {

            alightCount = Math.max(
                1,
                Math.round(onboardPassengers.length * 0.25)
            );

            alightCount = Math.max(
                alightCount,
                currentPassengerCount - targetPassengerCount
            );

            alightCount = Math.min(
                onboardPassengers.length,
                alightCount
            );
        }
        if (boat_mode) {
            alightCount = Math.max(
                alightCount,
                onboardPassengers.length + targetPassengerCount - capacity
            );
        }
        // ----------------------------------------------------
        // SHUFFLE ONBOARD PASSENGERS
        // ----------------------------------------------------

        var shuffledOnboard =
        onboardPassengers.slice();

        for (
            var i = shuffledOnboard.length - 1;
        i > 0;
        i--
        ) {

            var j = Math.floor(Math.random() * (i + 1));

            var temporary = shuffledOnboard[i];

            shuffledOnboard[i] = shuffledOnboard[j];

            shuffledOnboard[j] = temporary;
        }

        // ----------------------------------------------------
        // MARK PASSENGERS TO ALIGHT
        // ----------------------------------------------------

        for (
            var i = 0;
        i < shuffledOnboard.length;
        i++
        ) {

            shuffledOnboard[i]._wantsToAlight =
            i < alightCount;
        }

        // ----------------------------------------------------
        // CURRENT OCCUPANCY AFTER ALIGHTING
        //
        // Calculate this before deciding how many passengers
        // should board. This is the important correction.
        // --------------------------------------------------------

        var expectedOccupancy =
        currentPassengerCount - alightCount;

        var boardingCount = boat_mode
        ? targetPassengerCount
        : Math.max(0, targetPassengerCount - expectedOccupancy);

        // ----------------------------------------------------
        // BUILD AVAILABLE PLAYER POSITIONS
        // ----------------------------------------------------

        var allOccupiedSlots = new Set();

        for (var onboardPassenger of onboardPassengers) {

            var key =
            Number(onboardPassenger[1]) +
            ":" +
            Number(onboardPassenger._doorSlot);

            allOccupiedSlots.add(key);
        }

        // ----------------------------------------------------
        // PLACE OR CREATE PLAYER PASSENGER
        //
        // If on the train, leave him unchanged.
        // If on the platform, place him at the new station.
        // ----------------------------------------------------

        if (
            !boat_mode &&
            (
                !playerPassenger ||
                playerPassenger[0] !== true
            )
        ) {

            var availablePlayerSlots = [];

            for (var door of eligibleDoors) {

                for (var slot of [-1, 1]) {

                    var key =
                    door.index + ":" + slot;

                    if (allOccupiedSlots.has(key)) {
                        continue;
                    }

                    availablePlayerSlots.push({
                        door: door,
                        slot: slot
                    });
                }
            }

            if (availablePlayerSlots.length > 0) {

                var selectedPlayerSlot =
                availablePlayerSlots[
                    Math.floor(
                        Math.random() *
                        availablePlayerSlots.length
                    )
                ];

                var playerDoor =
                selectedPlayerSlot.door;

                var playerSlot =
                selectedPlayerSlot.slot;

                var playerDistance =
                Math.random() < 0.5 ? 0.8 : 0.9;

                if (!playerPassenger) {

                    playerPassenger = [

                        false,

                        playerDoor.index,

                        playerDoor.side *
                        freeRoamDistance *
                        playerDistance,

                        playerDoor.routeZ +
                        playerSlot *
                        playerDoor.width * (boat_mode ? 0.35 : 0.5),

                        playerDoor.yaw -
                        playerDoor.side * (Math.PI / 2),

                        false,

                        Math.floor(Math.random() * 4),

                        Math.floor(Math.random() * 4),

                        Math.floor(Math.random() * 4),

                        Math.floor(Math.random() * 4)
                    ];

                    playerPassenger._isPlayerPassenger = true;

                    passengers.unshift(playerPassenger);

                } else {

                    playerPassenger[0] = false;

                    playerPassenger[1] =
                    playerDoor.index;

                    playerPassenger[2] =
                    playerDoor.side *
                    freeRoamDistance *
                    playerDistance;

                    playerPassenger[3] =
                    playerDoor.routeZ +
                    playerSlot *
                    playerDoor.width * 0.5;

                    playerPassenger[4] =
                    playerDoor.yaw -
                    playerDoor.side * (Math.PI / 2);

                    playerPassenger[5] = false;
                }

                playerPassenger._isPlayerPassenger = true;

                playerPassenger._doorSlot = playerSlot;

                playerPassenger._doorSide =
                playerDoor.side;

                playerPassenger._phase = "player";

                playerPassenger._stationIndex =
                passengerStationIndex;

                playerPassenger._stationStop =
                stationStop;

                playerPassenger._stationTrack =
                stationTrack;

                playerPassenger._trackOffset =
                playerDoor.trackOffset;

                playerPassenger._freeroamX =
                freeRoamDistance;

                if (
                    typeof freeroamY !== "undefined" &&
                    !playerPassenger._height
                ) {
                    playerPassenger._height =
                    Number(freeroamY) || 0;
                }
            }
        }

        // ----------------------------------------------------
        // REBUILD PASSENGER LIST
        // ----------------------------------------------------

        passengers = playerPassenger
        ? [playerPassenger]
        : [];

        for (var onboardPassenger of onboardPassengers) {
            passengers.push(onboardPassenger);
        }

        // ----------------------------------------------------
        // RESERVE OCCUPIED POSITIONS
        //
        // Keep non-alighting passengers and passenger zero
        // out of the boarding allocation.
        // Alighting passengers' positions can be reused.
        // ----------------------------------------------------

        var reservedSlots = new Set();

        for (var onboardPassenger of onboardPassengers) {

            if (onboardPassenger._wantsToAlight) {
                continue;
            }

            reservedSlots.add(
                Number(onboardPassenger[1]) +
                ":" +
                Number(onboardPassenger._doorSlot)
            );
        }

        if (playerPassenger) {

            reservedSlots.add(
                Number(playerPassenger[1]) +
                ":" +
                Number(playerPassenger._doorSlot)
            );
        }

        // ----------------------------------------------------
        // FIND WHICH POSITIONS ARE BEING VACATED
        // ----------------------------------------------------

        var alightingBySlot = new Map();

        for (var onboardPassenger of onboardPassengers) {

            if (!onboardPassenger._wantsToAlight) {
                continue;
            }

            var key =
            Number(onboardPassenger[1]) +
            ":" +
            Number(onboardPassenger._doorSlot);

            alightingBySlot.set(key, onboardPassenger);
        }

        // ----------------------------------------------------
        // GET AVAILABLE BOARDING POSITIONS
        // ----------------------------------------------------

        var availableSlots = [];

        for (var door of eligibleDoors) {

            for (var slot of [-1, 1]) {

                var key =
                door.index + ":" + slot;

                if (reservedSlots.has(key)) {
                    continue;
                }

                availableSlots.push({
                    door: door,
                    slot: slot,
                    key: key
                });
            }
        }

        // Shuffle available positions so boarding is spread
        // across the train rather than always filling the
        // first coach.
        for (
            var i = availableSlots.length - 1;
        i > 0;
        i--
        ) {

            var j = Math.floor(Math.random() * (i + 1));

            var temporary = availableSlots[i];

            availableSlots[i] = availableSlots[j];

            availableSlots[j] = temporary;
        }

        // Never try to create more passengers than there are
        // unoccupied physical positions.
        boardingCount = Math.min(
            boardingCount,
            availableSlots.length
        );

        // ----------------------------------------------------
        // CREATE WAITING PASSENGERS
        // ----------------------------------------------------

        for (
            var i = 0;
        i < boardingCount;
        i++
        ) {

            var position = availableSlots[i];

            var door = position.door;
            var slot = position.slot;

            var platformDistance =
            Math.random() < 0.5 ? 0.8 : 0.9;

            var passenger = [

                false,

                door.index,

                door.side *
                freeRoamDistance *
                platformDistance,

                door.routeZ +
                slot * door.width * 0.5,

                door.yaw -
                door.side * (Math.PI / 2),

                false,

                Math.floor(Math.random() * 4),

                Math.floor(Math.random() * 4),

                Math.floor(Math.random() * 4),

                Math.floor(Math.random() * 4)
            ];

            passenger._doorSlot = slot;

            passenger._doorSide = door.side;

            passenger._phase = "waiting";

            passenger._stationIndex =
            passengerStationIndex;

            passenger._stationStop =
            stationStop;

            passenger._stationTrack =
            stationTrack;

            passenger._trackOffset =
            door.trackOffset;

            passenger._freeroamX =
            freeRoamDistance;

            passenger._wantsToAlight = false;

            passenger._forceAlight = false;

            // If this physical position is occupied by an
            // alighting passenger, ensure that passenger
            // leaves to make room for the incoming passenger.
            var outgoingPassenger =
            alightingBySlot.get(position.key);

            if (outgoingPassenger) {
                outgoingPassenger._forceAlight = true;
            }

            passengers.push(passenger);
        }


    }

    // --------------------------------------------------------
    // CURRENT STATION
    // --------------------------------------------------------

    var activeStopDistance =
    getStationStopDistance(passengerStationIndex);

    var atStation =
    Math.abs(trainPosition - activeStopDistance) <=
    stopAccuracy;

    // --------------------------------------------------------
    // MOVE PASSENGER TOWARDS TARGET
    // --------------------------------------------------------

    // ------------------------------------------------------------
    // MOVE PASSENGER AND SET YAW TO ACTUAL DIRECTION OF MOVEMENT
    // ------------------------------------------------------------

    function movePassengerTo(
        passenger,
        targetX,
        targetZ,
        maximumDistance
    ) {

        var currentX = Number(passenger[2]);
        var currentZ = Number(passenger[3]);

        var dx = targetX - currentX;
        var dz = targetZ - currentZ;

        var distance = Math.hypot(dx, dz);

        if (distance <= 0.001) {

            passenger[2] = targetX;
            passenger[3] = targetZ;

            return true;
        }

        if (maximumDistance <= 0) {
            return false;
        }

        var fraction = Math.min(
            1,
            maximumDistance / distance
        );

        var moveX = dx * fraction;
        var moveZ = dz * fraction;

        // --------------------------------------------------------
        // GET WORLD HEADING OF THE MOVEMENT
        // --------------------------------------------------------

        var movementHeading = NaN;

        if (passenger[0] === true) {

            // Onboard passengers use coach-local coordinates.

            var movementDoor =
            door_positions[Math.floor(Number(passenger[1]))];

            if (movementDoor) {

                var movementCoach =
                coach_positions[
                    Number(movementDoor.coach)
                ];

                if (movementCoach) {
                    movementHeading =
                    Number(movementCoach[7]);
                }
            }

        } else {

            // Platform passengers use lateral X and route-distance Z.

            var movementSample = sampleAt(
                currentZ + moveZ * 0.5,
                false
            );

            if (movementSample) {
                movementHeading =
                Number(movementSample.heading);
            }
        }

        // --------------------------------------------------------
        // FACE THE ACTUAL DIRECTION OF TRAVEL
        // --------------------------------------------------------

        if (Number.isFinite(movementHeading)) {

            var worldYaw =
            movementHeading + Math.atan2(moveX, moveZ);

            passenger[4] = Math.atan2(
                Math.sin(worldYaw),
                                      Math.cos(worldYaw)
            );
        }

        // --------------------------------------------------------
        // UPDATE POSITION
        // --------------------------------------------------------

        passenger[2] = currentX + moveX;
        passenger[3] = currentZ + moveZ;

        if (fraction >= 1) {

            passenger[2] = targetX;
            passenger[3] = targetZ;

            return true;
        }

        return false;
    }

    // --------------------------------------------------------
    // START BOARDING AND ALIGHTING
    //
    // Both sides of the same physical doorway use the
    // appropriate door control. Passengers occupying the
    // same slot receive the same delay.
    // --------------------------------------------------------

    if (atStation) {

        for (var passenger of passengers) {

            if (
                !passenger ||
                passenger._isPlayerPassenger === true
            ) {
                continue;
            }

            var door =
            door_positions[Number(passenger[1])];

            if (!door) continue;

            var side = Number(passenger._doorSide);

            if (side !== -1 && side !== 1) {
                side = Number(door.side) < 0 ? -1 : 1;
            }

            var doorMode = side === -1
            ? Number(left_doors_mode)
            : Number(right_doors_mode);

            var doorOpening = side === -1
            ? Number(left_doors)
            : Number(right_doors);

            var doorIsOpen =
            (
                doorMode === 2 ||
                doorMode < 0
            ) &&
            doorOpening >= 0.999;

            if (!doorIsOpen) continue;

            var slot = Number(passenger._doorSlot);

            if (slot !== -1 && slot !== 1) {
                slot = 1;
            }
            if (boat_mode){var delay = slot > 0 ? 1400 : 2000}else{var delay = slot > 0 ? 600 : 1400}


            if (
                passenger[0] === false &&
                passenger._phase === "waiting"
            ) {

                passenger._phase = "board_approach";

                passenger._delayUntil = now + delay;
            }

            else if (
                passenger[0] === true &&
                passenger._phase === "onboard" &&
                (
                    passenger._wantsToAlight === true ||
                    passenger._forceAlight === true
                )
            ) {

                passenger._phase = "alight_inside";


                if (boat_mode){passenger._delayUntil =  now + (slot > 0 ? 800 : 0)}else{passenger._delayUntil =  now + (slot > 0 ? 1000 : 0)}




            }
        }
    }

    // --------------------------------------------------------
    // MOVE PASSENGERS
    // --------------------------------------------------------



















    for (var passenger of passengers) {

        if (!passenger) continue;

        if (passenger._isPlayerPassenger === true) {
            continue;
        }

        var door =
        door_positions[Number(passenger[1])];

        if (!door) continue;

        var coach =
        coach_positions[Number(door.coach)];

        if (!coach) continue;

        var side = Number(passenger._doorSide);

        if (side !== -1 && side !== 1) {
            side = Number(door.side) < 0 ? -1 : 1;
        }

        var doorLocalZ = Number(door.localZ);
        var doorWidth = Number(door.width);

        var coachRouteDistance = Number(coach[1]);
        var coachYaw = Number(coach[7]);

        if (
            !Number.isFinite(doorLocalZ) ||
            !Number.isFinite(doorWidth) ||
            !Number.isFinite(coachRouteDistance)
        ) {
            continue;
        }

        if (!Number.isFinite(coachYaw)) {
            coachYaw = 0;
        }

        var doorRoute =
        coachRouteDistance + doorLocalZ;

         var doorHalfWidth = doorWidth * (boat_mode ? 0.35 : 0.5);

        var edgeX = side * (boat_mode ? 0.5 : width * 0.5);

        var passengerFreeRoamX =
        Number(passenger._freeroamX);

        if (!Number.isFinite(passengerFreeRoamX)) {
            passengerFreeRoamX = freeRoamDistance;
        }

        var exitX =
        side * passengerFreeRoamX;

        var slot = Number(passenger._doorSlot);

        if (slot !== -1 && slot !== 1) {
            slot = 1;
        }

        passenger[5] = false;

        // ----------------------------------------------------
        // DELAY
        // ----------------------------------------------------

        if (
            passenger._phase === "board_approach" ||
            passenger._phase === "board_inside" ||
            passenger._phase === "alight_inside" ||
            passenger._phase === "alight_exit"
        ) {

            if (now < Number(passenger._delayUntil || 0)) {
                continue;
            }
        }

        // ----------------------------------------------------
        // BOARDING: PLATFORM TO TRAIN EDGE
        // ----------------------------------------------------

        if (passenger._phase === "board_approach") {

            passenger[4] =
            coachYaw - side * (Math.PI / 2);

            var boardApproachTargetX = edgeX;

            if (boat_mode) {

                var boardApproachTrackOffset =
                Number(passenger._trackOffset);

                if (!Number.isFinite(boardApproachTrackOffset)) {
                    boardApproachTrackOffset =
                    Number(coach[0]) || 0;
                }

                // Find the actual boat centre at the doorway.
                var boardApproachSample =
                sampleAt(doorRoute, false);

                if (boardApproachSample) {

                    var boardApproachCentre =
                    worldPoint(boardApproachSample, 0, 0);

                    var boardApproachOne =
                    worldPoint(boardApproachSample, 1, 0);

                    if (boardApproachCentre && boardApproachOne) {

                        var boardApproachRightX =
                        Number(boardApproachOne.x) -
                        Number(boardApproachCentre.x);

                        var boardApproachRightZ =
                        Number(boardApproachOne.z) -
                        Number(boardApproachCentre.z);

                        var boardApproachLength =
                        boardApproachRightX * boardApproachRightX +
                        boardApproachRightZ * boardApproachRightZ;

                        if (boardApproachLength > 0.000001) {

                            var boardApproachWorldX =
                            Number(coach[4]) +
                            Math.sin(coachYaw) * doorLocalZ;

                            var boardApproachWorldZ =
                            Number(coach[5]) +
                            Math.cos(coachYaw) * doorLocalZ;

                            var boardApproachDX =
                            boardApproachWorldX -
                            Number(boardApproachCentre.x);

                            var boardApproachDZ =
                            boardApproachWorldZ -
                            Number(boardApproachCentre.z);

                            var boardApproachLateral =
                            (
                                boardApproachDX * boardApproachRightX +
                                boardApproachDZ * boardApproachRightZ
                            ) / boardApproachLength;

                            boardApproachTargetX =
                            boardApproachLateral -
                            boardApproachTrackOffset +
                            side * 0.5;
                        }
                    }
                }
            }

            passenger[5] =
            Math.hypot(
                boardApproachTargetX - passenger[2],
                doorRoute - passenger[3]
            ) > 0.001;

            if (
                movePassengerTo(
                    passenger,
                    boardApproachTargetX,
                    doorRoute,
                    maximumMovement
                )
            ) {

                if (!boat_mode) {

                    // Original normal train handover.
                    passenger[2] =
                    edgeX - (
                        Number.isFinite(Number(coach[0]))
                        ? Number(coach[0])
                        : 0
                    );

                    passenger[3] = doorLocalZ;

                    passenger[0] = true;
                }

                passenger._phase = "board_inside";

                passenger[5] = false;
            }
        }

        // ----------------------------------------------------
        // BOARDING: TRAIN EDGE TO COACH INTERIOR
        // ----------------------------------------------------

        else if (passenger._phase === "board_inside") {

            passenger[4] =
            coachYaw + (slot > 0 ? 0 : Math.PI);

            var boardTargetZ = boat_mode
            ? doorRoute + slot * doorHalfWidth
            : doorLocalZ + slot * doorHalfWidth;

            var boardTargetX = 0;

            var boardTrackOffset = 0;

            if (boat_mode) {

                boardTrackOffset =
                Number(passenger._trackOffset);

                if (!Number.isFinite(boardTrackOffset)) {
                    boardTrackOffset = Number(coach[0]) || 0;
                }

                // Find the position of the boat centre at the
                // passenger's actual boarding destination.
                var boardSample =
                sampleAt(boardTargetZ, false);

                if (boardSample) {

                    var boardCentre =
                    worldPoint(boardSample, 0, 0);

                    var boardOne =
                    worldPoint(boardSample, 1, 0);

                    if (boardCentre && boardOne) {

                        var boardRightX =
                        Number(boardOne.x) -
                        Number(boardCentre.x);

                        var boardRightZ =
                        Number(boardOne.z) -
                        Number(boardCentre.z);

                        var boardRightLength =
                        boardRightX * boardRightX +
                        boardRightZ * boardRightZ;

                        if (boardRightLength > 0.000001) {

                            var boardLocalTargetZ =
                            boardTargetZ - coachRouteDistance;

                            var boardWorldX =
                            Number(coach[4]) +
                            Math.sin(coachYaw) * boardLocalTargetZ;

                            var boardWorldZ =
                            Number(coach[5]) +
                            Math.cos(coachYaw) * boardLocalTargetZ;

                            var boardDX =
                            boardWorldX - Number(boardCentre.x);

                            var boardDZ =
                            boardWorldZ - Number(boardCentre.z);

                            var boardLateral =
                            (
                                boardDX * boardRightX +
                                boardDZ * boardRightZ
                            ) / boardRightLength;

                            boardTargetX =
                            boardLateral - boardTrackOffset;
                        }
                    }
                }
            }

            passenger[5] =
            Math.hypot(
                boardTargetX - passenger[2],
                boardTargetZ - passenger[3]
            ) > 0.001;

            if (
                movePassengerTo(
                    passenger,
                    boardTargetX,
                    boardTargetZ,
                    maximumMovement
                )
            ) {

                if (boat_mode) {

                    // Convert the exact platform world position
                    // into coach-local coordinates without moving
                    // the passenger visually.

                    var boardingSample =
                    sampleAt(Number(passenger[3]), false);

                    var boardingPoint = boardingSample
                    ? worldPoint(
                        boardingSample,
                        boardTrackOffset + Number(passenger[2]),
                                 0
                    )
                    : null;

                    if (!boardingPoint) {
                        continue;
                    }

                    var boardingDX =
                    Number(boardingPoint.x) - Number(coach[4]);

                    var boardingDZ =
                    Number(boardingPoint.z) - Number(coach[5]);

                    passenger[2] =
                    Math.cos(coachYaw) * boardingDX -
                    Math.sin(coachYaw) * boardingDZ;

                    passenger[3] =
                    Math.sin(coachYaw) * boardingDX +
                    Math.cos(coachYaw) * boardingDZ;

                    passenger[0] = true;

                } else {

                    // Original normal train completion.
                    passenger[0] = true;

                    passenger[2] = 0;

                    passenger[3] =
                    doorLocalZ + slot * doorHalfWidth;
                }

                passenger._phase = "onboard";

                passenger._wantsToAlight = false;

                passenger._forceAlight = false;

                passenger[5] = false;
            }
        }

        // ----------------------------------------------------
        // ALIGHTING: COACH TO DOOR EDGE
        // ----------------------------------------------------

        else if (passenger._phase === "alight_inside") {
            if (boat_mode) {
                edgeX = side * 0.1;
            }

            passenger[4] =
            coachYaw + side * (Math.PI / 2);

            passenger[5] =
            Math.hypot(
                edgeX - passenger[2],
                doorLocalZ - passenger[3]
            ) > 0.001;

            if (
                movePassengerTo(
                    passenger,
                    edgeX,
                    doorLocalZ,
                    maximumMovement
                )
            ) {

                // Exact passenger position in coach-local coordinates.
                var exitLocalX = Number(passenger[2]);
                var exitLocalZ = Number(passenger[3]);

                // Convert the passenger's position into world coordinates.
                var exitWorldX =
                Number(coach[4]) +
                Math.cos(coachYaw) * exitLocalX +
                Math.sin(coachYaw) * exitLocalZ;

                var exitWorldZ =
                Number(coach[5]) -
                Math.sin(coachYaw) * exitLocalX +
                Math.cos(coachYaw) * exitLocalZ;

                // Get the track position at the passenger's exit point.
                var exitSample = sampleAt(doorRoute, false);

                var trackCentre = exitSample
                ? worldPoint(exitSample, 0, 0)
                : null;

                var trackOne = exitSample
                ? worldPoint(exitSample, 1, 0)
                : null;

                if (trackCentre && trackOne) {

                    var rightX =
                    Number(trackOne.x) - Number(trackCentre.x);

                    var rightZ =
                    Number(trackOne.z) - Number(trackCentre.z);

                    var rightLengthSquared =
                    rightX * rightX + rightZ * rightZ;

                    if (rightLengthSquared > 0.000001) {

                        var dx =
                        exitWorldX - Number(trackCentre.x);

                        var dz =
                        exitWorldZ - Number(trackCentre.z);

                        var lateralPosition =
                        (dx * rightX + dz * rightZ) /
                        rightLengthSquared;

                        var trackOffset =
                        Number(passenger._trackOffset);

                        if (!Number.isFinite(trackOffset)) {
                            trackOffset = Number(coach[0]);
                        }

                        if (!Number.isFinite(trackOffset)) {
                            trackOffset = 0;
                        }

                        // Convert into the platform passenger coordinate system.

                        passenger._alightExitX =
                        (
                            Number.isFinite(Number(coach[0]))
                            ? Number(coach[0])
                            : trackOffset
                        ) +
                        side * passengerFreeRoamX -
                        trackOffset;

                        passenger._exitWalkZ = null;
                        passenger._exitDiagonalX = null;
                        passenger._exitDiagonalDirection = null;
                        passenger._exitWalkAngle = null;
                        passenger[0] = false;

                        passenger[2] =
                        lateralPosition - trackOffset;

                        passenger[3] = doorRoute;

                        passenger._phase = "alight_exit";

                        passenger._wantsToAlight = false;

                        passenger._forceAlight = false;

                        passenger[5] = false;
                    }
                }
            }
        }

        // ----------------------------------------------------
        // ALIGHTING: WALK PERPENDICULARLY ONTO PLATFORM
        //
        // Z remains fixed. Only X changes.
        // ----------------------------------------------------

        // ----------------------------------------------------
        // ALIGHTING: WALK ONTO PLATFORM
        //
        // Normally walks perpendicular to the train.
        // If another passenger is directly in the exit path,
        // take a diagonal route around them.
        // ----------------------------------------------------

        else if (
            passenger._phase === "alight_exit" &&
            boat_mode
        ) {

            var boatExitStartX = Number(passenger[2]);
            var boatExitStartZ = Number(passenger[3]);

            var boatExitTargetX =
            Number.isFinite(passenger._alightExitX)
            ? passenger._alightExitX
            : exitX;

            var boatExitRemainingX =
            boatExitTargetX - boatExitStartX;

            // ----------------------------------------------------
            // CHECK ALL INCOMING PASSENGERS
            // ----------------------------------------------------

            var boatIncomingAngles = [];

            for (var boatIncoming of passengers) {

                if (
                    !boatIncoming ||
                    boatIncoming === passenger
                ) {
                    continue;
                }

                if (
                    boatIncoming._phase !== "board_approach" &&
                    boatIncoming._phase !== "board_inside"
                ) {
                    continue;
                }

                var boatIncomingDoor =
                door_positions[Number(boatIncoming[1])];

                if (!boatIncomingDoor) continue;

                var boatIncomingCoach =
                coach_positions[Number(boatIncomingDoor.coach)];

                if (!boatIncomingCoach) continue;

                var boatIncomingSide =
                Number(boatIncoming._doorSide);

                if (
                    boatIncomingSide !== -1 &&
                    boatIncomingSide !== 1
                ) {
                    boatIncomingSide =
                    Number(boatIncomingDoor.side) < 0 ? -1 : 1;
                }

                var boatIncomingRoute =
                Number(boatIncomingCoach[1]) +
                Number(boatIncomingDoor.localZ);

                var boatIncomingTargetX;
                var boatIncomingTargetZ;

                if (boatIncoming._phase === "board_approach") {

                    boatIncomingTargetX =
                    boatIncomingSide * width * 0.5;

                    boatIncomingTargetZ =
                    boatIncomingRoute;

                } else {

                    var boatIncomingSlot =
                    Number(boatIncoming._doorSlot);

                    if (
                        boatIncomingSlot !== -1 &&
                        boatIncomingSlot !== 1
                    ) {
                        boatIncomingSlot = 1;
                    }

                    var boatIncomingWidth =
                    Number(boatIncomingDoor.width);

                    if (!Number.isFinite(boatIncomingWidth)) {
                        continue;
                    }

                    boatIncomingTargetX = 0;

                    boatIncomingTargetZ =
                    boatIncomingRoute +
                    boatIncomingSlot * boatIncomingWidth * 0.35;
                }

                var boatIncomingDX =
                boatIncomingTargetX - Number(boatIncoming[2]);

                var boatIncomingDZ =
                boatIncomingTargetZ - Number(boatIncoming[3]);

                if (
                    Math.hypot(
                        boatIncomingDX,
                        boatIncomingDZ
                    ) < 0.001
                ) {
                    continue;
                }

                var boatIncomingAngle =
                Math.atan2(
                    boatIncomingDX,
                    boatIncomingDZ
                ) * 180 / Math.PI;

                boatIncomingAngle =
                (boatIncomingAngle % 180 + 180) % 180;

                boatIncomingAngles.push(boatIncomingAngle);
            }

            // ----------------------------------------------------
            // CHECK WHETHER A STRAIGHT 90 DEGREE EXIT IS SAFE
            // ----------------------------------------------------

            var boatStraightSafe = true;

            for (var boatCheckAngle of boatIncomingAngles) {

                var boatCheckDifference =
                Math.abs(90 - boatCheckAngle);

                boatCheckDifference =
                Math.min(
                    boatCheckDifference,
                    180 - boatCheckDifference
                );

                if (boatCheckDifference < 44.999) {
                    boatStraightSafe = false;
                    break;
                }
            }

            // ----------------------------------------------------
            // STRAIGHT EXIT WHEN THERE IS NO COLLISION RISK
            // ----------------------------------------------------

            if (
                boatStraightSafe ||
                Math.abs(boatExitRemainingX) < 0.001
            ) {

                passenger[4] =
                coachYaw +
                Math.atan2(
                    boatExitTargetX - boatExitStartX,
                    0
                );

                passenger[5] =
                Math.abs(boatExitRemainingX) > 0.001;

                if (
                    movePassengerTo(
                        passenger,
                        boatExitTargetX,
                        boatExitStartZ,
                        maximumMovement
                    )
                ) {

                    passenger[2] = boatExitTargetX;
                    passenger[3] = boatExitStartZ;

                    passenger._phase = "alighted";

                    passenger._alightExitX = null;
                    passenger._exitWalkAngle = null;
                    passenger._exitWalkZ = null;
                    passenger._exitDiagonalX = null;
                    passenger._exitDiagonalDirection = null;

                    passenger[5] = false;
                }
            }

            // ----------------------------------------------------
            // COLLISION RISK: SELECT THE CLOSEST SAFE ANGLE TO 90
            // ----------------------------------------------------

            else {

                var boatCandidateAngles = [90];

                for (var boatIncomingAngle of boatIncomingAngles) {

                    boatCandidateAngles.push(
                        (boatIncomingAngle + 45) % 180
                    );

                    boatCandidateAngles.push(
                        (boatIncomingAngle + 135) % 180
                    );
                }

                var boatBestAngle = 90;
                var boatBestDeviation = Infinity;
                var boatBestClearance = -Infinity;

                // Find the closest angle to 90 which is at least
                // 45 degrees away from EVERY incoming passenger.

                for (var boatCandidate of boatCandidateAngles) {

                    var boatCandidateAllowed = true;
                    var boatCandidateClearance = 180;

                    for (var boatIncomingAngle of boatIncomingAngles) {

                        var boatDifference =
                        Math.abs(
                            boatCandidate - boatIncomingAngle
                        );

                        boatDifference =
                        Math.min(
                            boatDifference,
                            180 - boatDifference
                        );

                        boatCandidateClearance =
                        Math.min(
                            boatCandidateClearance,
                            boatDifference
                        );

                        if (boatDifference < 44.999) {
                            boatCandidateAllowed = false;
                            break;
                        }
                    }

                    if (!boatCandidateAllowed) continue;

                    var boatDeviation =
                    Math.abs(boatCandidate - 90);

                    if (
                        boatDeviation < boatBestDeviation - 0.0001 ||
                        (
                            Math.abs(
                                boatDeviation - boatBestDeviation
                            ) <= 0.0001 &&
                            boatCandidateClearance > boatBestClearance
                        )
                    ) {

                        boatBestAngle = boatCandidate;
                        boatBestDeviation = boatDeviation;
                        boatBestClearance = boatCandidateClearance;
                    }
                }

                // Safety fallback: if no candidate satisfies every
                // constraint, choose the candidate with the greatest
                // clearance rather than leaving the passenger stationary.

                if (!Number.isFinite(boatBestDeviation)) {

                    boatBestClearance = -Infinity;
                    boatBestDeviation = Infinity;

                    for (var boatCandidate of boatCandidateAngles) {

                        var boatMinimumClearance = 180;

                        for (var boatIncomingAngle of boatIncomingAngles) {

                            var boatDifference =
                            Math.abs(
                                boatCandidate - boatIncomingAngle
                            );

                            boatDifference =
                            Math.min(
                                boatDifference,
                                180 - boatDifference
                            );

                            boatMinimumClearance =
                            Math.min(
                                boatMinimumClearance,
                                boatDifference
                            );
                        }

                        var boatDeviation =
                        Math.abs(boatCandidate - 90);

                        if (
                            boatMinimumClearance > boatBestClearance ||
                            (
                                Math.abs(
                                    boatMinimumClearance -
                                    boatBestClearance
                                ) < 0.0001 &&
                                boatDeviation < boatBestDeviation
                            )
                        ) {

                            boatBestAngle = boatCandidate;
                            boatBestClearance = boatMinimumClearance;
                            boatBestDeviation = boatDeviation;
                        }
                    }
                }

                passenger._exitWalkAngle = boatBestAngle;

                // ----------------------------------------------------
                // WALK A SHORT DISTANCE ALONG THE SELECTED ANGLE
                //
                // Recalculate each update so two incoming passengers
                // are continually taken into account.
                // ----------------------------------------------------

                var boatExitDirection =
                boatExitRemainingX >= 0 ? 1 : -1;

                var boatAngleRadians =
                boatBestAngle * Math.PI / 180;

                var boatStepX =
                boatExitDirection *
                0.6 *
                Math.sin(boatAngleRadians);

                var boatStepZ =
                boatExitDirection *
                0.6 *
                Math.cos(boatAngleRadians);

                // Prevent the sidestep from passing the exit X limit.
                if (
                    Math.abs(boatStepX) >
                    Math.abs(boatExitRemainingX)
                ) {

                    var boatStepScale =
                    Math.abs(boatExitRemainingX) /
                    Math.abs(boatStepX);

                    boatStepX *= boatStepScale;
                    boatStepZ *= boatStepScale;
                }

                var boatAvoidTargetX =
                boatExitStartX + boatStepX;

                var boatAvoidTargetZ =
                boatExitStartZ + boatStepZ;

                passenger[4] =
                coachYaw +
                Math.atan2(
                    boatStepX,
                    boatStepZ
                );

                passenger[5] = true;

                movePassengerTo(
                    passenger,
                    boatAvoidTargetX,
                    boatAvoidTargetZ,
                    maximumMovement
                );
            }
        }










        else if ((passenger._phase === "alight_exit") && (!boat_mode)){

            var fixedZ = Number(passenger[3]);

            var alightTargetX =
            Number.isFinite(passenger._alightExitX)
            ? passenger._alightExitX
            : exitX;

            var exitDirection =
            alightTargetX >= Number(passenger[2]) ? 1 : -1;

            var remainingDistance =
            Math.abs(alightTargetX - Number(passenger[2]));

            // Check for passengers obstructing the exit path.
            if (!Number.isFinite(passenger._exitWalkZ)) {

                var obstruction = false;
                var positiveCrowd = 0;
                var negativeCrowd = 0;

                for (var other of passengers) {

                    if (!other || other === passenger) continue;

                    if (
                        other._phase !== "waiting" &&
                        other._phase !== "alighted" &&
                        other._phase !== "alight_exit" &&
                        other._phase !== "board_approach"
                    ) {
                        continue;
                    }

                    var otherX = Number(other[2]);
                    var otherZ = Number(other[3]);

                    if (
                        !Number.isFinite(otherX) ||
                        !Number.isFinite(otherZ)
                    ) {
                        continue;
                    }

                    var otherTargetX =
                    other._phase === "alight_exit" &&
                    Number.isFinite(other._alightExitX)
                    ? Number(other._alightExitX)
                    : otherX;

                    var pathMinX =
                    Math.min(Number(passenger[2]), alightTargetX);

                    var pathMaxX =
                    Math.max(Number(passenger[2]), alightTargetX);

                    var otherMinX =
                    Math.min(otherX, otherTargetX);

                    var otherMaxX =
                    Math.max(otherX, otherTargetX);

                    if (
                        otherMaxX < pathMinX - 0.6 ||
                        otherMinX > pathMaxX + 0.6
                    ) {
                        continue;
                    }

                    if (Math.abs(otherZ - fixedZ) < 0.8) {
                        obstruction = true;
                    }

                    if (Math.abs(otherZ - (fixedZ + 0.8)) < 0.8) {
                        positiveCrowd++;
                    }

                    if (Math.abs(otherZ - (fixedZ - 0.8)) < 0.8) {
                        negativeCrowd++;
                    }
                }

                if (obstruction) {

                    var zDirection =
                    positiveCrowd < negativeCrowd ? 1 :
                    negativeCrowd < positiveCrowd ? -1 :
                    exitDirection;

                    passenger._exitWalkZ =
                    fixedZ + zDirection * 0.8;

                    passenger._exitDiagonalX =
                    Number(passenger[2]) +
                    exitDirection * Math.min(0.8, remainingDistance);

                    passenger._exitDiagonalDirection = zDirection;
                }
            }

            var targetX = alightTargetX;

            var targetZ =
            Number.isFinite(passenger._exitWalkZ)
            ? passenger._exitWalkZ
            : fixedZ;

            // First move diagonally around the obstruction.
            if (Number.isFinite(passenger._exitDiagonalX)) {

                targetX = passenger._exitDiagonalX;

                passenger[4] =
                coachYaw +
                exitDirection *
                (
                    passenger._exitDiagonalDirection > 0
                    ? Math.PI / 4
                    : 3 * Math.PI / 4
                );

            } else {

                passenger[4] =
                coachYaw + side * (Math.PI / 2);
            }

            passenger[5] =
            Math.hypot(
                targetX - passenger[2],
                targetZ - passenger[3]
            ) > 0.001;

            if (
                movePassengerTo(
                    passenger,
                    targetX,
                    targetZ,
                    maximumMovement
                )
            ) {

                // Diagonal dodge complete; continue towards the exit.
                if (Number.isFinite(passenger._exitDiagonalX)) {

                    passenger._exitDiagonalX = null;

                    passenger._exitDiagonalDirection = null;

                    passenger[5] = false;

                } else {

                    passenger[2] = alightTargetX;

                    passenger[3] = targetZ;

                    passenger._phase = "alighted";

                    passenger._alightExitX = null;
                    passenger._exitWalkZ = null;
                    passenger._exitDiagonalX = null;
                    passenger._exitDiagonalDirection = null;

                    passenger[5] = false;
                }
            }
        }



























        // ----------------------------------------------------
        // WAITING OR ALIGHTED ON PLATFORM
        // ----------------------------------------------------

        else if (
            passenger._phase === "waiting" ||
            passenger._phase === "alighted"
        ) {

            var platformSample =
            sampleAt(Number(passenger[3]), false);

            if (
                platformSample &&
                Number.isFinite(Number(platformSample.heading))
            ) {

                passenger[4] =
                Number(platformSample.heading) -
                side * (Math.PI / 2);
            }

            passenger[5] = false;
        }

        // ----------------------------------------------------
        // ONBOARD
        // ----------------------------------------------------

        else if (passenger._phase === "onboard") {

            passenger[4] =
            coachYaw + (slot > 0 ? 0 : Math.PI);

            passenger[5] = false;
        }
    }



















    if (stationChanged) {
        refresh_waiting_passenger_platforms();
    }
}




function update_player_passenger() {

    if (
        camera_view !== 8 ||
        !Array.isArray(passengers) ||
        !passengers[0] ||
        passengers[0]._isPlayerPassenger !== true
    ) {
        return;
    }

    var p = passengers[0];

    var frameRate = Number(fps);

    if (!Number.isFinite(frameRate) || frameRate <= 0) return;

    var dt = Math.min(0.05, 1 / frameRate);

    // --------------------------------------------------------
    // TRAIN DIMENSIONS
    // --------------------------------------------------------

    var halfWidth = Number(trainWidth) * 0.5;
    var halfCoachLength = Number(coachlength) * 0.5;

    if (
        !Number.isFinite(halfWidth) ||
        halfWidth <= 0 ||
        !Number.isFinite(halfCoachLength) ||
        halfCoachLength <= 0
    ) {
        return;
    }

    var interiorLimit = halfWidth - 0.5;
    var platformLimit = halfWidth + 0.5;

    // Keep the player 2m inside the actual cab end.
    // Negative overhang values shorten the usable end position.
    var cabOverhang = Number(cab_overhang);

    if (!Number.isFinite(cabOverhang)) {
        cabOverhang = 0;
    }

    var cabEndLimit = Math.max(
        0,
        halfCoachLength + cabOverhang - 2
    );

    // --------------------------------------------------------
    // CURRENT TRAIN STATE AND ASSIGNED COACH
    // --------------------------------------------------------

    var onTrain = p[0] === true;

    var doorIndex = Math.floor(Number(p[1]));

    if (
        !Number.isFinite(doorIndex) ||
        doorIndex < 0 ||
        doorIndex >= door_positions.length
    ) {
        return;
    }

    // Physical door indexes are always even.
    doorIndex -= doorIndex % 2;

    var assignedDoor = door_positions[doorIndex];

    if (!assignedDoor) return;

    var currentCoachIndex = Number(assignedDoor.coach);

    // The player can use an unoccupied passenger reference slot
    // on another coach when the coach he is standing in is full.
    // Keep his real coach separately from that reference slot.
    if (onTrain) {

        var storedCoachIndex = Number(p._playerCoachIndex);

        if (
            Number.isInteger(storedCoachIndex) &&
            storedCoachIndex >= 0 &&
            storedCoachIndex < coach_positions.length &&
            coach_positions[storedCoachIndex]
        ) {
            currentCoachIndex = storedCoachIndex;

        } else {
            p._playerCoachIndex = currentCoachIndex;
        }

    } else {
        delete p._playerCoachIndex;
    }

    var currentCoach = coach_positions[currentCoachIndex];

    if (!currentCoach) return;

    var currentCoachRoute = Number(currentCoach[1]);
    var currentCoachYaw = Number(currentCoach[7]);

    if (!Number.isFinite(currentCoachRoute)) return;

    if (!Number.isFinite(currentCoachYaw)) {
        currentCoachYaw = 0;
    }

    // --------------------------------------------------------
    // CURRENT POSITION
    // --------------------------------------------------------

    var currentX = Number(p[2]);

    var currentRoute = onTrain
    ? currentCoachRoute + Number(p[3])
    : Number(p[3]);

    if (
        !Number.isFinite(currentX) ||
        !Number.isFinite(currentRoute)
    ) {
        return;
    }

    // --------------------------------------------------------
    // PLATFORM INFORMATION
    //
    // freeroamstart and freeroamend are absolute route
    // coordinates.
    // --------------------------------------------------------

    function parseSides(value) {

        if (
            value === undefined ||
            value === null ||
            value === ""
        ) {
            return null;
        }

        var name = String(value).toLowerCase();

        if (name === "left" || name === "-1") {
            return [-1];
        }

        if (name === "right" || name === "1") {
            return [1];
        }

        if (name === "both" || name === "all") {
            return [-1, 1];
        }

        return [];
    }

    function getPlatformZone(routeZ, preferredIndex, exactOnly) {

        if (
            !route ||
            !Array.isArray(route.stations) ||
            !Number.isFinite(routeZ)
        ) {
            return null;
        }

        function checkStation(index) {

            var station = route.stations[index];

            if (!station || station.type !== "station") {
                return null;
            }

            if (
                station.freeroamFromPlatform !== true &&
                station.freeroamFromPlatform !== "true"
            ) {
                return null;
            }

            if (
                String(station.freeroamSource || "")
                .toLowerCase() !== "platform"
            ) {
                return null;
            }

            var start = Number(station.freeroamstart);
            var end = Number(station.freeroamend);

            if (
                !Number.isFinite(start) ||
                !Number.isFinite(end)
            ) {
                return null;
            }

            var minimum = Math.min(start, end);
            var maximum = Math.max(start, end);

            if (
                routeZ < minimum ||
                routeZ > maximum
            ) {
                return null;
            }

            var doorSides = parseSides(station.doorSide);
            var stopSides = parseSides(station.stopSide);

            var allowedSides;

            if (
                doorSides === null &&
                stopSides === null
            ) {
                allowedSides = [1];

            } else if (doorSides === null) {

                allowedSides = stopSides;

            } else if (stopSides === null) {

                allowedSides = doorSides;

            } else {

                allowedSides = doorSides.filter(function(side) {
                    return stopSides.includes(side);
                });
            }

            if (!allowedSides || allowedSides.length === 0) {
                return null;
            }

            return {
                index: index,
                station: station,
                minimum: minimum,
                maximum: maximum,
                sides: allowedSides
            };
        }

        if (
            Number.isInteger(preferredIndex) &&
            preferredIndex >= 0 &&
            preferredIndex < route.stations.length
        ) {

            var preferred = checkStation(preferredIndex);

            if (preferred) return preferred;
        }

        if (exactOnly) return null;

        for (var i = 0; i < route.stations.length; i++) {

            if (i === preferredIndex) continue;

            var zone = checkStation(i);

            if (zone) return zone;
        }

        return null;
    }

    // --------------------------------------------------------
    // GET CURRENT PLATFORM ZONE
    // --------------------------------------------------------

    var currentZone = onTrain
    ? getPlatformZone(
        currentRoute,
        passengerStationIndex,
        false
    )
    : getPlatformZone(
        currentRoute,
        Number(p._stationIndex),
                      true
    );

    // A passenger on a platform cannot leave its configured
    // zone. An onboard passenger can still walk between coaches
    // even when there is no platform alongside the train.
    if (!onTrain && !currentZone) {
        p[5] = false;
        return;
    }

    // --------------------------------------------------------
    // FREEROAM X
    // --------------------------------------------------------

    function getFreeRoamX(zone) {

        var value = Number(p._freeroamX);

        if (!Number.isFinite(value)) {

            value =
            typeof freeroamX !== "undefined"
            ? Number(freeroamX)
            : NaN;
        }

        if (
            !Number.isFinite(value) &&
            zone &&
            zone.station
        ) {
            value = Number(zone.station.freeroamX);
        }

        if (!Number.isFinite(value)) {
            value = platformLimit + 1;
        }

        return Math.max(platformLimit, Math.abs(value));
    }

    var freeRoamDistance = getFreeRoamX(currentZone);

    // Give the player a unique door/slot reference. The reference
    // is used by the passenger list for occupancy bookkeeping; the
    // actual coach is stored separately in _playerCoachIndex.
    function findPlayerReferenceSlot(targetCoachIndex, targetRoute) {

        var occupiedSlots = new Set();

        for (var other of passengers) {

            if (
                !other ||
                other === p ||
                other._isPlayerPassenger === true
            ) {
                continue;
            }

            // Waiting and boarding passengers also own their
            // assigned slot; do not take it before they board.
            var otherPhase = String(other._phase || "");
            var otherOccupiesSlot =
            other[0] === true ||
            otherPhase === "waiting" ||
            otherPhase === "board_approach" ||
            otherPhase === "board_inside" ||
            otherPhase === "alight_exit";

            if (!otherOccupiesSlot) continue;

            var otherDoorIndex = Math.floor(Number(other[1]));

            if (
                !Number.isFinite(otherDoorIndex) ||
                otherDoorIndex < 0 ||
                otherDoorIndex >= door_positions.length
            ) {
                continue;
            }

            otherDoorIndex -= otherDoorIndex % 2;

            var otherDoor = door_positions[otherDoorIndex];

            if (!otherDoor) continue;

            var otherSlot = Number(other._doorSlot);

            if (otherSlot !== -1 && otherSlot !== 1) {

                var otherCoach =
                coach_positions[Number(otherDoor.coach)];

                var otherDoorRoute = otherCoach
                ? Number(otherCoach[1]) + Number(otherDoor.localZ)
                : Number(otherDoor.localZ);

                var otherCompareZ = Number(other[3]);

                if (other[0] === true) {
                    otherCompareZ -= Number(otherCoach && otherCoach[1] || 0);
                    otherDoorRoute = Number(otherDoor.localZ);
                }

                otherSlot =
                otherCompareZ < otherDoorRoute ? -1 : 1;
            }

            occupiedSlots.add(otherDoorIndex + ":" + otherSlot);
        }

        var candidates = [];

        for (
            var i = 0;
        i < door_positions.length;
        i += 2
        ) {

            var door = door_positions[i];

            if (!door) continue;

            var coachIndex = Number(door.coach);
            var coach = coach_positions[coachIndex];

            if (!coach) continue;

            var coachRoute = Number(coach[1]);
            var localZ = Number(door.localZ);

            if (
                !Number.isFinite(coachRoute) ||
                !Number.isFinite(localZ)
            ) {
                continue;
            }

            var distance = Math.abs(
                targetRoute - (coachRoute + localZ)
            );

            for (var slot of [-1, 1]) {

                var key = i + ":" + slot;

                if (occupiedSlots.has(key)) continue;

                candidates.push({
                    index: i,
                    slot: slot,
                    coachIndex: coachIndex,
                    preferredCoach: coachIndex === targetCoachIndex,
                    distance: distance
                });
            }
        }

        candidates.sort(function(a, b) {

            if (a.preferredCoach !== b.preferredCoach) {
                return a.preferredCoach ? -1 : 1;
            }

            return a.distance - b.distance;
        });

        return candidates.length > 0 ? candidates[0] : null;
    }

    // --------------------------------------------------------
    // DOOR STATE
    // --------------------------------------------------------

    function isDoorOpen(side) {

        var mode = side === -1
        ? Number(left_doors_mode)
        : Number(right_doors_mode);

        var progress = side === -1
        ? Number(left_doors)
        : Number(right_doors);

        return (
            (mode === 2 || mode < 0) &&
            progress >= 0.98
        );
    }

    // --------------------------------------------------------
    // FIND A PHYSICAL DOOR AT A ROUTE POSITION
    //
    // Can be called with requireOpen=false to detect a closed
    // doorway that the passenger is currently occupying.
    // --------------------------------------------------------

    function findDoorAt(routeZ, side, zone, requireOpen) {

        if (
            !zone ||
            !zone.sides.includes(side) ||
            routeZ < zone.minimum ||
            routeZ > zone.maximum
        ) {
            return null;
        }

        if (
            requireOpen &&
            !isDoorOpen(side)
        ) {
            return null;
        }

        for (
            var i = 0;
        i < door_positions.length;
        i += 2
        ) {

            var door = door_positions[i];

            if (!door) continue;

            var coach = coach_positions[Number(door.coach)];

            if (!coach) continue;

            var coachRoute = Number(coach[1]);
            var localZ = Number(door.localZ);
            var width = Number(door.width);

            if (
                !Number.isFinite(coachRoute) ||
                !Number.isFinite(localZ) ||
                !Number.isFinite(width) ||
                width <= 0
            ) {
                continue;
            }

            var doorRoute = coachRoute + localZ;

            if (
                doorRoute < zone.minimum ||
                doorRoute > zone.maximum
            ) {
                continue;
            }

            var halfOpening = Math.max(
                0.05,
                width * 0.5 - 0.08
            );

            if (
                Math.abs(routeZ - doorRoute) <= halfOpening
            ) {

                return {
                    index: i,
                    side: side,
                    coach: coach,
                    route: doorRoute,
                    width: width,
                    localZ: localZ
                };
            }
        }

        return null;
    }

    // --------------------------------------------------------
    // TRACK HEADING
    // --------------------------------------------------------

    var sample = sampleAt(currentRoute, false);

    if (!sample) return;

    var movementHeading = onTrain
    ? currentCoachYaw
    : Number(sample.heading);

    if (!Number.isFinite(movementHeading)) {
        movementHeading = currentCoachYaw;
    }

    // --------------------------------------------------------
    // TURNING
    // --------------------------------------------------------

    var turnSpeed = Math.PI / 2;

    if (cameraArrowKeys.left) {
        p[4] -= turnSpeed * dt;
    }

    if (cameraArrowKeys.right) {
        p[4] += turnSpeed * dt;
    }

    if (!Number.isFinite(Number(p[4]))) {
        p[4] = movementHeading;
    }

    p[4] = Math.atan2(
        Math.sin(p[4]),
                      Math.cos(p[4])
    );

    // --------------------------------------------------------
    // WALKING
    // --------------------------------------------------------

    var forward =
    (cameraArrowKeys.up ? 1 : 0) -
    (cameraArrowKeys.down ? 1 : 0);

    var movementDistance = forward * 1.2 * dt;

    var worldMoveX =
    Math.sin(p[4]) * movementDistance;

    var worldMoveZ =
    Math.cos(p[4]) * movementDistance;

    var deltaX =
    Math.cos(movementHeading) * worldMoveX -
    Math.sin(movementHeading) * worldMoveZ;

    var deltaZ =
    Math.sin(movementHeading) * worldMoveX +
    Math.cos(movementHeading) * worldMoveZ;

    var nextX = currentX + deltaX;
    var nextRoute = currentRoute + deltaZ;

    // --------------------------------------------------------
    // MOVEMENT SLIDER
    // --------------------------------------------------------

    function moveToward(value, target, amount) {

        var difference = target - value;

        if (Math.abs(difference) <= amount) {
            return target;
        }

        return value +
        Math.sign(difference) * amount;
    }

    // ========================================================
    // PLATFORM MOVEMENT AND BOARDING
    // ========================================================

    if (!onTrain) {

        var platformSide = Number(p._doorSide);

        if (
            platformSide !== -1 &&
            platformSide !== 1
        ) {
            return;
        }

        if (!currentZone.sides.includes(platformSide)) {
            p[5] = false;
            return;
        }

        // ----------------------------------------------------
        // ABSOLUTE PLATFORM Z LIMITS
        // ----------------------------------------------------

        nextRoute = Math.max(
            currentZone.minimum,
            Math.min(currentZone.maximum, nextRoute)
        );

        var currentPlatformDoor = findDoorAt(
            currentRoute,
            platformSide,
            currentZone,
            false
        );

        var candidatePlatformDoor = findDoorAt(
            nextRoute,
            platformSide,
            currentZone,
            true
        );

        // ----------------------------------------------------
        // PLATFORM DOORWAY CLOSING
        // ----------------------------------------------------

        var platformNearWall =
        platformSide * currentX < platformLimit  &&
        platformSide * currentX > interiorLimit;

        if (
            platformNearWall &&
            currentPlatformDoor &&
            !isDoorOpen(platformSide)
        ) {

            // Door has closed while the passenger is at it.
            // Push outside, keeping Z fixed until clear.
            nextRoute = currentRoute;

            nextX = moveToward(
                nextX,
                platformSide * platformLimit,
                2.5 * dt
            );
        }

        // ----------------------------------------------------
        // PLATFORM WALL COLLISION
        //
        // Clamp X, but preserve Z. This allows the passenger
        // to slide along the train instead of stopping.
        // ----------------------------------------------------

        else if (!candidatePlatformDoor) {

            var platformDistance =
            platformSide * nextX;

            platformDistance = Math.max(
                platformLimit,
                Math.min(
                    freeRoamDistance,
                    platformDistance
                )
            );

            nextX = platformSide * platformDistance;
        }

        // ----------------------------------------------------
        // PLATFORM -> TRAIN
        // ----------------------------------------------------

        candidatePlatformDoor = findDoorAt(
            nextRoute,
            platformSide,
            currentZone,
            true
        );

        if (
            candidatePlatformDoor &&
            platformSide * nextX < halfWidth
        ) {

            var boardingCoach =
            candidatePlatformDoor.coach;

            var boardingSample =
            sampleAt(nextRoute, false);

            if (boardingSample) {

                var trackOffset = Number(p._trackOffset);

                if (!Number.isFinite(trackOffset)) {
                    trackOffset = Number(boardingCoach[0]) || 0;
                }

                var platformPoint = worldPoint(
                    boardingSample,
                    trackOffset + nextX,
                    0
                );

                if (platformPoint) {

                    var boardingYaw =
                    Number(boardingCoach[7]);

                    if (!Number.isFinite(boardingYaw)) {
                        boardingYaw = 0;
                    }

                    var dx =
                    Number(platformPoint.x) -
                    Number(boardingCoach[4]);

                    var dz =
                    Number(platformPoint.z) -
                    Number(boardingCoach[5]);

                    var localX =
                    Math.cos(boardingYaw) * dx -
                    Math.sin(boardingYaw) * dz;

                    var localZ =
                    Math.sin(boardingYaw) * dx +
                    Math.cos(boardingYaw) * dz;

                    var boardingDoorIndex =
                    candidatePlatformDoor.index;

                    var boardingCoachIndex = Number(
                        door_positions[boardingDoorIndex].coach
                    );

                    var playerReference =
                    findPlayerReferenceSlot(
                        boardingCoachIndex,
                        nextRoute
                    );

                    if (playerReference) {

                        p[0] = true;

                        p[1] = playerReference.index;

                        p._doorSlot = playerReference.slot;

                        p._playerCoachIndex = boardingCoachIndex;

                        p[2] = localX;

                        p[3] = localZ;

                        p._doorSide = platformSide;

                        p._trackOffset = trackOffset;

                        p._freeroamX = freeRoamDistance;

                    } else {

                        // The train has no free passenger reference
                        // slots. Keep the player safely on the platform.
                        nextRoute = currentRoute;
                        nextX = platformSide * platformLimit;
                    }
                }
            }
        }

        // ----------------------------------------------------
        // REMAINING ON PLATFORM
        // ----------------------------------------------------

        if (p[0] !== true) {

            p[2] = nextX;
            p[3] = nextRoute;
        }
    }

    // ========================================================
    // TRAIN MOVEMENT, WALL COLLISION AND COACH TRANSITIONS
    // ========================================================

    else {

        // ----------------------------------------------------
        // DETERMINE WHICH WALL IS BEING APPROACHED
        // ----------------------------------------------------

        var wallSide = nextX < 0 ? -1 : 1;

        var currentWallSide = currentX < 0 ? -1 : 1;

        var currentZone = getPlatformZone(
            currentRoute,
            passengerStationIndex,
            false
        );

        var candidateZone = getPlatformZone(
            nextRoute,
            passengerStationIndex,
            false
        );

        var currentDoorAtWall = findDoorAt(
            currentRoute,
            currentWallSide,
            currentZone,
            false
        );

        var candidateDoorAtWall = findDoorAt(
            nextRoute,
            wallSide,
            candidateZone,
            true
        );

        // ----------------------------------------------------
        // CLOSED DOOR WHILE PASSENGER IS IN THE DOORWAY
        //
        // Only freeze Z when actually inside a valid doorway.
        // Otherwise the passenger slides along the solid wall.
        // ----------------------------------------------------

        var currentNearWall =
        Math.abs(currentX) > interiorLimit;

        if (
            currentNearWall &&
            currentDoorAtWall &&
            !isDoorOpen(currentWallSide)
        ) {

            nextRoute = currentRoute;

            var safeInsideX =
            currentWallSide * interiorLimit;

            nextX = moveToward(
                nextX,
                safeInsideX,
                2.5 * dt
            );
        }

        // ----------------------------------------------------
        // OPEN DOORWAY: KEEP Z INSIDE ITS OPENING
        // ----------------------------------------------------

        else if (
            currentNearWall &&
            currentDoorAtWall &&
            isDoorOpen(currentWallSide)
        ) {

            var currentDoorHalfWidth =
            Math.max(
                0.05,
                currentDoorAtWall.width * 0.5 - 0.08
            );

            // Prevent walking longitudinally out of the
            // doorway while near the train boundary.
            nextRoute = Math.max(
                currentDoorAtWall.route - currentDoorHalfWidth,
                Math.min(
                    currentDoorAtWall.route + currentDoorHalfWidth,
                    nextRoute
                )
            );
        }

        // ----------------------------------------------------
        // SOLID WALL COLLISION
        //
        // If no valid open door exists, constrain X to the
        // inside of the wall, but KEEP nextRoute changing.
        //
        // This creates the requested sliding movement.
        // ----------------------------------------------------

        if (
            !candidateDoorAtWall &&
            !(
                currentNearWall &&
                currentDoorAtWall &&
                !isDoorOpen(currentWallSide)
            )
        ) {

            var attemptedDistance = wallSide * nextX;

            if (attemptedDistance > interiorLimit) {

                nextX = wallSide * interiorLimit;
            }
        }

        // ----------------------------------------------------
        // COACH END LIMITS
        //
        // Coach 0 has its cab overhang at +Z.
        // The last coach has its cab overhang at -Z.
        // --------------------------------------------------------

        function getNearestCoachIndex(routeZ) {

            var nearestIndex = currentCoachIndex;
            var nearestDistance = Infinity;

            for (
                var i = 0;
            i < coach_positions.length;
            i++
            ) {

                var testCoach = coach_positions[i];

                if (!testCoach) continue;

                var centre = Number(testCoach[1]);

                if (!Number.isFinite(centre)) continue;

                var difference = Math.abs(routeZ - centre);

                if (difference < nearestDistance) {

                    nearestDistance = difference;

                    nearestIndex = i;
                }
            }

            return nearestIndex;
        }

        var nextCoachIndex =
        getNearestCoachIndex(nextRoute);

        // Identify which end of the current coach the player is approaching.
        var localZFromCurrentCoach =
        nextRoute - currentCoachRoute;

        // First coach: exclude the front cab end (+Z).
        // Last coach: exclude the rear cab end (-Z).
        var isCabEnd =
        (
            currentCoachIndex === 0 &&
            localZFromCurrentCoach > 0
        ) ||
        (
            currentCoachIndex === coach_positions.length - 1 &&
            localZFromCurrentCoach < 0
        );

        // Constrain lateral movement near the coach connection.
        var distanceFromCoachEnd =
        Math.abs(
            halfCoachLength -
            Math.abs(localZFromCurrentCoach)
        );

        var connectionDistance =
        Jacobs_bogies === true ? 1.9 : 0.7;

        var bogieHalfWidth =
        (
            Number(TRACK_GAUGE) +
            Number(RAIL_WIDTH)
        ) * 0.5;

        var connectionXLimit = bogieHalfWidth - 0.3;

        if (
            !isCabEnd &&
            distanceFromCoachEnd < connectionDistance &&
            connectionXLimit >= 0
        ) {
            nextX = Math.max(
                -connectionXLimit,
                Math.min(connectionXLimit, nextX)
            );
        }

        var nextCoach =
        coach_positions[nextCoachIndex];

        if (nextCoach) {

            var nextCoachRoute = Number(nextCoach[1]);

            var nextLocalZ =
            nextRoute - nextCoachRoute;

            // First coach: front cab end, local +Z.
            if (nextCoachIndex === 0) {

                if (nextLocalZ > cabEndLimit) {

                    nextLocalZ = cabEndLimit;

                    nextRoute =
                    nextCoachRoute + cabEndLimit;
                }
            }

            // Last coach: rear cab end, local -Z.
            if (
                nextCoachIndex ===
                coach_positions.length - 1
            ) {

                if (nextLocalZ < -cabEndLimit) {

                    nextLocalZ = -cabEndLimit;

                    nextRoute =
                    nextCoachRoute - cabEndLimit;
                }
            }
        }

        // ----------------------------------------------------
        // RECHECK EXIT DOOR AFTER COACH END LIMIT
        // ----------------------------------------------------

        candidateZone = getPlatformZone(
            nextRoute,
            passengerStationIndex,
            false
        );

        candidateDoorAtWall = findDoorAt(
            nextRoute,
            wallSide,
            candidateZone,
            true
        );

        // ----------------------------------------------------
        // ALIGHTING: TRAIN -> PLATFORM
        //
        // A real platform zone, correct side and open door
        // are all required. There is no stopaccuracy test.
        // --------------------------------------------------------

        if (
            candidateDoorAtWall &&
            wallSide * nextX > halfWidth
        ) {

            var exitCoach = currentCoach;

            var exitCoachRoute = Number(exitCoach[1]);
            var exitCoachYaw = Number(exitCoach[7]);

            if (
                Number.isFinite(exitCoachRoute) &&
                Number.isFinite(exitCoachYaw)
            ) {

                var localRoute =
                nextRoute - exitCoachRoute;

                var worldX =
                Number(exitCoach[4]) +
                Math.cos(exitCoachYaw) * nextX +
                Math.sin(exitCoachYaw) * localRoute;

                var worldZ =
                Number(exitCoach[5]) -
                Math.sin(exitCoachYaw) * nextX +
                Math.cos(exitCoachYaw) * localRoute;

                var exitSample =
                sampleAt(nextRoute, false);

                if (exitSample) {

                    var trackCentre = worldPoint(
                        exitSample,
                        0,
                        0
                    );

                    var trackOne = worldPoint(
                        exitSample,
                        1,
                        0
                    );

                    if (trackCentre && trackOne) {

                        var rightX =
                        Number(trackOne.x) -
                        Number(trackCentre.x);

                        var rightZ =
                        Number(trackOne.z) -
                        Number(trackCentre.z);

                        var rightLengthSquared =
                        rightX * rightX +
                        rightZ * rightZ;

                        if (rightLengthSquared > 0.000001) {

                            var dx =
                            worldX - Number(trackCentre.x);

                            var dz =
                            worldZ - Number(trackCentre.z);

                            var lateralPosition =
                            (
                                dx * rightX +
                                dz * rightZ
                            ) / rightLengthSquared;

                            var trackOffset = Number(exitCoach[0]);

                            if (!Number.isFinite(trackOffset)) {
                                trackOffset = 0;
                            }

                            p[0] = false;

                            p[1] = candidateDoorAtWall.index;

                            delete p._playerCoachIndex;

                            p[2] = lateralPosition - trackOffset;

                            p[3] = nextRoute;

                            p._doorSide = candidateDoorAtWall.side;

                            p._stationIndex = candidateZone.index;

                            p._platformStart = candidateZone.minimum;

                            p._platformEnd = candidateZone.maximum;

                            p._trackOffset = trackOffset;

                            p._freeroamX =
                            getFreeRoamX(candidateZone);
                        }
                    }
                }
            }
        }

        // ----------------------------------------------------
        // REMAINING ON TRAIN
        //
        // Select the coach whose centre is now closest.
        // Convert the passenger's position into that coach's
        // local coordinate system.
        // --------------------------------------------------------

        if (p[0] === true) {

            nextCoachIndex =
            getNearestCoachIndex(nextRoute);

            nextCoach = coach_positions[nextCoachIndex];

            if (!nextCoach) return;

            var nextCoachRoute = Number(nextCoach[1]);
            var nextCoachYaw = Number(nextCoach[7]);

            if (!Number.isFinite(nextCoachRoute)) return;
            if (!Number.isFinite(nextCoachYaw)) nextCoachYaw = 0;

            if (nextCoachIndex !== currentCoachIndex) {

                // Convert the candidate position from the
                // old coach coordinate system into world space.
                var oldLocalZ =
                nextRoute - currentCoachRoute;

                var worldX =
                Number(currentCoach[4]) +
                Math.cos(currentCoachYaw) * nextX +
                Math.sin(currentCoachYaw) * oldLocalZ;

                var worldZ =
                Number(currentCoach[5]) -
                Math.sin(currentCoachYaw) * nextX +
                Math.cos(currentCoachYaw) * oldLocalZ;

                // Convert world position into the new coach's
                // local coordinate system.
                var dx =
                worldX - Number(nextCoach[4]);

                var dz =
                worldZ - Number(nextCoach[5]);

                var newLocalX =
                Math.cos(nextCoachYaw) * dx -
                Math.sin(nextCoachYaw) * dz;

                var newLocalZ =
                Math.sin(nextCoachYaw) * dx +
                Math.cos(nextCoachYaw) * dz;

                // Select a free passenger reference slot. Prefer a
                // slot in the new coach, but use another coach's free
                // reference if this coach is full. The real coach is
                // always recorded separately, so the player remains
                // positioned in the coach he has actually entered.
                var playerReference =
                findPlayerReferenceSlot(nextCoachIndex, nextRoute);

                if (playerReference) {

                    p[1] = playerReference.index;

                    p._doorSlot = playerReference.slot;

                    p._playerCoachIndex = nextCoachIndex;

                    p[2] = newLocalX;

                    p[3] = newLocalZ;

                } else {

                    // No free reference slots remain anywhere on the
                    // train. Hold the player at the coach boundary.
                    var coachBoundary =
                    (currentCoachRoute + nextCoachRoute) * 0.5;

                    p[2] = nextX;

                    p[3] = coachBoundary - currentCoachRoute;
                }

            } else {

                // Stay in the current coach.
                p[2] = nextX;

                p[3] =
                nextRoute - currentCoachRoute;
            }
        }
    }

    // --------------------------------------------------------
    // WALKING STATE
    //
    // Compare actual accepted movement, not key state.
    // Sliding along a wall remains walking, but a blocked
    // passenger remains still.
    // --------------------------------------------------------

    var finalDoorIndex =
    Math.floor(Number(p[1]));

    var finalDoor =
    door_positions[finalDoorIndex];

    var finalCoachIndex =
    p[0] === true &&
    Number.isInteger(Number(p._playerCoachIndex))
    ? Number(p._playerCoachIndex)
    : (finalDoor ? Number(finalDoor.coach) : currentCoachIndex);

    var finalCoach =
    coach_positions[finalCoachIndex] || currentCoach;

    var finalRoute = p[0] === true && finalCoach
    ? Number(finalCoach[1]) + Number(p[3])
    : Number(p[3]);

    var actualX = Number(p[2]);

    p[5] = (
        Math.abs(actualX - currentX) > 0.0001 ||
        Math.abs(finalRoute - currentRoute) > 0.0001
    );
}










function update_passenger_heights() {

    if (!Array.isArray(passengers)) return;

    var frameRate = Number(fps);

    if (
        !Number.isFinite(frameRate) ||
        frameRate <= 0
    ) {
        return;
    }

    var dt = Math.min(0.05, 1 / frameRate);

    var platformHeight = Number(freeroamY);
    var trainHeight = Number(train_floor_height);

    if (!Number.isFinite(platformHeight)) {
        platformHeight = 0;
    }

    if (!Number.isFinite(trainHeight)) {
        trainHeight = 0;
    }

    var verticalSpeed = 2.5;

    var maximumChange = verticalSpeed * dt;

    for (var passenger of passengers) {

        if (!Array.isArray(passenger)) continue;

        var targetHeight = passenger[0] === true
        ? trainHeight
        : platformHeight;

        if (!Number.isFinite(Number(passenger._height))) {

            passenger._height = targetHeight;

            continue;
        }

        var currentHeight = Number(passenger._height);

        var difference = targetHeight - currentHeight;

        if (Math.abs(difference) < 0.001) {

            passenger._height = targetHeight;

        } else {

            passenger._height =
            currentHeight +
            Math.sign(difference) *
            Math.min(
                Math.abs(difference),
                     maximumChange
            );
        }
    }
}



function get_passenger_world_position(passenger) {

    if (!Array.isArray(passenger)) return null;

    var onTrain = passenger[0] === true;

    var doorIndex = Math.floor(Number(passenger[1]));

    if (
        !Number.isFinite(doorIndex) ||
        doorIndex < 0 ||
        doorIndex >= door_positions.length
    ) {
        return null;
    }

    // Passenger door indexes should always be even.
    doorIndex -= doorIndex % 2;

    var door = door_positions[doorIndex];

    if (!door) return null;

    var coachIndex = Number(door.coach);

    if (onTrain && passenger._isPlayerPassenger === true) {

        var playerCoachIndex = Number(passenger._playerCoachIndex);

        if (
            Number.isInteger(playerCoachIndex) &&
            playerCoachIndex >= 0 &&
            playerCoachIndex < coach_positions.length
        ) {
            coachIndex = playerCoachIndex;
        }
    }

    var coach = coach_positions[coachIndex];

    if (!coach) return null;

    var coachYaw = Number(coach[7]);

    if (!Number.isFinite(coachYaw)) {
        coachYaw = 0;
    }

    var routeDistance = onTrain
    ? Number(coach[1]) + Number(passenger[3])
    : Number(passenger[3]);

    if (!Number.isFinite(routeDistance)) return null;

    var sample = sampleAt(routeDistance, false);

    if (!sample) return null;

    var worldX;
    var worldZ;

    if (onTrain) {

        var localX = Number(passenger[2]);
        var localZ = Number(passenger[3]);

        if (!Number.isFinite(localX)) localX = 0;
        if (!Number.isFinite(localZ)) localZ = 0;

        worldX =
        Number(coach[4]) +
        Math.cos(coachYaw) * localX +
        Math.sin(coachYaw) * localZ;

        worldZ =
        Number(coach[5]) -
        Math.sin(coachYaw) * localX +
        Math.cos(coachYaw) * localZ;

    } else {

        var trackOffset = Number(passenger._trackOffset);

        if (!Number.isFinite(trackOffset)) {
            trackOffset = Number(coach[0]) || 0;
        }

        var point = worldPoint(
            sample,
            trackOffset + Number(passenger[2]),
                               0
        );

        if (!point) return null;

        worldX = Number(point.x);
        worldZ = Number(point.z);
    }

    var passengerHeight = Number(passenger._height);

    if (!Number.isFinite(passengerHeight)) {

        passengerHeight = onTrain
        ? Number(train_floor_height)
        : Number(freeroamY);
    }

    if (!Number.isFinite(passengerHeight)) {
        passengerHeight = 0;
    }

    var railOffset = Number(RAIL_VERTICAL_OFFSET);
    var railHeight = Number(RAIL_HEIGHT);

    if (!Number.isFinite(railOffset)) railOffset = 0;
    if (!Number.isFinite(railHeight)) railHeight = 0;

    return {
        x: worldX,
        y: Number(sample.y) + railOffset + railHeight + passengerHeight,
        z: worldZ,
        yaw: Number(passenger[4]) || 0,
        route: routeDistance,
        onTrain: onTrain
    };
}





function get_passenger_camera() {

    if (
        camera_view !== 8 ||
        !Array.isArray(passengers) ||
        !passengers[0] ||
        passengers[0]._isPlayerPassenger !== true
    ) {
        return null;
    }

    var passenger = passengers[0];

    var position =
    get_passenger_world_position(passenger);

    if (!position) return null;

    // --------------------------------------------------------
    // FOLLOW STATE
    // --------------------------------------------------------

    if (
        !passenger._cameraFollow ||
        typeof passenger._cameraFollow !== "object"
    ) {

        passenger._cameraFollow = {
            active: false,
            x: 0,
            y: 0,
            z: 0
        };
    }

    var follow = passenger._cameraFollow;

    // --------------------------------------------------------
    // INITIALISE TWO METRES IN FRONT
    //
    // The camera position is independent of subsequent
    // passenger turns.
    // --------------------------------------------------------

    if (!follow.active) {

        var heading = Number(position.yaw);

        if (!Number.isFinite(heading)) {
            heading = 0;
        }

        follow.x =
        position.x + Math.sin(heading) * 2;

        follow.y = position.y;

        follow.z =
        position.z + Math.cos(heading) * 2;

        follow.active = true;
    }

    // --------------------------------------------------------
    // FOLLOW DISTANCE
    // --------------------------------------------------------

    var dx = position.x - follow.x;
    var dz = position.z - follow.z;

    var distance = Math.hypot(dx, dz);

    var maximumDistance = 2;

    var frameRate = Number(fps);

    var dt =
    Number.isFinite(frameRate) && frameRate > 0
    ? Math.min(0.05, 1 / frameRate)
    : 1 / 60;

    // --------------------------------------------------------
    // NORMAL SMOOTH FOLLOW
    // --------------------------------------------------------

    var followSpeed = 5;

    if (distance > maximumDistance) {

        var excessDistance =
        distance - maximumDistance;

        var movement = Math.min(
            excessDistance,
            followSpeed * dt
        );

        var fraction = movement / distance;

        follow.x += dx * fraction;
        follow.z += dz * fraction;
    }

    // --------------------------------------------------------
    // HARD DISTANCE LIMIT
    //
    // This is the important fast-train correction.
    //
    // If the train moves so quickly that the smooth movement
    // cannot keep the camera within 2m, place the camera
    // exactly 2m from the passenger rather than letting it
    // lag behind.
    // --------------------------------------------------------

    dx = position.x - follow.x;
    dz = position.z - follow.z;

    distance = Math.hypot(dx, dz);

    if (distance > maximumDistance) {

        follow.x =
        position.x -
        (dx / distance) * maximumDistance;

        follow.z =
        position.z -
        (dz / distance) * maximumDistance;
    }

    // Follow changes in floor height without inheriting yaw.
    follow.y = position.y;

    // --------------------------------------------------------
    // CAMERA POSITION
    // --------------------------------------------------------

    var cam = {

        x: follow.x,

        y: follow.y + 2,

        z: follow.z
    };

    // --------------------------------------------------------
    // LOOK AT THE PASSENGER
    // --------------------------------------------------------

    var target = {

        x: position.x,

        y: position.y + 1.3,

        z: position.z
    };

    var lookX = target.x - cam.x;
    var lookY = target.y - cam.y;
    var lookZ = target.z - cam.z;

    var horizontal = Math.hypot(lookX, lookZ);

    var length = Math.hypot(horizontal, lookY);

    if (length < 0.000001) {
        return null;
    }

    // --------------------------------------------------------
    // FORWARD VECTOR
    // --------------------------------------------------------

    var fx = lookX / length;
    var fy = lookY / length;
    var fz = lookZ / length;

    // --------------------------------------------------------
    // LEVEL RIGHT VECTOR
    // --------------------------------------------------------

    var rx = horizontal > 0.000001
    ? lookZ / horizontal
    : 1;

    var rz = horizontal > 0.000001
    ? -lookX / horizontal
    : 0;

    // --------------------------------------------------------
    // UP VECTOR
    // --------------------------------------------------------

    var ux = fy * rz;
    var uy = fz * rx - fx * rz;
    var uz = -fy * rx;

    return {

        cam: cam,

        basis: {

            fx: fx,
            fy: fy,
            fz: fz,

            rx: rx,
            ry: 0,
            rz: rz,

            ux: ux,
            uy: uy,
            uz: uz
        }
    };
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


    // Save only the states this function actually needs to restore.
    // Blend factors are not changed, so they do not need saving.
    var oldBlend = gl.isEnabled(gl.BLEND);


    var oldCull = gl.isEnabled(gl.CULL_FACE);






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



    gl.uniform1i(objectLocations.uTexture, 0);

    gl.activeTexture(gl.TEXTURE0);



    // ------------------------------------------------------------
    // VISIBLE BOGIES
    // ------------------------------------------------------------

    var placements = [];

    for (var p of trainComponentPlacements) {

        if (
            p.distance >= startDistance &&
            p.distance <= endDistance &&
            (!boat_mode || p.isNpc === true)
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

        // Train meshes are opaque, except for binary PNG cutouts.
        // Disable blending; the shader discards transparent texels.
        gl.disable(gl.BLEND);
        gl.disable(gl.CULL_FACE);

        // Opaque train geometry must write to the depth buffer.
        gl.depthMask(true);

        // Only the opaque/binary-alpha shader path is used.
        gl.uniform1i(objectLocations.uAlphaPass, 0);


        // --------------------------------------------------------
        // BOGIES AND EXISTING JACOBS GANGWAYS
        // --------------------------------------------------------

        for (var placement of placements) {

            setModelTransform(
                placement.x,
                placement.y,
                placement.z,
                placement.yaw,
                placement.pitch,
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

        // --------------------------------------------------------
        // COACHES
        // --------------------------------------------------------

        for (var floorPlacement of floorPlacements) {

            // In boat mode, do not draw any player coaches.
            // NPC coaches continue through the normal drawing code.
            if (
                boat_mode &&
                floorPlacement.isNpc !== true
            ) {
                continue;
            }

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
                // COACH-END GANGWAYS
                // --------------------------------------------

                gl.disable(gl.CULL_FACE);

                for (var mesh of bodySet.endGangwayMeshes || []) {
                    drawMesh(mesh);
                }
            }

            // --------------------------------------------
            // COACH FLOOR
            // --------------------------------------------

            var floorSet = trainFloorMeshes[coachIndex];

            if (floorSet) {
                drawMesh(floorSet.top);
                drawMesh(floorSet.bottom);
            }
        }

        // --------------------------------------------------------
        // RIB BOAT
        // --------------------------------------------------------

        if (boat_mode && boatMeshes.length > 0) {

            var boatPlacement = null;

            // Find the first player coach.
            for (var p of floorPlacements) {

                if (
                    p.isNpc !== true &&
                    p.coachIndex === 0
                ) {
                    boatPlacement = p;
                    break;
                }
            }

            if (boatPlacement) {



                var boatFloorHeight =
                Number(train_floor_height);

                var boatRailHeight =
                Number(RAIL_HEIGHT);

                if (!Number.isFinite(boatFloorHeight)) {
                    boatFloorHeight = 0;
                }

                if (!Number.isFinite(boatRailHeight)) {
                    boatRailHeight = 0;
                }

                // Move the boat forwards.
                var boatForwardDistance = 4;

                var boatX =
                boatPlacement.x + cameraXOffset +
                Math.sin(boatPlacement.yaw) *
                boatForwardDistance;

                var boatZ =
                boatPlacement.z +
                Math.cos(boatPlacement.yaw) *
                boatForwardDistance;

                // Put the boat at ground level.
                var boatGroundY =
                boatPlacement.y -
                boatFloorHeight -
                boatRailHeight;

                // Draw the boat.
                setModelTransform(
                    boatX,
                    boatGroundY,
                    boatZ,
                    boatPlacement.yaw,
                    0,
                    0
                );

                gl.disable(gl.CULL_FACE);

                for (var mesh of boatMeshes) {
                    drawMesh(mesh);
                }


            }
        }

    } finally {

        // --------------------------------------------------------
        // RESTORE WEBGL STATE
        // --------------------------------------------------------

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        gl.cullFace(gl.BACK);
        gl.frontFace(gl.CCW);

        if (oldCull) {
            gl.enable(gl.CULL_FACE);
        } else {
            gl.disable(gl.CULL_FACE);
        }

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













function passengersfinished(){



    var passengersStillMoving = passengers.some(function(p) {

        if (!p) return false;

        return (
            p._phase === "board_approach" ||
            p._phase === "board_inside" ||
            p._phase === "alight_inside" ||
            p._phase === "alight_exit"
        );

    });

    if (passengersStillMoving) {
        setStatusss("Passengers are still alighting / boarding");
        return false;
    }

    return true;

}







































///////////// todo end




























