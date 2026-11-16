var corrected_speed = 0























var normalised_speed_limits = [];

function populateSpeedLimits() {

    normalised_speed_limits = [];

    // ------------------------------------------------------------
    // 1. PLAYABLE ROUTE BOUNDARIES
    // ------------------------------------------------------------

    if (
        !Array.isArray(current_route_items_routing) ||
        current_route_items_routing.length < 2
    ) {
        console.warn("populateSpeedLimits: Invalid routing boundaries.");
        return normalised_speed_limits;
    }

    var startDistance =
    Number(current_route_items_routing[0][0]);

    var endDistance =
    Number(
        current_route_items_routing[
            current_route_items_routing.length - 1
        ][0]
    );

    if (
        !Number.isFinite(startDistance) ||
        !Number.isFinite(endDistance) ||
        endDistance <= startDistance
    ) {
        console.warn("populateSpeedLimits: Invalid playable distance range.");
        return normalised_speed_limits;
    }


    // ------------------------------------------------------------
    // 2. ORIGINAL ROUTE SPEED LIMITS
    // ------------------------------------------------------------

    var speedLimits =
    typeof route !== "undefined" &&
    Array.isArray(route.speedLimits)
    ? route.speedLimits
    : [];

    var sortedSpeedLimits = speedLimits
    .map((item, index) => ({
        distance: Number(item.distance),
                           speed: Number(item.speed),
                           order: index
    }))
    .filter(item =>
    Number.isFinite(item.distance) &&
    Number.isFinite(item.speed)
    )
    .sort((a, b) =>
    (a.distance - b.distance) ||
    (a.order - b.order)
    );


    // ------------------------------------------------------------
    // 3. POINTS SPEED LIMIT ZONES
    // ------------------------------------------------------------

    var pointsZones = [];

    var movingLength =
    typeof pointsMovingLength !== "undefined"
    ? Math.max(0, Number(pointsMovingLength) || 0)
    : 0;

    var pointsLength = movingLength * 3;

    var pointsLimit =
    typeof points_speed_limit !== "undefined"
    ? Number(points_speed_limit)
    : NaN;

    if (
        Number.isFinite(pointsLimit) &&
        Array.isArray(current_route_items_detailed)
    ) {

        for (var item of current_route_items_detailed) {

            if (
                !Array.isArray(item) ||
                item.length < 4
            ) {
                continue;
            }

            var type = item[0];

            if (
                type !== "facingpoints" &&
                type !== "nonfacingpoints"
            ) {
                continue;
            }


            // ----------------------------------------------------
            // POINTS QUALIFICATION
            //
            // Include points if:
            //
            // item[2] is greater than 1
            // OR
            // item[3] is true
            //
            // Therefore points on track 0 or track 1 with
            // direction false are excluded.
            // ----------------------------------------------------

            var pointsTrack = item[2];
            var pointsDirection = item[3];

            if (
                (pointsTrack === 0 || pointsTrack === 1) &&
                pointsDirection === false
            ) {
                continue;
            }

            if (
                !(pointsTrack > 1 || pointsDirection === true)
            ) {
                continue;
            }


            // ----------------------------------------------------
            // POINTS SPEED LIMIT ZONE
            // ----------------------------------------------------

            var pointDistance = Number(item[1]);

            if (!Number.isFinite(pointDistance)) {
                continue;
            }

            var zoneStart;
            var zoneEnd;

            if (type === "facingpoints") {

                // Facing points:
                // Start 3m before the points.
                // Finish pointsLength beyond the points.

                zoneStart = pointDistance - 3;
                zoneEnd = pointDistance + pointsLength;

            } else {

                // Non-facing points:
                // Start pointsLength before the points.
                // Finish 3m beyond the points.

                zoneStart = pointDistance - pointsLength;
                zoneEnd = pointDistance + 3;
            }


            // Restrict the zone to playable distances.
            zoneStart = Math.max(startDistance, zoneStart);
            zoneEnd = Math.min(endDistance, zoneEnd);

            if (zoneEnd <= zoneStart) {
                continue;
            }

            pointsZones.push({
                start: zoneStart,
                end: zoneEnd
            });
        }
    }


    // ------------------------------------------------------------
    // 4. BUILD THE EVENT TIMELINE
    // ------------------------------------------------------------

    var timeline = [];

    // Playable boundaries.
    timeline.push({
        distance: startDistance,
        type: "boundary"
    });

    timeline.push({
        distance: endDistance,
        type: "boundary"
    });


    // Normal route speed changes within the playable range.
    for (var limit of sortedSpeedLimits) {

        if (
            limit.distance < startDistance ||
            limit.distance > endDistance
        ) {
            continue;
        }

        timeline.push({
            distance: limit.distance,
            type: "speed",
            speed: limit.speed,
            order: limit.order
        });
    }


    // Points restriction starts and finishes.
    for (var zone of pointsZones) {

        timeline.push({
            distance: zone.start,
            type: "pointsStart"
        });

        timeline.push({
            distance: zone.end,
            type: "pointsEnd"
        });
    }


    // Process events in forward route order.
    timeline.sort((a, b) =>
    (a.distance - b.distance) ||
    ((a.order ?? -1) - (b.order ?? -1))
    );


    // ------------------------------------------------------------
    // 5. FIND THE ROUTE SPEED AT THE PLAYABLE START
    // ------------------------------------------------------------

    var currentRouteSpeed = 0;

    // Include the effect of route speed limits before the
    // playable start, without adding those limits to the output.

    for (var limit of sortedSpeedLimits) {

        if (limit.distance > startDistance) {
            break;
        }

        currentRouteSpeed = limit.speed;
    }


    // ------------------------------------------------------------
    // 6. OUTPUT HELPER
    // ------------------------------------------------------------

    function addNormalisedSpeedLimit(distance, speed) {

        var lastIndex = normalised_speed_limits.length - 1;

        // Replace an existing entry at the same distance.
        if (
            lastIndex >= 0 &&
            Math.abs(
                normalised_speed_limits[lastIndex][0] - distance
            ) < 1e-7
        ) {

            normalised_speed_limits[lastIndex][1] = speed;
            return;
        }

        normalised_speed_limits.push([
            distance,
            speed
        ]);
    }


    // ------------------------------------------------------------
    // 7. PROCESS THE EVENT TIMELINE
    // ------------------------------------------------------------

    var activePointsZones = 0;

    var i = 0;

    while (i < timeline.length) {

        var distance = timeline[i].distance;

        var speedChanges = [];

        var zoneStarts = 0;
        var zoneEnds = 0;

        var isBoundary = false;


        // --------------------------------------------------------
        // COLLECT ALL EVENTS AT THIS DISTANCE
        // --------------------------------------------------------

        while (
            i < timeline.length &&
            Math.abs(timeline[i].distance - distance) < 1e-7
        ) {

            var event = timeline[i];

            if (event.type === "speed") {

                speedChanges.push(event);

            } else if (event.type === "pointsStart") {

                zoneStarts++;

            } else if (event.type === "pointsEnd") {

                zoneEnds++;

            } else if (event.type === "boundary") {

                isBoundary = true;
            }

            i++;
        }


        var wasPointsRestricted =
        activePointsZones > 0;


        // --------------------------------------------------------
        // UPDATE THE UNDERLYING ROUTE SPEED
        //
        // This happens even inside a points restriction.
        //
        // Route speed changes inside a points zone are remembered
        // so the latest route speed can be restored when the
        // points restriction finishes.
        // --------------------------------------------------------

        for (var change of speedChanges) {

            currentRouteSpeed = change.speed;
        }


        // --------------------------------------------------------
        // UPDATE ACTIVE POINTS ZONES
        // --------------------------------------------------------

        activePointsZones += zoneStarts;
        activePointsZones -= zoneEnds;

        activePointsZones = Math.max(
            0,
            activePointsZones
        );

        var isPointsRestricted =
        activePointsZones > 0;


        // --------------------------------------------------------
        // PLAYABLE ROUTE BOUNDARIES
        //
        // Both boundaries always have a speed limit of zero.
        // --------------------------------------------------------

        if (isBoundary) {

            addNormalisedSpeedLimit(distance, 0);
            continue;
        }


        // --------------------------------------------------------
        // ENTER POINTS RESTRICTION
        //
        // Apply points_speed_limit at the beginning of the zone.
        // --------------------------------------------------------

        if (
            !wasPointsRestricted &&
            isPointsRestricted
        ) {

            addNormalisedSpeedLimit(
                distance,
                pointsLimit
            );

            continue;
        }


        // --------------------------------------------------------
        // LEAVE POINTS RESTRICTION
        //
        // Restore the latest underlying route speed.
        // This includes any route speed changes which occurred
        // while the train was within the points restriction zone.
        // --------------------------------------------------------

        if (
            wasPointsRestricted &&
            !isPointsRestricted
        ) {

            addNormalisedSpeedLimit(
                distance,
                currentRouteSpeed
            );

            continue;
        }


        // --------------------------------------------------------
        // STILL INSIDE A POINTS RESTRICTION
        //
        // Do not add normal route speed changes to the output.
        // They have already been remembered in currentRouteSpeed.
        // --------------------------------------------------------

        if (isPointsRestricted) {
            continue;
        }


        // --------------------------------------------------------
        // NORMAL ROUTE SPEED CHANGE
        // --------------------------------------------------------

        if (speedChanges.length > 0) {

            addNormalisedSpeedLimit(
                distance,
                currentRouteSpeed
            );
        }
    }


    return normalised_speed_limits;
}








































































































































/*


1. (3) [Array(2), Array(2), Array(2)]
1. 0: (2) [0, 0]
2. 1: (2) [5175, 1]
3. 2: (2) [5325, 1]


look at the item 0 in the first and last subarray.  this is the closest and furthest positions playable.  In the new array only items between the first and last position are to be included.  Any speed limits outside of these distances are to be dropped.  Also at the first and last positions include the speedlimit of 0 to indicate the boundary of allowed travel

The next thing is to include points as speed limits

look at this

current_route_items_detailed
1. (26) [Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6), Array(6)]
1. 0: (6) ['buffer', 0, 0, false, 0, false]
2. 1: (6) ['facingpoints', 5175, 0, false, 7, false]
3. 2: (6) ['nonfacingpoints', 5325, 0, false, 8, false]
4. 3: (6) ['facingpoints', 7425, 0, false, 11, false]
5. 4: (6) ['nonfacingpoints', 8100, 0, false, 15, true]
6. 5: (6) ['nonfacingpoints', 8225, 0, false, 18, false]
7. 6: (6) ['facingpoints', 8250, 0, false, 19, true]
8. 7: (6) ['facingpoints', 11800, 0, false, 32, false]
9. 8: (6) ['nonfacingpoints', 11900, 0, false, 34, true]
10. 9: (6) ['facingpoints', 11925, 0, false, 35, false]
11. 10: (6) ['nonfacingpoints', 12050, 0, false, 41, true]
12. 11: (6) ['facingpoints', 14500, 0, false, 49, false]
13. 12: (6) ['facingpoints', 15700, 0, false, 61, false]
14. 13: (6) ['nonfacingpoints', 15975, 0, false, 64, false]
15. 14: (6) ['nonfacingpoints', 17000, 0, false, 73, false]
16. 15: (6) ['nonfacingpoints', 17100, 0, false, 76, false]
17. 16: (6) ['nonfacingpoints', 22900, 0, false, 89, false]
18. 17: (6) ['nonfacingpoints', 24525, 0, false, 96, false]
19. 18: (6) ['facingpoints', 24575, 0, false, 97, true]
20. 19: (6) ['facingpoints', 24700, 0, false, 109, true]
21. 20: (6) ['facingpoints', 24700, 0, false, 110, false]
22. 21: (6) ['facingpoints', 24750, 0, false, 113, true]
23. 22: (6) ['nonfacingpoints', 25100, 0, false, 119, true]
24. 23: (6) ['nonfacingpoints', 25150, 0, false, 120, true]
25. 24: (6) ['facingpoints', 25300, 0, false, 130, false]
26. 25: (6) ['buffer', 27800, 0, false, 138, false]

only look for facingpoints and nonfacingpoints.  everything else does not matter.  then only look for the ones which item 2 is true.  So in this example none of the points here qualify

meanwhile in this example

current_route_items_detailed
1. (3) [Array(6), Array(6), Array(6)]
1. 0: (6) ['buffer', 0, 0, false, 0, false]
2. 1: (6) ['facingpoints', 5175, 1, true, 7, false]
3. 2: (6) ['conflictingpoints', 5325, 1, false, 8, false]
4. length: 3
5. [[Prototype]]: Array(0)

the facingpoints at 5175 are to be included as they are true

The next thing is to apply the speed limit

with facing points the speed limit is to apply from 3 before the points and to pointsMovingLength * 3 beyond the points.  (pointsMovingLength * 3 gives how long the points are).  so its a zone of speedlimit for the points.  The speed limit is points_speed_limit

For non faceing points its the other way around.  The speed limit starts pointsMovingLength * 3 before the points and lasts until 3 after the points.

So this means setting the points_speed_limit at the start position and returning to the original speed limit at the points finish position.

The next part is very important.  The route speed limit could change during the points speed limit zone.  If the speed limit changes it must not get written to the array inside the points speed limit zone, instead it becomes the speed limit to be returned to after the zone.

write the function

*/
























































function little_canvas() {

    var ctx = ctx_controls_canvas;
    var items = current_route_items_detailed;

    var w = controls_canvas.width;
    var h = controls_canvas.height;

    var forward = reverser === 1;
    var reverse = reverser === -1;
    var neutral = reverser === 0;

    var displayDirection =
    (forward ? 1 : reverse ? -1 : 0) *
    (flip_out ? -1 : 1);

    var displayForward = displayDirection > 0;
    var displayReverse = displayDirection < 0;

    var p = pos;
    var trainLength = train_length;

    var routePosition = displayReverse
    ? p - trainLength
    : p;

    var panelTotalW = 275;
    var panelX = Math.max(0, w - panelTotalW);

    var diagramX = panelX;
    var diagramW = 150;

    var stationX = panelX + diagramW;
    var stationW = panelTotalW - diagramW;

    var speedAreaW = panelX;
    var speedBoxH = h * 0.5;

    var minD = Infinity;
    var maxD = -Infinity;

    var diagramCrashed = false;
    var isCrashed = false;

    var upcoming = [];

    var metricSpeed;
    var speedUnit;


    // ============================================================
    // 1. DRAWING HELPERS
    // ============================================================

    var drawKeyCap;
    var drawDoorArrow;
    var drawSmallThrottleArrow;
    var convertDisplayedSpeed;
    var formatSpeedDistance;

    try {

        drawKeyCap = function (
            x, y, letter, width, height, fontSize
        ) {

            ctx.fillStyle = '#536478';

            ctx.fillRect(
                x - width / 2,
                y - height / 2 + 3,
                width,
                height
            );

            ctx.fillStyle = '#e9eef5';

            ctx.fillRect(
                x - width / 2,
                y - height / 2,
                width,
                height - 3
            );

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;

            ctx.strokeRect(
                x - width / 2,
                y - height / 2,
                width,
                height - 3
            );

            ctx.fillStyle = '#172333';
            ctx.font = '800 ' + fontSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillText(letter, x, y - 1, width - 2);
        };


        drawDoorArrow = function (
            x, y, pointRight, highlighted, size
        ) {

            var shaft = size * 0.38;
            var head = size * 0.68;

            ctx.beginPath();

            if (pointRight) {

                ctx.moveTo(x - size, y - shaft);
                ctx.lineTo(x + size * 0.12, y - shaft);
                ctx.lineTo(x + size * 0.12, y - head);
                ctx.lineTo(x + size, y);
                ctx.lineTo(x + size * 0.12, y + head);
                ctx.lineTo(x + size * 0.12, y + shaft);
                ctx.lineTo(x - size, y + shaft);

            } else {

                ctx.moveTo(x + size, y - shaft);
                ctx.lineTo(x - size * 0.12, y - shaft);
                ctx.lineTo(x - size * 0.12, y - head);
                ctx.lineTo(x - size, y);
                ctx.lineTo(x - size * 0.12, y + head);
                ctx.lineTo(x - size * 0.12, y + shaft);
                ctx.lineTo(x + size, y + shaft);
            }

            ctx.closePath();

            ctx.fillStyle = highlighted ? '#ffff00' : '#050505';
            ctx.fill();
        };


        drawSmallThrottleArrow = function (
            x, y, upward, size
        ) {

            ctx.beginPath();

            if (upward) {

                ctx.moveTo(x, y - size);
                ctx.lineTo(x - size * 0.65, y + size * 0.25);
                ctx.lineTo(x - size * 0.22, y + size * 0.25);
                ctx.lineTo(x - size * 0.22, y + size);
                ctx.lineTo(x + size * 0.22, y + size);
                ctx.lineTo(x + size * 0.22, y + size * 0.25);
                ctx.lineTo(x + size * 0.65, y + size * 0.25);

            } else {

                ctx.moveTo(x, y + size);
                ctx.lineTo(x - size * 0.65, y - size * 0.25);
                ctx.lineTo(x - size * 0.22, y - size * 0.25);
                ctx.lineTo(x - size * 0.22, y - size);
                ctx.lineTo(x + size * 0.22, y - size);
                ctx.lineTo(x + size * 0.22, y - size * 0.25);
                ctx.lineTo(x + size * 0.65, y - size * 0.25);
            }

            ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        };


        convertDisplayedSpeed = function (speed) {

            return String(Math.round(
                metricSpeed ? speed : speed * 0.6213711922
            ));
        };


        formatSpeedDistance = function (distance) {

            distance = Math.abs(distance);

            return distance <= 10
            ? distance.toFixed(1) + 'm'
            : Math.round(distance) + 'm';
        };

    } catch {}


    // ============================================================
    // 2. CLEAR CANVAS
    // ============================================================

    try {
        ctx.clearRect(0, 0, w, h);
    } catch {}


    // ============================================================
    // 3. ROUTE EXTREMES AND CRASH DETECTION
    // ============================================================

    try {

        for (var i = 0; i < items.length; i++) {

            var d = items[i][1];

            if (d < minD) minD = d;
            if (d > maxD) maxD = d;
        }

        if (displayForward && p > maxD) {

            crashed = true;
            crashedtext = 'Crashed into buffer';
            diagramCrashed = true;

        } else if (
            displayReverse &&
            p - trainLength < minD
        ) {

            crashed = true;
            crashedtext = 'Crashed into buffer';
            diagramCrashed = true;
        }

        isCrashed = crashed || diagramCrashed;

    } catch {}


    // ============================================================
    // 4. SPEED PANEL BACKGROUND
    // ============================================================

    try {

        ctx.fillStyle = '#303338';
        ctx.fillRect(0, 0, speedAreaW, speedBoxH);

        ctx.beginPath();
        ctx.moveTo(0, speedBoxH + 0.5);
        ctx.lineTo(speedAreaW, speedBoxH + 0.5);

        ctx.strokeStyle = '#62666b';
        ctx.lineWidth = 1;
        ctx.stroke();

    } catch {}


    // ============================================================
    // 5. SPEED PANEL CRASH DISPLAY
    // ============================================================

    if (isCrashed && speedAreaW > 0) {

        try {

            var crashFontSize = Math.min(
                76,
                speedBoxH * 0.48,
                speedAreaW * 0.12
            );

            var crashLines = [];

            while (crashFontSize > 8) {

                ctx.font = '900 ' + crashFontSize + 'px sans-serif';

                crashLines = [];

                var words = crashedtext.split(/\s+/);
                var line = '';

                for (var word of words) {

                    var test = line ? line + ' ' + word : word;

                    if (
                        line &&
                        ctx.measureText(test).width > speedAreaW - 24
                    ) {
                        crashLines.push(line);
                        line = word;
                    } else {
                        line = test;
                    }
                }

                if (line) crashLines.push(line);

                if (
                    crashLines.length * crashFontSize * 1.12 <
                    speedBoxH - 12
                ) {
                    break;
                }

                crashFontSize--;
            }

            ctx.font = '900 ' + crashFontSize + 'px sans-serif';
            ctx.fillStyle = '#ff922e';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            var crashLineHeight = crashFontSize * 1.12;

            for (var ci = 0; ci < crashLines.length; ci++) {

                ctx.fillText(
                    crashLines[ci],
                    speedAreaW / 2,
                    speedBoxH / 2 +
                    (ci - (crashLines.length - 1) / 2) *
                    crashLineHeight,
                    speedAreaW - 20
                );
            }

        } catch {}
    }


    // ============================================================
    // 6. SPEED PANEL NEUTRAL REVERSER
    // ============================================================

    else if (neutral && speedAreaW > 0) {

        try {

            var neutralKeySize = Math.min(
                34,
                speedBoxH * 0.27,
                speedAreaW * 0.045
            );

            var neutralY = speedBoxH / 2;

            drawKeyCap(
                speedAreaW * 0.30 - 38,
                neutralY,
                'W',
                neutralKeySize,
                neutralKeySize,
                16
            );

            drawKeyCap(
                speedAreaW * 0.70 - 38,
                neutralY,
                'S',
                neutralKeySize,
                neutralKeySize,
                16
            );

            ctx.fillStyle = '#ffffff';
            ctx.font = '700 13px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            ctx.fillText(
                'Reverser forward',
                speedAreaW * 0.30 - 15,
                neutralY,
                speedAreaW * 0.25
            );

            ctx.fillText(
                'Reverser reverse',
                speedAreaW * 0.70 - 15,
                neutralY,
                speedAreaW * 0.25
            );

        } catch {}
    }


    // ============================================================
    // 7. NORMAL SPEED PANEL
    // ============================================================

    else if (!neutral && speedAreaW > 0) {

        try {

            metricSpeed = use_metric !== false;
            speedUnit = metricSpeed ? 'kmh' : 'mph';


            // ----------------------------------------------------
            // NINE DISPLAY POSITIONS
            //
            // LEFT | BLANK | BLANK | THROTTLE | SPEED |
            // CURRENT | NEXT | AFTER | RIGHT
            // ----------------------------------------------------

            var slotWidth = speedAreaW / 9;

            var slot0 = slotWidth * 0.5;
            var slot3 = slotWidth * 3.5;
            var slot4 = slotWidth * 4.5;
            var slot5 = slotWidth * 5.5;
            var slot6 = slotWidth * 6.5;
            var slot7 = slotWidth * 7.5;
            var slot8 = slotWidth * 8.5;


            // ----------------------------------------------------
            // DOOR ARROWS AND Q/E
            // ----------------------------------------------------

            var doorArrowSize = Math.min(
                44,
                slotWidth * 0.40,
                speedBoxH * 0.31
            );

            drawDoorArrow(
                slot0,
                speedBoxH * 0.39,
                false,
                left_doors !== 0,
                doorArrowSize
            );

            drawDoorArrow(
                slot8,
                speedBoxH * 0.39,
                true,
                right_doors !== 0,
                doorArrowSize
            );

            var doorKeySize = Math.min(
                30,
                slotWidth * 0.34,
                speedBoxH * 0.24
            );

            drawKeyCap(
                slot0,
                speedBoxH * 0.86,
                'Q',
                doorKeySize,
                doorKeySize,
                14
            );

            drawKeyCap(
                slot8,
                speedBoxH * 0.86,
                'E',
                doorKeySize,
                doorKeySize,
                14
            );


            // ----------------------------------------------------
            // THROTTLE: SLOT 4
            // A ABOVE D
            // ----------------------------------------------------

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            var throttleX = slot3;

            ctx.font = '700 ' + Math.max(8, slotWidth * 0.105) +
            'px sans-serif';

            ctx.fillText(
                'THROTTLE',
                throttleX - slotWidth * 0.14,
                speedBoxH * 0.28,
                slotWidth * 0.48
            );

            ctx.font = '900 ' + Math.max(12, slotWidth * 0.20) +
            'px sans-serif';

            ctx.fillText(
                Math.round(current_throttle) + '%',
                         throttleX - slotWidth * 0.14,
                         speedBoxH * 0.49,
                         slotWidth * 0.48
            );

            var throttleKeyX = throttleX + slotWidth * 0.29;

            var throttleKeyW = Math.min(23, slotWidth * 0.25);
            var throttleKeyH = Math.min(22, speedBoxH * 0.22);

            var throttleArrowSize = Math.min(6, slotWidth * 0.07);

            var throttleArrowX =
            throttleKeyX + throttleKeyW / 2 + 7;

            drawKeyCap(
                throttleKeyX,
                speedBoxH * 0.34,
                'A',
                throttleKeyW,
                throttleKeyH,
                12
            );

            drawSmallThrottleArrow(
                throttleArrowX,
                speedBoxH * 0.34,
                true,
                throttleArrowSize
            );

            drawKeyCap(
                throttleKeyX,
                speedBoxH * 0.68,
                'D',
                throttleKeyW,
                throttleKeyH,
                12
            );

            drawSmallThrottleArrow(
                throttleArrowX,
                speedBoxH * 0.68,
                false,
                throttleArrowSize
            );


            // ----------------------------------------------------
            // TRAIN SPEED: SLOT 5
            // ----------------------------------------------------

            var displaySpeed =
            convertDisplayedSpeed(Math.abs(corrected_speed));

            var speedNumberFont = Math.min(
                78,
                speedBoxH * 0.68,
                slotWidth * 0.88
            );

            var speedUnitFont = Math.max(
                6,
                speedNumberFont * 0.25
            );

            ctx.font =
            '900 ' + speedNumberFont + 'px sans-serif';

            var speedNumberWidth =
            ctx.measureText(displaySpeed).width;

            ctx.font =
            '600 ' + speedUnitFont + 'px sans-serif';

            var speedUnitWidth =
            ctx.measureText(speedUnit).width;

            var speedTextStart =
            slot4 -
            (speedNumberWidth + speedUnitWidth + 5) / 2;

            ctx.fillStyle = '#39e66c';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            ctx.font =
            '900 ' + speedNumberFont + 'px sans-serif';

            ctx.fillText(
                displaySpeed,
                speedTextStart,
                speedBoxH * 0.48
            );

            ctx.font =
            '600 ' + speedUnitFont + 'px sans-serif';

            ctx.fillText(
                speedUnit,
                speedTextStart + speedNumberWidth + 5,
                speedBoxH * 0.48 + speedNumberFont * 0.22
            );


            // ----------------------------------------------------
            // SPEED LIMIT LOOKUP
            //
            // The array is already sorted in forward route order.
            // Do not copy or sort it.
            //
            // The train occupies:
            // pos - train_length  to  pos
            //
            // CURRENT is the slowest limit under the train.
            //
            // NEXT and AFTER are measured from:
            // Forward: p
            // Reverse: p - train_length
            // ----------------------------------------------------

            var limits = normalised_speed_limits;

            var playableStart = current_route_items_routing[0][0];

            var startBoundaryIndex = -1;

            for (var si = 0; si < limits.length; si++) {

                if (
                    Math.abs(limits[si][0] - playableStart) < 1e-7 &&
                    limits[si][1] === 0
                ) {
                    startBoundaryIndex = si;
                    break;
                }
            }

            var firstActualSpeedIndex =
            startBoundaryIndex >= 0
            ? startBoundaryIndex + 1
            : 0;

            var baseSpeed = limits[firstActualSpeedIndex];

            var trainStart = p - trainLength;
            var trainEnd = p;

            var speedPosition = displayReverse
            ? trainStart
            : trainEnd;


            // ----------------------------------------------------
            // FIND SPEED AT THE REAR OF THE TRAIN
            // ----------------------------------------------------

            var activeSpeedLimit = baseSpeed;

            var firstUnderTrainChange =
            firstActualSpeedIndex + 1;

            while (
                firstUnderTrainChange < limits.length &&
                limits[firstUnderTrainChange][0] <= trainStart + 1e-7
            ) {

                activeSpeedLimit =
                limits[firstUnderTrainChange];

                firstUnderTrainChange++;
            }


            // ----------------------------------------------------
            // COLLECT ALL SPEED LIMITS UNDER THE TRAIN
            // ----------------------------------------------------

            var speedLimitsUnderTrain = [
                activeSpeedLimit
            ];

            for (
                si = firstUnderTrainChange;
            si < limits.length &&
            limits[si][0] < trainEnd - 1e-7;
            si++
            ) {

                speedLimitsUnderTrain.push(limits[si]);
            }


            // ----------------------------------------------------
            // CURRENT = SLOWEST SPEED LIMIT UNDER THE TRAIN
            // ----------------------------------------------------

            var currentSpeedLimit = speedLimitsUnderTrain[0];

            for (si = 1; si < speedLimitsUnderTrain.length; si++) {

                if (
                    speedLimitsUnderTrain[si][1] <
                    currentSpeedLimit[1]
                ) {
                    currentSpeedLimit = speedLimitsUnderTrain[si];
                }
            }


            // ----------------------------------------------------
            // FIND A SPEED INCREASE IN THE DIRECTION OF TRAVEL
            //
            // Forward: inspect limits from low to high distance.
            // Reverse: inspect limits from high to low distance.
            //
            // Only show the smaller circle when the slowest limit
            // under the train is followed by a higher limit.
            // ----------------------------------------------------

            var higherSpeedLimit = null;

            if (displayForward) {

                for (
                    si = 0;
                si < speedLimitsUnderTrain.length - 1;
                si++
                ) {

                    if (
                        speedLimitsUnderTrain[si][1] ===
                        currentSpeedLimit[1] &&
                        speedLimitsUnderTrain[si + 1][1] >
                        currentSpeedLimit[1]
                    ) {

                        higherSpeedLimit =
                        speedLimitsUnderTrain[si + 1];

                        break;
                    }
                }

            } else {

                for (
                    si = speedLimitsUnderTrain.length - 1;
                si > 0;
                si--
                ) {

                    if (
                        speedLimitsUnderTrain[si][1] ===
                        currentSpeedLimit[1] &&
                        speedLimitsUnderTrain[si - 1][1] >
                        currentSpeedLimit[1]
                    ) {

                        higherSpeedLimit =
                        speedLimitsUnderTrain[si - 1];

                        break;
                    }
                }
            }


            // ----------------------------------------------------
            // FIND NEXT AND AFTER SPEED LIMITS
            // ----------------------------------------------------

            var nextSpeedLimit = null;
            var afterSpeedLimit = null;


            // FORWARD.
            if (displayForward) {

                var nextForwardIndex = -1;

                for (
                    si = firstActualSpeedIndex + 1;
                si < limits.length;
                si++
                ) {

                    if (
                        limits[si][0] > speedPosition + 1e-7
                    ) {
                        nextForwardIndex = si;
                        break;
                    }
                }

                if (nextForwardIndex >= 0) {

                    nextSpeedLimit = limits[nextForwardIndex];

                    afterSpeedLimit =
                    limits[nextForwardIndex + 1] || null;
                }
            }


            // REVERSE.
            else {

                var previousChangeIndex = -1;

                for (
                    si = limits.length - 1;
                si > firstActualSpeedIndex;
                si--
                ) {

                    if (
                        limits[si][0] < speedPosition - 1e-7
                    ) {
                        previousChangeIndex = si;
                        break;
                    }
                }

                if (previousChangeIndex >= 0) {

                    nextSpeedLimit = [
                        limits[previousChangeIndex][0],
                        limits[previousChangeIndex - 1][1]
                    ];

                    if (
                        previousChangeIndex - 1 >
                        firstActualSpeedIndex
                    ) {

                        afterSpeedLimit = [
                            limits[previousChangeIndex - 1][0],
                            limits[previousChangeIndex - 2][1]
                        ];

                    } else if (startBoundaryIndex >= 0) {

                        afterSpeedLimit =
                        limits[startBoundaryIndex];
                    }

                } else if (startBoundaryIndex >= 0) {

                    nextSpeedLimit =
                    limits[startBoundaryIndex];
                }
            }


            // ----------------------------------------------------
            // SPEED SIGN GEOMETRY
            // ----------------------------------------------------

            var smallRadius = Math.min(
                34,
                slotWidth * 0.40,
                speedBoxH * 0.25
            );

            var currentRadius = Math.min(
                42,
                slotWidth * 0.47,
                speedBoxH * 0.34
            );

            var smallCircleY = speedBoxH * 0.4;

            var currentCircleY =
            smallCircleY + currentRadius - smallRadius;

            var signLabelY =
            smallCircleY - smallRadius - 6;


            // ----------------------------------------------------
            // SPEED SIGN DRAWING
            // ----------------------------------------------------

            function drawSpeedLimitSign(
                x,
                label,
                entry,
                radius,
                circleY,
                distance
            ) {

                ctx.fillStyle = '#ffffff';

                ctx.font = label === 'CURRENT'
                ? '800 14px sans-serif'
                : '700 13px sans-serif';

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.fillText(
                    label,
                    x,
                    signLabelY,
                    slotWidth - 3
                );


                // STOP octagon for NEXT or AFTER.
                if (
                    (label === 'NEXT' || label === 'AFTER') &&
                    entry[1] === 0
                ) {

                    ctx.beginPath();

                    for (var oi = 0; oi < 8; oi++) {

                        var angle = Math.PI / 8 + oi * Math.PI / 4;

                        var ox = x + Math.cos(angle) * radius;
                        var oy = circleY + Math.sin(angle) * radius;

                        if (oi === 0) {
                            ctx.moveTo(ox, oy);
                        } else {
                            ctx.lineTo(ox, oy);
                        }
                    }

                    ctx.closePath();
                    ctx.fillStyle = '#e21f26';
                    ctx.fill();

                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font =
                    '900 ' + Math.max(8, radius * 0.61) +
                    'px sans-serif';

                    ctx.fillText(
                        'STOP',
                        x,
                        circleY,
                        radius * 1.75
                    );

                } else {

                    ctx.beginPath();

                    ctx.arc(
                        x,
                        circleY,
                        radius,
                        0,
                        Math.PI * 2
                    );

                    ctx.fillStyle = '#d6262b';
                    ctx.fill();

                    ctx.beginPath();

                    ctx.arc(
                        x,
                        circleY,
                        Math.max(2, radius - 4),
                            0,
                            Math.PI * 2
                    );

                    ctx.fillStyle = '#f2eee3';
                    ctx.fill();

                    ctx.fillStyle = '#111111';
                    ctx.font =
                    '900 ' + Math.max(7, radius * 0.88) +
                    'px sans-serif';

                    ctx.fillText(
                        convertDisplayedSpeed(entry[1]),
                                 x,
                                 circleY - radius * 0.13,
                                 radius * 1.65
                    );

                    ctx.font =
                    '700 ' + Math.max(5, radius * 0.35) +
                    'px sans-serif';

                    ctx.fillText(
                        speedUnit,
                        x,
                        circleY + radius * 0.49,
                        radius * 1.65
                    );
                }


                // Distance below NEXT and AFTER.
                if (distance !== null) {

                    ctx.fillStyle = '#ffffff';
                    ctx.font = '700 13px sans-serif';

                    ctx.fillText(
                        formatSpeedDistance(distance),
                            x,
                            smallCircleY + smallRadius + 14,
                            slotWidth - 3
                    );
                }
            }


            // ----------------------------------------------------
            // CURRENT SIGN
            // ----------------------------------------------------

            if (currentSpeedLimit) {

                drawSpeedLimitSign(
                    slot5,
                    'CURRENT',
                    currentSpeedLimit,
                    currentRadius,
                    currentCircleY,
                    null
                );
            }


            // ----------------------------------------------------
            // SMALL CIRCLE FOR THE HIGHER SPEED UNDER THE TRAIN
            //
            // Exactly half the width and height of CURRENT.
            // Its edge touches the bottom-right edge of CURRENT.
            // No speed unit is drawn in this circle.
            // ----------------------------------------------------

            if (higherSpeedLimit) {

                var higherRadius = currentRadius / 2;

                var higherOffset =
                (currentRadius + higherRadius) / Math.sqrt(2);

                var higherX = slot5 + higherOffset;
                var higherY = currentCircleY + higherOffset;

                ctx.beginPath();

                ctx.arc(
                    higherX,
                    higherY,
                    higherRadius,
                    0,
                    Math.PI * 2
                );

                ctx.fillStyle = '#d6262b';
                ctx.fill();

                ctx.beginPath();

                ctx.arc(
                    higherX,
                    higherY,
                    Math.max(2, higherRadius - 2),
                        0,
                        Math.PI * 2
                );

                ctx.fillStyle = '#f2eee3';
                ctx.fill();

                ctx.fillStyle = '#111111';
                ctx.font =
                '900 ' + Math.max(6, higherRadius * 0.95) +
                'px sans-serif';

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.fillText(
                    convertDisplayedSpeed(higherSpeedLimit[1]),
                             higherX,
                             higherY,
                             higherRadius * 1.7
                );
            }


            // ----------------------------------------------------
            // TRAIN CLEARANCE TEXT
            //
            // One line along the bottom of the speed panel.
            // Starts at the left edge of the throttle slot and
            // extends beyond the right edge of CURRENT.
            //
            // Only displayed for an increase in the direction
            // of travel while different limits are under the train.
            // ----------------------------------------------------

            if (higherSpeedLimit) {

                var clearanceText =
                'Speed limit increases once entire train is out of the slower limit';

                var clearanceLeft = slotWidth * 2.5;

                var clearanceRight = slot5 + currentRadius;

                var clearanceWidth = clearanceRight - clearanceLeft;

                ctx.fillStyle = '#e3eaf3';
                ctx.font = '700 14px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';

                ctx.fillText(
                    clearanceText,
                    clearanceLeft,
                    speedBoxH - 5,
                    clearanceWidth
                );
            }


            // ----------------------------------------------------
            // NEXT
            // ----------------------------------------------------

            if (nextSpeedLimit) {

                drawSpeedLimitSign(
                    slot6,
                    'NEXT',
                    nextSpeedLimit,
                    smallRadius,
                    smallCircleY,
                    (nextSpeedLimit[0] - speedPosition) *
                    displayDirection
                );
            }


            // ----------------------------------------------------
            // AFTER
            // ----------------------------------------------------

            if (afterSpeedLimit) {

                drawSpeedLimitSign(
                    slot7,
                    'AFTER',
                    afterSpeedLimit,
                    smallRadius,
                    smallCircleY,
                    (afterSpeedLimit[0] - speedPosition) *
                    displayDirection
                );
            }

        } catch {}
    }


    // ============================================================
    // 8. RIGHT PANEL BACKGROUND
    // ============================================================

    try {

        ctx.fillStyle = '#101925';

        ctx.fillRect(
            panelX,
            0,
            panelTotalW,
            h
        );

    } catch {}


    // ============================================================
    // 9. NEUTRAL RIGHT PANEL
    // ============================================================

    if (neutral) {

        try {

            ctx.fillStyle = '#e3eaf3';
            ctx.font = '700 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillText(
                'Reverser is in neutral',
                panelX + panelTotalW / 2,
                h / 2,
                panelTotalW - 12
            );

        } catch {}

        return;
    }


    // ============================================================
    // 10. PANEL DIVIDER
    // ============================================================

    try {

        ctx.beginPath();
        ctx.moveTo(stationX + 0.5, 0);
        ctx.lineTo(stationX + 0.5, h);

        ctx.strokeStyle = '#758397';
        ctx.lineWidth = 1;
        ctx.stroke();

    } catch {}


    // ============================================================
    // 11. STATION DISPLAY
    // ============================================================

    try {

        var stations = route.stations;
        var stationIndex = stationprogression;

        var showStation =
        stationIndex >= 0 &&
        stationIndex < stations.length;

        var currentStation = stations[stationIndex];

        if (showStation) {

            var stationDistance = currentStation.distance;

            showStation =
            stationDistance >= current_route_items_routing[0][0] &&
            stationDistance <=
            current_route_items_routing[
                current_route_items_routing.length - 1
            ][0];
        }

        if (!showStation) {

            ctx.fillStyle = '#e3eaf3';
            ctx.font = '700 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillText(
                'no more stations',
                stationX + stationW / 2,
                h / 2,
                stationW - 8
            );

        } else {

            var indicatorX = stationX + stationW - 10;

            var stationInfoCentreX =
            (stationX + indicatorX) / 2;

            var stationRemainingDistance =
            (currentStation.distance - p) *
            displayDirection;


            // NEXT / STATION.
            ctx.fillStyle = '#e3eaf3';
            ctx.font = '700 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillText(
                'next',
                stationInfoCentreX,
                22,
                stationW - 12
            );

            ctx.fillText(
                'station',
                stationInfoCentreX,
                42,
                stationW - 12
            );


            // Distance.
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 18px sans-serif';

            ctx.fillText(
                (stationRemainingDistance >= -10 &&
                stationRemainingDistance <= 10
                ? stationRemainingDistance.toFixed(1)
                : Math.round(stationRemainingDistance)) + 'm',
                         stationInfoCentreX,
                         70,
                         stationW - 12
            );


            // Station name.
            var stationName = currentStation.name;
            var stationNameFontSize = 17;
            var stationNameMaxWidth = stationW - 8;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            while (stationNameFontSize > 7) {

                ctx.font =
                '700 ' + stationNameFontSize + 'px sans-serif';

                if (
                    ctx.measureText(stationName).width <=
                    stationNameMaxWidth
                ) {
                    break;
                }

                stationNameFontSize--;
            }

            while (
                ctx.measureText(stationName).width >
                stationNameMaxWidth
            ) {
                stationName = stationName.slice(0, -2) + '…';
            }

            var stationNameY = h - 12;

            ctx.font =
            '700 ' + stationNameFontSize + 'px sans-serif';

            ctx.fillStyle = '#ffffff';

            ctx.fillText(
                stationName,
                stationX + stationW / 2,
                stationNameY,
                stationNameMaxWidth
            );


            // Stop accuracy bar.
            if (stopaccuracy > 0) {

                var indicatorTop = 4;

                var indicatorBottom =
                stationNameY -
                stationNameFontSize / 2 -
                4;

                var indicatorHeight =
                indicatorBottom - indicatorTop;

                if (indicatorHeight > 12) {

                    var quarterHeight = indicatorHeight / 4;
                    var indicatorMiddle =
                    indicatorTop + indicatorHeight / 2;

                    ctx.fillStyle = '#c4a94f';

                    ctx.fillRect(
                        indicatorX - 2.5,
                        indicatorTop,
                        5,
                        quarterHeight
                    );

                    ctx.fillStyle = '#689568';

                    ctx.fillRect(
                        indicatorX - 2.5,
                        indicatorTop + quarterHeight,
                        5,
                        indicatorHeight / 2
                    );

                    ctx.fillStyle = '#c4a94f';

                    ctx.fillRect(
                        indicatorX - 2.5,
                        indicatorTop + quarterHeight * 3,
                        5,
                        quarterHeight
                    );


                    // Position arrow.
                    var positionRatio =
                    stationRemainingDistance /
                    (2 * stopaccuracy);

                    var arrowX = indicatorX - 11;

                    ctx.fillStyle = '#f1f4f8';
                    ctx.strokeStyle = '#202b38';
                    ctx.lineWidth = 1;

                    if (positionRatio > 1) {

                        ctx.beginPath();

                        ctx.moveTo(arrowX, indicatorTop - 1);
                        ctx.lineTo(arrowX - 9, indicatorTop + 11);
                        ctx.lineTo(arrowX - 3, indicatorTop + 11);
                        ctx.lineTo(arrowX - 3, indicatorTop + 23);
                        ctx.lineTo(arrowX + 3, indicatorTop + 23);
                        ctx.lineTo(arrowX + 3, indicatorTop + 11);
                        ctx.lineTo(arrowX + 9, indicatorTop + 11);

                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();

                    } else if (positionRatio < -1) {

                        ctx.beginPath();

                        ctx.moveTo(arrowX, indicatorBottom + 1);
                        ctx.lineTo(arrowX - 9, indicatorBottom - 11);
                        ctx.lineTo(arrowX - 3, indicatorBottom - 11);
                        ctx.lineTo(arrowX - 3, indicatorBottom - 23);
                        ctx.lineTo(arrowX + 3, indicatorBottom - 23);
                        ctx.lineTo(arrowX + 3, indicatorBottom - 11);
                        ctx.lineTo(arrowX + 9, indicatorBottom - 11);

                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();

                    } else {

                        var arrowY =
                        indicatorMiddle -
                        positionRatio * (indicatorHeight / 2);

                        ctx.beginPath();

                        ctx.moveTo(indicatorX - 2, arrowY);
                        ctx.lineTo(indicatorX - 20, arrowY - 9);
                        ctx.lineTo(indicatorX - 20, arrowY + 9);

                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                    }
                }
            }
        }

    } catch {}


    // ============================================================
    // 12. FIND UPCOMING ROUTE ITEMS
    // ============================================================

    try {

        for (
            var i = displayForward ? 0 : items.length - 1;

        displayForward
        ? i < items.length && upcoming.length < 4
        : i >= 0 && upcoming.length < 4;

        displayForward ? i++ : i--
        ) {

            var item = items[i];
            var d = item[1];

            if (
                displayForward
                ? d < routePosition
                : d > routePosition
            ) {
                continue;
            }

            if (
                item[0] === 'buffer' &&
                (
                    (displayForward && Math.abs(d - minD) < 0.01) ||
                    (displayReverse && Math.abs(d - maxD) < 0.01)
                )
            ) {
                continue;
            }

            if (
                item[0] === 'facingpoints' ||
                item[0] === 'nonfacingpoints' ||
                item[0] === 'conflictingpoints' ||
                item[0] === 'handover' ||
                item[0] === 'buffer'
            ) {

                upcoming.push({
                    data: item,
                    index: i
                });
            }
        }

    } catch {}


    // ============================================================
    // 13. ROUTE DIAGRAM
    // ============================================================

    try {

        var slot = h / 5;

        var size = Math.min(
            68,
            diagramW * 0.48,
            slot * 0.94
        );

        var cx = diagramX + diagramW / 2;

        var x1 = cx - size / 2;
        var x2 = cx + size / 2;

        var keyX = diagramX + diagramW * 0.85;
        var keySize = Math.min(25, slot * 0.57);

        var warningX =
        x2 + (keyX - keySize / 2 - x2) / 2;

        var keys = ['p', 'o', 'i', 'u'];
        var keyNo = 0;

        var allowPointsChange = allow_points_change;


        // --------------------------------------------------------
        // TRAIN POSITION
        // --------------------------------------------------------

        var trainY = displayForward
        ? slot * 4.65
        : slot * 0.28;

        ctx.fillStyle = '#26394e';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;

        ctx.fillRect(cx - 7, trainY - 11, 14, 22);
        ctx.strokeRect(cx - 7, trainY - 11, 14, 22);

        ctx.fillStyle = '#cbd8e7';

        ctx.fillRect(cx - 4, trainY - 6, 8, 4);
        ctx.fillRect(cx - 4, trainY + 2, 8, 3);


        // --------------------------------------------------------
        // ROUTE ITEMS
        // --------------------------------------------------------

        for (var i = 0; i < upcoming.length; i++) {

            var item = upcoming[i].data;
            var index = upcoming[i].index;

            var type = item[0];
            var d = item[1];

            var y = displayForward
            ? slot * (3.9 - i * 1.05)
            : slot * (1.2 + i * 0.9);

            var top = y - size / 2;
            var bottom = y + size / 2;

            var warningItem =
            type === 'conflictingpoints' ||
            type === 'buffer';


            // ITEM BACKGROUND.
            ctx.fillStyle = warningItem ? '#77400b' : '#000000';

            ctx.fillRect(x1, top, size, size);

            ctx.strokeStyle = warningItem ? '#f0a33a' : '#9aacc1';
            ctx.lineWidth = 1.5;

            ctx.strokeRect(x1, top, size, size);


            // DISTANCE.
            var pointDistance = Math.abs(d - routePosition);

            ctx.fillStyle = '#e3eaf3';
            ctx.font = '700 12px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            ctx.fillText(
                (pointDistance <= 10
                ? pointDistance.toFixed(1)
                : Math.round(pointDistance)) + 'm',
                         diagramX + 3,
                         y
            );


            // ====================================================
            // POINTS: ALWAYS DRAW TRACK PATHS
            // ====================================================

            if (
                type === 'facingpoints' ||
                type === 'nonfacingpoints' ||
                type === 'conflictingpoints'
            ) {

                var track = item[2];

                var prevTrack = index > 0
                ? items[index - 1][2]
                : track;

                var nextTrack = index + 1 < items.length
                ? items[index + 1][2]
                : track;

                var incoming = displayForward
                ? prevTrack
                : nextTrack;

                var otherExit = displayForward
                ? nextTrack
                : prevTrack;

                var split = displayForward
                ? type === 'facingpoints'
                : type === 'nonfacingpoints';

                var branchLeft = item[5] === true;

                if (displayReverse) {
                    branchLeft = !branchLeft;
                }

                var bx = cx +
                (branchLeft ? -1 : 1) * size * 0.31;

                var startY = displayForward
                ? bottom - 8
                : top + 8;

                var endY = displayForward
                ? top + 8
                : bottom - 8;

                var nodeY = split
                ? startY + (endY - startY) * 0.36
                : startY + (endY - startY) * 0.64;

                var conflict = type === 'conflictingpoints';
                var branchActive = incoming !== track;

                var branchTrack;
                var straightTrack;

                if (split) {

                    straightTrack = branchActive
                    ? otherExit
                    : track;

                    branchTrack = branchActive
                    ? track
                    : otherExit;

                } else {

                    straightTrack = branchActive
                    ? otherExit
                    : incoming;

                    branchTrack = branchActive
                    ? incoming
                    : otherExit;
                }


                // GREY BACKGROUND TRACK.
                ctx.beginPath();

                if (split) {

                    if (conflict) {

                        ctx.moveTo(cx, startY);
                        ctx.lineTo(cx, nodeY);

                        ctx.lineTo(
                            branchActive ? bx : cx,
                            endY
                        );

                    } else if (branchActive) {

                        ctx.moveTo(cx, nodeY);
                        ctx.lineTo(cx, endY);

                    } else {

                        ctx.moveTo(cx, nodeY);
                        ctx.lineTo(bx, endY);
                    }

                } else {

                    if (conflict) {

                        ctx.moveTo(
                            branchActive ? bx : cx,
                            startY
                        );

                        ctx.lineTo(cx, nodeY);
                        ctx.lineTo(cx, endY);

                    } else if (branchActive) {

                        ctx.moveTo(cx, startY);
                        ctx.lineTo(cx, nodeY);

                    } else {

                        ctx.moveTo(bx, startY);
                        ctx.lineTo(cx, nodeY);
                    }
                }

                ctx.strokeStyle = '#858585';
                ctx.lineWidth = 3.2;
                ctx.lineCap = 'round';
                ctx.stroke();


                // WHITE ACTIVE TRACK.
                ctx.beginPath();

                if (split) {

                    if (conflict) {

                        ctx.moveTo(cx, nodeY);

                        ctx.lineTo(
                            branchActive ? cx : bx,
                            endY
                        );

                    } else {

                        ctx.moveTo(cx, startY);
                        ctx.lineTo(cx, nodeY);

                        ctx.lineTo(
                            branchActive ? bx : cx,
                            endY
                        );
                    }

                } else {

                    if (conflict) {

                        ctx.moveTo(
                            branchActive ? cx : bx,
                            startY
                        );

                        ctx.lineTo(cx, nodeY);

                    } else {

                        ctx.moveTo(
                            branchActive ? bx : cx,
                            startY
                        );

                        ctx.lineTo(cx, nodeY);
                        ctx.lineTo(cx, endY);
                    }
                }

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3.2;
                ctx.stroke();


                // DEVELOPER TRACK LABELS.
                if (super_developer_mode) {

                    ctx.fillStyle = '#ff777b';
                    ctx.font = '700 7px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    if (split) {

                        ctx.fillText(String(incoming), cx, startY);
                        ctx.fillText(String(straightTrack), cx, endY);
                        ctx.fillText(String(branchTrack), bx, endY);

                    } else {

                        ctx.fillText(String(straightTrack), cx, startY);
                        ctx.fillText(String(branchTrack), bx, startY);
                        ctx.fillText(String(track), cx, endY);
                    }
                }


                // SWITCH NUMBER.
                ctx.fillStyle = '#65e3a0';
                ctx.font = '700 9px sans-serif';

                ctx.textAlign = branchLeft ? 'right' : 'left';
                ctx.textBaseline = 'middle';

                ctx.fillText(
                    item[4] === null ? '?' : String(item[4]),
                             branchLeft ? x2 - 3 : x1 + 3,
                             y
                );


                // ONLY THE KEYCAP AND DASHED CONNECTOR
                // DEPEND ON allow_points_change.
                if (allowPointsChange) {

                    ctx.beginPath();
                    ctx.setLineDash([3, 3]);

                    ctx.moveTo(x2 + 3, y);

                    ctx.lineTo(
                        keyX - keySize / 2 - 3,
                        y
                    );

                    ctx.strokeStyle = '#b5c3d4';
                    ctx.lineWidth = 1.3;
                    ctx.stroke();

                    ctx.setLineDash([]);

                    drawKeyCap(
                        keyX,
                        y,
                        keys[keyNo++],
                        keySize,
                        keySize,
                        13
                    );
                }


                // ====================================================
                // HANDOVER
                // ====================================================

            } else if (type === 'handover') {

                ctx.beginPath();

                ctx.moveTo(cx, top + 3);
                ctx.lineTo(cx, bottom - 3);

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.stroke();

                if (super_developer_mode) {

                    ctx.fillStyle = '#ff777b';
                    ctx.font = '700 8px sans-serif';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';

                    ctx.fillText(String(item[2]), cx, top + 7);
                    ctx.fillText(String(item[3]), cx, bottom - 7);
                }


                // ====================================================
                // BUFFER
                // ====================================================

            } else if (type === 'buffer') {

                var barY = displayForward
                ? top + size * 0.27
                : bottom - size * 0.27;

                ctx.beginPath();

                ctx.moveTo(
                    cx,
                    displayForward ? bottom - 3 : top + 3
                );

                ctx.lineTo(cx, barY);

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.stroke();


                ctx.beginPath();

                ctx.moveTo(x1 + 4, barY);
                ctx.lineTo(x2 - 4, barY);

                ctx.strokeStyle = '#f04f52';
                ctx.lineWidth = 4;
                ctx.stroke();

                if (super_developer_mode) {

                    ctx.fillStyle = '#ff777b';
                    ctx.font = '700 8px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    ctx.fillText(
                        String(item[2]),
                                 cx,
                                 displayForward ? bottom - 7 : top + 7
                    );
                }
            }


            // WARNING TRIANGLE.
            if (warningItem) {

                var ts = Math.min(
                    42,
                    diagramW * 0.14,
                    slot * 0.75
                );

                ctx.beginPath();

                ctx.moveTo(warningX, y - ts);
                ctx.lineTo(warningX - ts, y + ts * 0.85);
                ctx.lineTo(warningX + ts, y + ts * 0.85);

                ctx.closePath();

                ctx.fillStyle = '#ffff00';
                ctx.fill();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.fillStyle = '#30200a';
                ctx.font = '900 ' + Math.max(16, ts * 0.95) +
                'px sans-serif';

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.fillText('!', warningX, y + 2);
            }
        }

    } catch {}


    // ============================================================
    // 14. CRASH OVERLAY ON ROUTE DIAGRAM
    // ============================================================

    try {

        if (isCrashed) {

            ctx.fillStyle = 'rgba(0,0,0,0.85)';

            ctx.fillRect(
                panelX + 3,
                h * 0.40,
                panelTotalW - 6,
                h * 0.20
            );

            ctx.fillStyle = '#ff3030';

            ctx.font =
            '900 ' + Math.min(38, panelTotalW * 0.18) +
            'px sans-serif';

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillText(
                'CRASHED!',
                panelX + panelTotalW / 2,
                h * 0.5
            );
        }

    } catch {}
}



















































































































































































































































































































































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
var power_notches = 4;
var brake_notches = 6;

var key_a = false;
var key_d = false;
var current_throttle = 0;
var throttle_notch = 0;
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
    const float uNear = 0.01;
    const float uFar = 2000.0;

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
    /*
    if (profileFrame < 200) return;

    var now = performance.now();

    if (profileLast !== null) {
        profileTimes[section] = (profileTimes[section] || 0) + now - profileLast;
    }

    profileLast = now;
    */
}

function profileMarkEnd() {
    /*
    if (profileFrame < 200) {
        profileFrame++;
        return;
    }

    console.table(profileTimes);

    profileFrame = 1;
    profileLast = null;
    profileTimes = {};
    */
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

var doorDeltaTime = Math.max(0,(the_time - last_time)/ 1000);var doorSpeedSeconds = Number(door_speed);if(!Number.isFinite(doorSpeedSeconds)|| doorSpeedSeconds <= 0){doorSpeedSeconds = 0.001;}var doorAlarmSeconds = Number(door_alarm);if(!Number.isFinite(doorAlarmSeconds)|| doorAlarmSeconds < 0){doorAlarmSeconds = 0;}var doorMovement = doorDeltaTime / doorSpeedSeconds;if(left_doors_mode === 1){left_doors = Math.min(1,Math.max(0,Number(left_doors)|| 0)+ doorMovement);if(left_doors >= 1){left_doors = 1;left_doors_mode = 2;}}else if(left_doors_mode === 2){left_doors = 1;}else if(left_doors_mode < 0){left_doors = 1;if(the_time >=(0 - left_doors_mode)){left_doors_mode = 4;}}else if(left_doors_mode === 4){left_doors = Math.max(0,(Number(left_doors)|| 0)- doorMovement);if(left_doors <= 0){left_doors = 0;left_doors_mode = 0;}}else if(left_doors_mode === 0){left_doors = 0;}if(right_doors_mode === 1){right_doors = Math.min(1,Math.max(0,Number(right_doors)|| 0)+ doorMovement);if(right_doors >= 1){right_doors = 1;right_doors_mode = 2;}}else if(right_doors_mode === 2){right_doors = 1;}else if(right_doors_mode < 0){right_doors = 1;if(the_time >=(0 - right_doors_mode)){right_doors_mode = 4;}}else if(right_doors_mode === 4){right_doors = Math.max(0,(Number(right_doors)|| 0)- doorMovement);if(right_doors <= 0){right_doors = 0;right_doors_mode = 0;}}else if(right_doors_mode === 0){right_doors = 0;}



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

    ctx_controls_canvas.clearRect(
        0,
        0,
        controls_canvas.width,
        controls_canvas.height
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
    Math.max(0, pos - DRAW_AHEAD);

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
    profileMark("controls_canvas");
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















    ////////////////////  smooth throttle if over 50 notches

    if((reverser != 0)&& allow_driving_keys && !crashed && fps > 0){ if(key_a){if(throttle_notch < 0 && brake_notches > 50){throttle_notch += 50 / fps;if(throttle_notch > 0)throttle_notch = 0;var notchA = Math.round(throttle_notch);throttle =(notchA < 0)? Math.floor(100 *(0 -(notchA / brake_notches))):0;}else if(throttle_notch > 0 && power_notches > 50){throttle_notch += 50 / fps;if(throttle_notch > power_notches)throttle_notch = power_notches;throttle = Math.floor(100 *(Math.round(throttle_notch)/ power_notches));}current_throttle = 0;if(throttle_notch<0){current_throttle = Math.floor(100*(throttle_notch/brake_notches))}if(throttle_notch>0){current_throttle = Math.floor(100*(throttle_notch/power_notches))}} if(key_d){if(throttle_notch > 0 && power_notches > 50){throttle_notch -= 100 / fps;if(throttle_notch < 0)throttle_notch = 0;var notchD = Math.round(throttle_notch);throttle =(notchD > 0)? Math.floor(100 *(notchD / power_notches)):0;}else if(throttle_notch < 0 && brake_notches > 50){throttle_notch -= 100 / fps;if(throttle_notch <(0 - brake_notches))throttle_notch =(0 - brake_notches);throttle = Math.floor(100 *(0 -(Math.round(throttle_notch)/ brake_notches)));}current_throttle = 0;if(throttle_notch<0){current_throttle = Math.floor(100*(throttle_notch/brake_notches))}if(throttle_notch>0){current_throttle = Math.floor(100*(throttle_notch/power_notches))}}}















    // --------------------------------------------------------
    // REPORT PERFORMANCE EVERY TWO SECONDS
    // --------------------------------------------------------

   profileMarkEnd()






    if (!renderLoopRunning) return;

    renderAnimationFrameId =
    requestAnimationFrame(render);
}





















