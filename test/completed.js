

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
            trackSwitches[hit.index][4] =
            !trackSwitches[hit.index][4];

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
                    null
                ]);

                trainAngles.push(null);

                continue;
            }

            trainBogies.push([
                distance,
                rail,
                Number(geometry.x),
                             Number(geometry.y)
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


