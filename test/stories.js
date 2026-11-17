

//    chicken1 to chicken99 have vars you can use inside a story

//   allow_number_keys    set this to false to stop the user changing view
//   allow_driving_keys    set this to false to stop the user driving
//

const stories = [
    {
        name: "Birmingham Canal Boat",
        fileName: "1.zip",
        storyFileName: "s1.zip",
        numberOfOpus: 2,
        snowing: false,
        nighttime: false,
        gauge: 1435,

        developer_train: "UK Class 323",
        developer_vf: "Hitachi High Speed (140 mph)",
        developer_livery: "Regional Railways",
        developer_coaches: 3,

        use_metric: false,

        scripts: {




            beforeStartup() {
                    //allow_number_keys = false;  //  the camera is controlled by the story
                globalThis.boat_mode = true;



                // Track configuration
                globalThis.pos = 17962;  // start position
                globalThis.current_track = 2;  // which track to start on






                    globalThis.block_length = 25;  // track block ength
                    globalThis.driving_on_track = 0; // The track the user drives on. If it needs changing mid route use the route_eval to dynamically change;
                    globalThis.allow_points_change = false;  // Allow the user to change points
                    globalThis.points_speed_limit = 25;  // The speed limit when going over points when not on main route
                    globalThis.flip_out = false;  // The train runs in reverse as default

                    ///// NPC TRAIN SETTINGS
                    globalThis.pos_npc = 18500;  // start position of npc train
                    globalThis.current_track_npc = 1;  // which track npc train starts onn
                    globalThis.accel_npc = 0;  // the accel of the npc train
                    globalThis.speed_npc = 0;  // the speed of the npc train
                    globalThis.upper_speed_limit_npc = 0;  // The max speed of npc train
                    globalThis.lower_speed_limit_npc = 0;  // The min speed of npc train


                    //    globalThis.textureoverrides = [6,-1];

                    // todo 6 is null and others are canal. Find a way to load other items as free objects
                    globalThis.textureoverrides = [
                        [6, -2],
                        [14, -2],
                        [15, -2],
                        [16, -2],
                        [17, -2],
                        [45, -2],
                        [46, -2]
                    ]; // Lists which textures should relate to which track id. So textureoverrides = [[1,7]] means track 1 has texture 7. Set it to -1 for the track to not show.  -1 means track does not show and points will not be created, and -2 means track doesn't show but points will still be processed.  -1 means track does not show and points will not be created, and -2 means track doesn't show but points will still be processed

                    // Terrain and curves
                    globalThis.TRACK_GRADIENT_SCALE = 0.2; // How much should the route have terrain
                    globalThis.curveMultiplier = 1.3; // How tight should the curves be



                    // Pitch settings
                    globalThis.wall_follow_pitch = true; // Set these to adjust to the route developers discrpency of how the route was built
                    globalThis.dike_follow_pitch = true; // Set these to adjust to the route developers discrpency of how the route was built
                    globalThis.form_follow_pitch = true; // Set these to adjust to the route developers discrpency of how the route was built
                    globalThis.freeobj_follow_pitch = false; // Set these to adjust to the route developers discrpency of how the route was built
                    globalThis.ground_follow_pitch = true; // Set these to adjust to the route developers discrpency of how the route was built

                    // Track dimensions
                    globalThis.RAIL_WIDTH = 0.0525; // Width of an indervidual rail
                    globalThis.pointsMovingLength = 15;  // The length of the points blades (in meters)
                    globalThis.pointsMovedDistance = 3;  // the amount of distance the points move (in railwidths)
                    globalThis.RAIL_VERTICAL_OFFSET = -0.15; // The change in Y position of the rails
                    globalThis.RAIL_HEIGHT = 0.13; // Height of the indervidual rail
                    globalThis.BED_HALF_WIDTH = 1.20; // Width of the sleepers (distance either side, so half of sleeper width)
                    globalThis.OUTER_BED_HALF_WIDTH = 2.2; // Width of the edge of the trackbed beyond the sleepers
                    globalThis.BED_EDGE_HEIGHT = -0.15; // How much should the sleeper mesh drop either side
                    globalThis.BED_CROWN_HEIGHT = -0.09; // Height in the very middle of the sleepers
                    globalThis.OUTER_BED_EDGE_HEIGHT = -0.35; // How much should the outer bed mesh drop either side
                    globalThis.MAX_GRADE = 0.035; // Maximum grade
                    globalThis.VERTICAL_SMOOTH_DISTANCE = 28.0; // Vertical smoothing distance

                    // Rendering
                    globalThis.FOV_DEG = 68; // Field of view in degrees

                    globalThis.NEAR = 1.0; // Near clipping distance

                    // Gameplay
                    globalThis.stopaccuracy = 2; // Difficulty of the gameplay when stopping at station
                    globalThis.freeroamX = 4.5; // When in freeroam mode how far can the player walk away from the train
                    globalThis.freeroamY = 0; // platform height
                    globalThis.stationprogression = 0; // What is the next station to stop at
                    globalThis.signalprogression_forwards = 0; // the next signal to be red in forwards direction
                    globalThis.signalprogression_reverse = 4; // the next signal to be red in reverse direction set to 1000 if reverse is not allowed
                    globalThis.signalprogression_reverse_offset = 100;  // how far should reverse signal be from forwards signal  (set to platform length)

                    globalThis.difficulty = 0; // How hard the game it

                    // Track detection
                    globalThis.ZERO_RAIL_TOLERANCE = 0.2; // This removes non tracks from showing as tracks. If a track is not showing reduce the number. It should be between 0 and 1

                    // Environment
                    globalThis.BACKGROUND_RGB = [0.47, 0.63, 0.74];

                    // Lighting
                    globalThis.TRACK_BRIGHTNESS_SMOOTHING = 0.20; // The smoothing of the track brightness
                    globalThis.full_brightness = 200; // Any brightness above this sould be treated as full (0 - 255)
                    globalThis.min_brightness = 85; // Lowest brightness (0 - 255)
                    globalThis.weather_brightness_threshhold = 200;
                    globalThis.route_contains_translucent_textured_faces = false;  // set to true if there is a textured surface that is translucent

            },
            onFirstFrame() {
                train_floor_height = 0;
                cameraXOffset = 0;
                traindoors[0][5] = 0.8
            },

            onEveryFrame(deltaTime) {
                if (globalThis.pos > 700) {
                    globalThis.BACKGROUND_RGB = [0, 0, 0];
                } else {
                    globalThis.BACKGROUND_RGB = [0.7, 0.3, 0.4];
                }

                if ((pos > 18400) && (chicken1 == null)){
                    chicken1 = true;
                    globalThis.freeroamY = 0.5; // platform height  bodging a bug

                    pos_npc = 18500;  // start position of npc train
                    current_track_npc = 1;  // which track npc train starts onn
                    accel_npc = 0;  // the accel of the npc train
                    speed_npc = -60;
                    upper_speed_limit_npc = 60;
                    lower_speed_limit_npc = -60;
                    //playRouteAudio(0);
                }

                if ((pos > 19000) && (chicken2 == null)){
                    chicken2 = true
                    //playRouteAudio(1, true);
                }
                if ((pos > 20000) && (chicken3 == null)){
                    chicken3 = true
                    //stopRouteAudio(1);
                }


            }
        }
    }








];
